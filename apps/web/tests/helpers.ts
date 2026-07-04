/**
 * DB seed helpers for integration tests. The env-bootstrap import must
 * stay first — it redirects DATABASE_URL to the test database before
 * lib/db initializes its pool.
 */
import "./env-bootstrap"

import { sql } from "drizzle-orm"

import { db, schema } from "@/lib/db"

export { db, schema }

export async function resetDb() {
  await db.execute(sql`
    truncate users, playlists, videos, playlist_videos, user_playlists,
      video_progress, daily_activity, notes, email_preferences, email_log,
      events cascade
  `)
}

let seq = 0

export async function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  seq++
  const [user] = await db
    .insert(schema.users)
    .values({ email: `user${seq}-${Date.now()}@test.dev`, timezone: "Asia/Kolkata", ...overrides })
    .returning()
  return user!
}

/** A playlist with `count` videos of `durationSeconds` each, plus an enrollment. */
export async function seedEnrollment(input: {
  userId: string
  videoCount: number
  durationSeconds?: number
  paceType?: "minutes_per_day" | "videos_per_day"
  paceValue?: number
}) {
  seq++
  const duration = input.durationSeconds ?? 600
  const [playlist] = await db
    .insert(schema.playlists)
    .values({
      youtubePlaylistId: `PLTEST${seq}${Date.now()}`,
      title: `Test Playlist ${seq}`,
      videoCount: input.videoCount,
      totalDurationSeconds: duration * input.videoCount,
    })
    .returning()

  const videoRows = await db
    .insert(schema.videos)
    .values(
      Array.from({ length: input.videoCount }, (_, i) => ({
        youtubeVideoId: `vid${seq}x${i}x${Date.now()}`,
        title: `Video ${i + 1}`,
        durationSeconds: duration,
      })),
    )
    .returning()

  await db.insert(schema.playlistVideos).values(
    videoRows.map((v, i) => ({ playlistId: playlist!.id, videoId: v.id, position: i })),
  )

  const [enrollment] = await db
    .insert(schema.userPlaylists)
    .values({
      userId: input.userId,
      playlistId: playlist!.id,
      paceType: input.paceType ?? "videos_per_day",
      paceValue: input.paceValue ?? 1,
    })
    .returning()

  return { playlist: playlist!, videos: videoRows, enrollment: enrollment! }
}
