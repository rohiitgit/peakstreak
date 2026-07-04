import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { currentUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { localDateString } from "@/lib/dates"
import { requireEnrollment } from "@/lib/dashboard"
import { recordCompletion } from "@/lib/progress"
import { getUser } from "@/lib/user"

const AUTO_COMPLETE_THRESHOLD = 0.8

const bodySchema = z.object({
  enrollmentId: z.string().uuid(),
  videoId: z.string().uuid(),
  // Watched seconds since the last heartbeat. Clamped server-side; the
  // client is a hint, never an authority.
  deltaSeconds: z.number().min(0).max(300),
  positionSeconds: z.number().min(0),
})

/**
 * PS-6: watch-time heartbeat. Accumulates genuine watching (the client
 * counts wall-clock playing time, not playhead position) and applies the
 * 80% auto-completion threshold server-side.
 */
export async function POST(request: Request) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "invalid_body" }, { status: 400 })
  }
  const { enrollmentId, videoId, deltaSeconds, positionSeconds } = parsed.data

  const enrollment = await requireEnrollment(userId, enrollmentId)
  if (!enrollment) return Response.json({ error: "not_found" }, { status: 404 })

  const video = await db.query.videos.findFirst({ where: eq(schema.videos.id, videoId) })
  if (!video) return Response.json({ error: "not_found" }, { status: 404 })

  const now = new Date()
  const delta = Math.round(deltaSeconds)
  const position = Math.min(Math.round(positionSeconds), video.durationSeconds)

  const [progress] = await db
    .insert(schema.videoProgress)
    .values({
      userPlaylistId: enrollmentId,
      videoId,
      secondsWatched: Math.min(delta, video.durationSeconds),
      furthestPositionSeconds: position,
      lastWatchedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.videoProgress.userPlaylistId, schema.videoProgress.videoId],
      set: {
        secondsWatched: sql`least(${video.durationSeconds}, ${schema.videoProgress.secondsWatched} + ${delta})`,
        furthestPositionSeconds: sql`greatest(${schema.videoProgress.furthestPositionSeconds}, ${position})`,
        lastWatchedAt: now,
        updatedAt: now,
      },
    })
    .returning()

  // Watch time also lands on today's activity row (heatmap tooltip data);
  // it does NOT make the day count for the streak — only completions do.
  if (delta > 0) {
    const user = await getUser(userId)
    const activityDate = localDateString(now, user.timezone)
    await db
      .insert(schema.dailyActivity)
      .values({ userId, activityDate, videosCompleted: 0, secondsWatched: delta })
      .onConflictDoUpdate({
        target: [schema.dailyActivity.userId, schema.dailyActivity.activityDate],
        set: {
          secondsWatched: sql`${schema.dailyActivity.secondsWatched} + ${delta}`,
          updatedAt: now,
        },
      })
  }

  let completion = null
  const threshold = Math.floor(video.durationSeconds * AUTO_COMPLETE_THRESHOLD)
  if (!progress!.isCompleted && progress!.secondsWatched >= threshold && threshold > 0) {
    completion = await recordCompletion({ userId, userPlaylistId: enrollmentId, videoId })
  }

  return Response.json({
    secondsWatched: progress!.secondsWatched,
    isCompleted: progress!.isCompleted || completion?.changed === true,
    autoCompleted: completion?.changed ?? false,
    firstCompletionToday: completion?.firstCompletionToday ?? false,
    playlistCompleted: completion?.playlistCompleted ?? false,
  })
}
