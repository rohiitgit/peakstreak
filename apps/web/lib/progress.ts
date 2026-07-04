import { and, eq, sql } from "drizzle-orm"

import { track } from "@/lib/analytics"
import { db, schema, type Db } from "@/lib/db"
import { addDays, daysBetween, localDateString } from "@/lib/dates"
import { estimateDays, type Pace } from "@/lib/pace"

/**
 * PS-7: the single source of truth for progress writes. Streaks, the
 * dashboard, reminder emails, and the heatmap all read state this module
 * produces. Route handlers must never write video_progress/daily_activity
 * directly.
 */

export interface CompletionResult {
  /** False when the video was already completed (idempotent no-op). */
  changed: boolean
  /** True when this was the user's first completion of their local day. */
  firstCompletionToday: boolean
  /** True when this completion finished the whole playlist. */
  playlistCompleted: boolean
  /** The user-local date the completion was attributed to. */
  activityDate: string
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function loadEnrollmentForUser(tx: Tx, userId: string, userPlaylistId: string) {
  const enrollment = await tx.query.userPlaylists.findFirst({
    where: and(
      eq(schema.userPlaylists.id, userPlaylistId),
      eq(schema.userPlaylists.userId, userId),
    ),
  })
  if (!enrollment) throw new Error("Enrollment not found")
  return enrollment
}

/** Available-video total and completed count for an enrollment. */
async function playlistProgressCounts(tx: Tx, playlistId: string, userPlaylistId: string) {
  const [totals] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.playlistVideos)
    .innerJoin(schema.videos, eq(schema.playlistVideos.videoId, schema.videos.id))
    .where(and(eq(schema.playlistVideos.playlistId, playlistId), eq(schema.videos.isAvailable, true)))

  const [done] = await tx
    .select({ completed: sql<number>`count(*)::int` })
    .from(schema.videoProgress)
    .where(
      and(
        eq(schema.videoProgress.userPlaylistId, userPlaylistId),
        eq(schema.videoProgress.isCompleted, true),
      ),
    )

  return { total: totals?.total ?? 0, completed: done?.completed ?? 0 }
}

/**
 * Marks a video complete. Idempotent: double-firing (auto-complete racing
 * a manual click, retried requests) produces exactly one completion and
 * one daily_activity increment — enforced by an atomic conditional upsert,
 * not by read-then-write.
 */
export async function recordCompletion(input: {
  userId: string
  userPlaylistId: string
  videoId: string
  manual?: boolean
  /** Injectable clock for date-boundary tests. */
  now?: Date
}): Promise<CompletionResult> {
  const now = input.now ?? new Date()

  return db.transaction(async (tx) => {
    const enrollment = await loadEnrollmentForUser(tx, input.userId, input.userPlaylistId)
    const user = await tx.query.users.findFirst({ where: eq(schema.users.id, input.userId) })
    if (!user) throw new Error("User not found")

    const activityDate = localDateString(now, user.timezone)

    // Atomic "complete if not already completed": the WHERE guard on the
    // conflict update makes concurrent double-fires resolve to one winner.
    const marked = await tx
      .insert(schema.videoProgress)
      .values({
        userPlaylistId: input.userPlaylistId,
        videoId: input.videoId,
        isCompleted: true,
        completedAt: now,
        completedManually: input.manual ?? false,
        lastWatchedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.videoProgress.userPlaylistId, schema.videoProgress.videoId],
        set: {
          isCompleted: true,
          completedAt: now,
          completedManually: input.manual ?? false,
          lastWatchedAt: now,
          updatedAt: now,
        },
        setWhere: sql`${schema.videoProgress.isCompleted} = false`,
      })
      .returning({ id: schema.videoProgress.id })

    if (marked.length === 0) {
      return {
        changed: false,
        firstCompletionToday: false,
        playlistCompleted: false,
        activityDate,
      }
    }

    // Upsert today's activity row; the unique (user, date) constraint makes
    // this safe under concurrency and cron re-runs.
    const [activity] = await tx
      .insert(schema.dailyActivity)
      .values({ userId: input.userId, activityDate, videosCompleted: 1 })
      .onConflictDoUpdate({
        target: [schema.dailyActivity.userId, schema.dailyActivity.activityDate],
        set: {
          videosCompleted: sql`${schema.dailyActivity.videosCompleted} + 1`,
          updatedAt: now,
        },
      })
      .returning({ videosCompleted: schema.dailyActivity.videosCompleted })

    const firstCompletionToday = activity?.videosCompleted === 1

    const { total, completed } = await playlistProgressCounts(
      tx,
      enrollment.playlistId,
      input.userPlaylistId,
    )
    const playlistCompleted = total > 0 && completed >= total

    if (playlistCompleted && enrollment.status !== "completed") {
      await tx
        .update(schema.userPlaylists)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(schema.userPlaylists.id, input.userPlaylistId))
    }

    return { changed: true, firstCompletionToday, playlistCompleted, activityDate }
  }).then(async (result) => {
    if (result.changed) {
      const properties = { videoId: input.videoId, enrollmentId: input.userPlaylistId }
      await track("video_completed", { userId: input.userId, properties })
      if (result.firstCompletionToday) await track("streak_extended", { userId: input.userId })
      if (result.playlistCompleted) {
        await track("playlist_completed", { userId: input.userId, properties })
      }
    }
    return result
  })
}

