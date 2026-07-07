import { asc, eq, sql } from "drizzle-orm"

import { db, schema } from "@/lib/db"
import { env } from "@/lib/env"
import { fetchPlaylistFromYouTube, YouTubeApiError } from "./client"

export interface CachedVideo {
  id: string
  youtubeVideoId: string
  title: string
  durationSeconds: number
  thumbnailUrl: string | null
  position: number
}

export interface CachedPlaylist {
  playlist: typeof schema.playlists.$inferSelect
  videos: CachedVideo[]
  fromCache: boolean
}

async function loadFromDb(playlistRowId: string): Promise<CachedVideo[]> {
  const rows = await db
    .select({
      id: schema.videos.id,
      youtubeVideoId: schema.videos.youtubeVideoId,
      title: schema.videos.title,
      durationSeconds: schema.videos.durationSeconds,
      thumbnailUrl: schema.videos.thumbnailUrl,
      position: schema.playlistVideos.position,
    })
    .from(schema.playlistVideos)
    .innerJoin(schema.videos, eq(schema.playlistVideos.videoId, schema.videos.id))
    .where(eq(schema.playlistVideos.playlistId, playlistRowId))
    .orderBy(asc(schema.playlistVideos.position))
  return rows
}

/**
 * The quota-protection layer (PS-3): playlists fetched within the TTL
 * (default 24h) are served entirely from Postgres with zero YouTube API
 * calls, and the cache is shared across all users. Falls back to stale
 * cached data if YouTube errors on a refresh.
 */
export async function getOrSyncPlaylist(youtubePlaylistId: string): Promise<CachedPlaylist> {
  const existing = await db.query.playlists.findFirst({
    where: eq(schema.playlists.youtubePlaylistId, youtubePlaylistId),
  })

  const ttlMs = env().PLAYLIST_SYNC_TTL_HOURS * 3600 * 1000
  if (existing && Date.now() - existing.lastSyncedAt.getTime() < ttlMs) {
    console.info(`[youtube] cache HIT for ${youtubePlaylistId} (0 API calls)`)
    return { playlist: existing, videos: await loadFromDb(existing.id), fromCache: true }
  }

  let fetched
  try {
    fetched = await fetchPlaylistFromYouTube(youtubePlaylistId)
  } catch (error) {
    // A stale copy beats an error page when YouTube is flaky/quota-limited.
    if (existing && error instanceof YouTubeApiError) {
      console.warn(`[youtube] refresh failed for ${youtubePlaylistId}, serving stale cache`)
      return { playlist: existing, videos: await loadFromDb(existing.id), fromCache: true }
    }
    throw error
  }

  console.info(
    `[youtube] cache MISS for ${youtubePlaylistId} — synced ${fetched.videos.length} videos in ${fetched.apiCallCount} API calls`,
  )

  const playlist = await db.transaction(async (tx) => {
    const totalDurationSeconds = fetched.videos.reduce((sum, v) => sum + v.durationSeconds, 0)
    const unembeddableCount = fetched.videos.filter((v) => !v.isEmbeddable).length
    const [playlistRow] = await tx
      .insert(schema.playlists)
      .values({
        youtubePlaylistId,
        title: fetched.title,
        channelTitle: fetched.channelTitle,
        thumbnailUrl: fetched.thumbnailUrl,
        videoCount: fetched.videos.length,
        totalDurationSeconds,
        unavailableCount: fetched.unavailableCount,
        unembeddableCount,
        lastSyncedAt: new Date(),
        syncStatus: fetched.unavailableCount > 0 ? "partial" : "ok",
      })
      .onConflictDoUpdate({
        target: schema.playlists.youtubePlaylistId,
        set: {
          title: fetched.title,
          channelTitle: fetched.channelTitle,
          thumbnailUrl: fetched.thumbnailUrl,
          videoCount: fetched.videos.length,
          totalDurationSeconds,
          unavailableCount: fetched.unavailableCount,
          unembeddableCount,
          lastSyncedAt: new Date(),
          syncStatus: fetched.unavailableCount > 0 ? "partial" : "ok",
          updatedAt: new Date(),
        },
      })
      .returning()

    if (fetched.videos.length > 0) {
      await tx
        .insert(schema.videos)
        .values(
          fetched.videos.map((v) => ({
            youtubeVideoId: v.youtubeVideoId,
            title: v.title,
            durationSeconds: v.durationSeconds,
            thumbnailUrl: v.thumbnailUrl,
            isEmbeddable: v.isEmbeddable,
          })),
        )
        .onConflictDoUpdate({
          target: schema.videos.youtubeVideoId,
          set: {
            title: sql`excluded.title`,
            durationSeconds: sql`excluded.duration_seconds`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            isAvailable: sql`true`,
            // Two-way self-heal: a runtime-flagged false flips back to true
            // here if the owner re-enables embedding.
            isEmbeddable: sql`excluded.is_embeddable`,
            updatedAt: sql`now()`,
          },
        })

      // Rebuild the ordering join — videos can be re-ordered/removed upstream.
      // Progress/notes reference videos and enrollments, never this table.
      await tx
        .delete(schema.playlistVideos)
        .where(eq(schema.playlistVideos.playlistId, playlistRow!.id))

      const videoRows = await tx
        .select({ id: schema.videos.id, youtubeVideoId: schema.videos.youtubeVideoId })
        .from(schema.videos)
        .where(
          sql`${schema.videos.youtubeVideoId} in ${fetched.videos.map((v) => v.youtubeVideoId)}`,
        )
      const idByYoutubeId = new Map(videoRows.map((r) => [r.youtubeVideoId, r.id]))

      await tx.insert(schema.playlistVideos).values(
        fetched.videos.map((v) => ({
          playlistId: playlistRow!.id,
          videoId: idByYoutubeId.get(v.youtubeVideoId)!,
          position: v.position,
        })),
      )
    }

    return playlistRow!
  })

  return { playlist, videos: await loadFromDb(playlist.id), fromCache: false }
}
