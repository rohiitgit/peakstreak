import { and, eq, gte, ne, sql } from "drizzle-orm"

import { db, schema } from "@/lib/db"
import { addDays, localDateString } from "@/lib/dates"
import { computeEta, nextUnwatchedVideo, type Eta } from "@/lib/progress"
import { getStreakSummary, type StreakSummary } from "@/lib/streaks"
import { getUser } from "@/lib/user"

export interface DashboardEnrollment {
  id: string
  status: "active" | "completed" | "archived"
  title: string
  channelTitle: string | null
  thumbnailUrl: string | null
  videoCount: number
  unavailableCount: number
  completedCount: number
  totalDurationSeconds: number
  completedSeconds: number
  eta: Eta
  continueVideoId: string | null
  completedAt: Date | null
  startedAt: Date
}

export interface DashboardData {
  active: DashboardEnrollment[]
  completed: DashboardEnrollment[]
  archived: DashboardEnrollment[]
  streak: StreakSummary
  activityDays: Array<{
    activityDate: string
    videosCompleted: number
    isFrozen: boolean
    secondsWatched: number
  }>
  today: string
}

export async function getDashboard(userId: string, now: Date = new Date()): Promise<DashboardData> {
  const user = await getUser(userId)
  const today = localDateString(now, user.timezone)

  const rows = await db
    .select({
      enrollment: schema.userPlaylists,
      playlist: schema.playlists,
      completedCount: sql<number>`
        coalesce((
          select count(*)::int from video_progress vp
          where vp.user_playlist_id = ${schema.userPlaylists.id} and vp.is_completed
        ), 0)`,
      completedSeconds: sql<number>`
        coalesce((
          select sum(v.duration_seconds)::int from video_progress vp
          join videos v on v.id = vp.video_id
          where vp.user_playlist_id = ${schema.userPlaylists.id} and vp.is_completed
        ), 0)`,
    })
    .from(schema.userPlaylists)
    .innerJoin(schema.playlists, eq(schema.userPlaylists.playlistId, schema.playlists.id))
    .where(and(eq(schema.userPlaylists.userId, userId)))
    .orderBy(sql`${schema.userPlaylists.startedAt} desc`)

  const enrollments: DashboardEnrollment[] = []
  for (const row of rows) {
    const remainingVideos = Math.max(0, row.playlist.videoCount - row.completedCount)
    const remainingSeconds = Math.max(
      0,
      row.playlist.totalDurationSeconds - row.completedSeconds,
    )
    const eta = computeEta({
      remainingSeconds,
      remainingVideos,
      completedSeconds: row.completedSeconds,
      completedVideos: row.completedCount,
      pace: { type: row.enrollment.paceType, value: row.enrollment.paceValue },
      playbackSpeed: Number(row.enrollment.playbackSpeed),
      startDate: localDateString(row.enrollment.startedAt, user.timezone),
      today,
      targetFinishDate: row.enrollment.targetFinishDate,
    })

    const next =
      row.enrollment.status === "active" ? await nextUnwatchedVideo(row.enrollment.id) : null

    enrollments.push({
      id: row.enrollment.id,
      status: row.enrollment.status,
      title: row.playlist.title,
      channelTitle: row.playlist.channelTitle,
      thumbnailUrl: row.playlist.thumbnailUrl,
      videoCount: row.playlist.videoCount,
      unavailableCount: row.playlist.unavailableCount,
      completedCount: row.completedCount,
      totalDurationSeconds: row.playlist.totalDurationSeconds,
      completedSeconds: row.completedSeconds,
      eta,
      continueVideoId: next?.videoId ?? null,
      completedAt: row.enrollment.completedAt,
      startedAt: row.enrollment.startedAt,
    })
  }

  const streak = await getStreakSummary(userId, user.timezone, now)

  const activityDays = await db
    .select({
      activityDate: schema.dailyActivity.activityDate,
      videosCompleted: schema.dailyActivity.videosCompleted,
      isFrozen: schema.dailyActivity.isFrozen,
      secondsWatched: schema.dailyActivity.secondsWatched,
    })
    .from(schema.dailyActivity)
    .where(
      and(
        eq(schema.dailyActivity.userId, userId),
        gte(schema.dailyActivity.activityDate, addDays(today, -366)),
      ),
    )

  return {
    active: enrollments.filter((e) => e.status === "active"),
    completed: enrollments.filter((e) => e.status === "completed"),
    archived: enrollments.filter((e) => e.status === "archived"),
    streak,
    activityDays,
    today,
  }
}

/** Guard: the enrollment must belong to the user and not be deleted. */
export async function requireEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await db.query.userPlaylists.findFirst({
    where: and(
      eq(schema.userPlaylists.id, enrollmentId),
      eq(schema.userPlaylists.userId, userId),
      ne(schema.userPlaylists.status, "archived"),
    ),
  })
  return enrollment ?? null
}