/**
 * Rolls back a completion (mis-click). Decrements the daily_activity row
 * of the day the completion was originally attributed to — removing the
 * row entirely only when nothing else happened that day.
 */
export async function uncompleteVideo(input: {
  userId: string
  userPlaylistId: string
  videoId: string
  now?: Date
}): Promise<{ changed: boolean }> {
  const now = input.now ?? new Date()

  return db.transaction(async (tx) => {
    const enrollment = await loadEnrollmentForUser(tx, input.userId, input.userPlaylistId)
    const user = await tx.query.users.findFirst({ where: eq(schema.users.id, input.userId) })
    if (!user) throw new Error("User not found")

    // Lock the row so a racing uncomplete can't double-decrement, and
    // capture the original completion time — the rollback must hit the
    // local day the completion was attributed to, not today.
    const [row] = await tx
      .select()
      .from(schema.videoProgress)
      .where(
        and(
          eq(schema.videoProgress.userPlaylistId, input.userPlaylistId),
          eq(schema.videoProgress.videoId, input.videoId),
        ),
      )
      .for("update")

    if (!row?.isCompleted || !row.completedAt) return { changed: false }
    const originalDate = localDateString(row.completedAt, user.timezone)

    await tx
      .update(schema.videoProgress)
      .set({ isCompleted: false, completedAt: null, completedManually: false, updatedAt: now })
      .where(eq(schema.videoProgress.id, row.id))

    const [activity] = await tx
      .select()
      .from(schema.dailyActivity)
      .where(
        and(
          eq(schema.dailyActivity.userId, input.userId),
          eq(schema.dailyActivity.activityDate, originalDate),
        ),
      )
      .for("update")

    if (activity) {
      const remaining = Math.max(0, activity.videosCompleted - 1)
      if (remaining === 0 && activity.secondsWatched === 0 && !activity.isFrozen) {
        await tx.delete(schema.dailyActivity).where(eq(schema.dailyActivity.id, activity.id))
      } else {
        await tx
          .update(schema.dailyActivity)
          .set({ videosCompleted: remaining, updatedAt: now })
          .where(eq(schema.dailyActivity.id, activity.id))
      }
    }

    if (enrollment.status === "completed") {
      await tx
        .update(schema.userPlaylists)
        .set({ status: "active", completedAt: null, updatedAt: now })
        .where(eq(schema.userPlaylists.id, input.userPlaylistId))
    }

    return { changed: true }
  })
}

