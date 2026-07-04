"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { track } from "@/lib/analytics"
import { requireUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { localDateString } from "@/lib/dates"
import { estimateDays, finishDate, isValidPlaybackSpeed, validatePace, type Pace } from "@/lib/pace"
import { getUser } from "@/lib/user"
import { getOrSyncPlaylist } from "@/lib/youtube/cache"
import { parsePlaylistInput } from "@/lib/youtube/url"

const enrollSchema = z.object({
  url: z.string().min(1),
  paceType: z.enum(["minutes_per_day", "videos_per_day"]),
  paceValue: z.number().int(),
  playbackSpeed: z.number(),
})

export type EnrollState = { error?: string }

export async function enrollInPlaylist(input: z.infer<typeof enrollSchema>): Promise<EnrollState> {
  const userId = await requireUserId()

  const parsed = enrollSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid input." }
  const { url, paceType, paceValue, playbackSpeed } = parsed.data

  const pace: Pace = { type: paceType, value: paceValue }
  const paceError = validatePace(pace)
  if (paceError) return { error: paceError }
  if (!isValidPlaybackSpeed(playbackSpeed)) return { error: "Invalid playback speed." }

  const playlistId = parsePlaylistInput(url)
  if (!playlistId) return { error: "Invalid playlist link." }

  // Served from cache — the preview call a moment ago already synced it.
  const { playlist } = await getOrSyncPlaylist(playlistId)
  if (playlist.videoCount === 0) {
    return { error: "This playlist has no watchable videos." }
  }

  const user = await getUser(userId)
  const today = localDateString(new Date(), user.timezone)
  const days = estimateDays({
    remainingSeconds: playlist.totalDurationSeconds,
    remainingVideos: playlist.videoCount,
    pace,
    playbackSpeed,
  })
  const targetFinishDate = finishDate(today, days)

  const existing = await db.query.userPlaylists.findFirst({
    where: and(
      eq(schema.userPlaylists.userId, userId),
      eq(schema.userPlaylists.playlistId, playlist.id),
    ),
  })

  if (existing) {
    // Re-adding an archived (or even active) playlist updates the plan
    // rather than erroring — progress rows are keyed to this enrollment
    // and survive untouched.
    await db
      .update(schema.userPlaylists)
      .set({
        paceType,
        paceValue,
        playbackSpeed: playbackSpeed.toFixed(1),
        status: existing.status === "completed" ? "completed" : "active",
        targetFinishDate,
        updatedAt: new Date(),
      })
      .where(eq(schema.userPlaylists.id, existing.id))
  } else {
    await db.insert(schema.userPlaylists).values({
      userId,
      playlistId: playlist.id,
      paceType,
      paceValue,
      playbackSpeed: playbackSpeed.toFixed(1),
      targetFinishDate,
    })
    track("playlist_enrolled", {
      userId,
      properties: { playlistId: playlist.id, paceType, paceValue, playbackSpeed },
    })
  }

  // First playlist added = activated (feeds the activation metric).
  if (!user.onboardedAt) {
    await db
      .update(schema.users)
      .set({ onboardedAt: new Date() })
      .where(eq(schema.users.id, userId))
  }

  redirect("/dashboard")
}

/** Soft delete: hides the playlist but keeps every progress row. */
export async function archivePlaylist(enrollmentId: string) {
  const userId = await requireUserId()
  await db
    .update(schema.userPlaylists)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(schema.userPlaylists.id, enrollmentId),
        eq(schema.userPlaylists.userId, userId),
        eq(schema.userPlaylists.status, "active"),
      ),
    )
  revalidatePath("/dashboard")
}

export async function restorePlaylist(enrollmentId: string) {
  const userId = await requireUserId()
  await db
    .update(schema.userPlaylists)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(
        eq(schema.userPlaylists.id, enrollmentId),
        eq(schema.userPlaylists.userId, userId),
        eq(schema.userPlaylists.status, "archived"),
      ),
    )
  revalidatePath("/dashboard")
}