// ── ETA recalculation (pure) ────────────────────────────────────

export interface EtaInput {
  remainingSeconds: number
  remainingVideos: number
  completedSeconds: number
  completedVideos: number
  pace: Pace
  playbackSpeed: number
  /** Local date the enrollment started (user timezone). */
  startDate: string
  /** Local date today (user timezone). */
  today: string
  targetFinishDate?: string | null
}

export interface Eta {
  projectedFinishDate: string
  daysRemaining: number
  /** Positive = ahead of the original plan, negative = behind. Null without a target. */
  aheadDays: number | null
  /** Whether the projection uses observed pace or the chosen plan. */
  source: "actual" | "planned"
}

/**
 * Recomputes the finish date. With completion history, projects from the
 * user's *observed* pace (what they actually do beats what they promised);
 * with no history yet, falls back to the chosen plan.
 */
export function computeEta(input: EtaInput): Eta {
  const finished = input.remainingVideos <= 0

  if (finished) {
    return {
      projectedFinishDate: input.today,
      daysRemaining: 0,
      aheadDays: input.targetFinishDate ? daysBetween(input.today, input.targetFinishDate) : null,
      source: "actual",
    }
  }

  let daysRemaining: number
  let source: Eta["source"]

  if (input.completedVideos > 0) {
    source = "actual"
    // Observed daily rate since the start (inclusive day count ≥ 1).
    const daysElapsed = Math.max(1, daysBetween(input.startDate, input.today) + 1)
    if (input.pace.type === "videos_per_day") {
      const videosPerDay = input.completedVideos / daysElapsed
      daysRemaining = Math.ceil(input.remainingVideos / videosPerDay)
    } else {
      const secondsPerDay = input.completedSeconds / daysElapsed
      daysRemaining =
        secondsPerDay > 0
          ? Math.ceil(input.remainingSeconds / secondsPerDay)
          : estimateDays({
              remainingSeconds: input.remainingSeconds,
              remainingVideos: input.remainingVideos,
              pace: input.pace,
              playbackSpeed: input.playbackSpeed,
            })
    }
  } else {
    source = "planned"
    daysRemaining = estimateDays({
      remainingSeconds: input.remainingSeconds,
      remainingVideos: input.remainingVideos,
      pace: input.pace,
      playbackSpeed: input.playbackSpeed,
    })
  }

  const projectedFinishDate = addDays(input.today, daysRemaining)
  return {
    projectedFinishDate,
    daysRemaining,
    aheadDays: input.targetFinishDate
      ? daysBetween(projectedFinishDate, input.targetFinishDate)
      : null,
    source,
  }
}

/** Deep-link target for "Continue": the lowest-position uncompleted video. */
export async function nextUnwatchedVideo(userPlaylistId: string) {
  const enrollment = await db.query.userPlaylists.findFirst({
    where: eq(schema.userPlaylists.id, userPlaylistId),
  })
  if (!enrollment) return null

  const rows = await db
    .select({
      videoId: schema.videos.id,
      youtubeVideoId: schema.videos.youtubeVideoId,
      title: schema.videos.title,
      position: schema.playlistVideos.position,
    })
    .from(schema.playlistVideos)
    .innerJoin(schema.videos, eq(schema.playlistVideos.videoId, schema.videos.id))
    .leftJoin(
      schema.videoProgress,
      and(
        eq(schema.videoProgress.videoId, schema.videos.id),
        eq(schema.videoProgress.userPlaylistId, userPlaylistId),
      ),
    )
    .where(
      and(
        eq(schema.playlistVideos.playlistId, enrollment.playlistId),
        eq(schema.videos.isAvailable, true),
        sql`coalesce(${schema.videoProgress.isCompleted}, false) = false`,
      ),
    )
    .orderBy(schema.playlistVideos.position)
    .limit(1)

  return rows[0] ?? null
}
