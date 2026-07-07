import { z } from "zod"

import { track } from "@/lib/analytics"
import { currentUserId } from "@/lib/auth"
import {
  PlaylistNotFoundError,
  QuotaExceededError,
} from "@/lib/youtube/client"
import { getOrSyncPlaylist } from "@/lib/youtube/cache"
import { parsePlaylistInput } from "@/lib/youtube/url"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

const bodySchema = z.object({ url: z.string().min(1) })

/**
 * Public preview: URL → playlist stats (count, runtime). Used by the
 * estimate screen and, later, the anonymous landing-page teaser (PS-13).
 */
export async function POST(request: Request) {
  // This is an unauthenticated endpoint that spends YouTube API quota on a
  // cache miss — throttle per IP before touching anything else.
  const { ok } = await checkRateLimit({
    name: "preview-ip",
    identifier: await clientIp(),
    limit: 20,
    window: "1 m",
  })
  if (!ok) {
    return Response.json(
      { error: "rate_limited", message: "You're going a bit fast. Please try again in a minute." },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_body", message: "Expected JSON" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", message: "Missing url" }, { status: 400 })
  }

  const playlistId = parsePlaylistInput(parsed.data.url)
  if (!playlistId) {
    return Response.json(
      {
        error: "invalid_url",
        message:
          "That doesn't look like a YouTube playlist link. Paste a URL containing “list=…” or a playlist ID.",
      },
      { status: 400 },
    )
  }

  try {
    const { playlist, fromCache } = await getOrSyncPlaylist(playlistId)
    track("playlist_pasted", {
      userId: await currentUserId(),
      properties: { playlistId: playlist.id, fromCache },
    })
    return Response.json({
      playlist: {
        youtubePlaylistId: playlist.youtubePlaylistId,
        title: playlist.title,
        channelTitle: playlist.channelTitle,
        thumbnailUrl: playlist.thumbnailUrl,
        videoCount: playlist.videoCount,
        totalDurationSeconds: playlist.totalDurationSeconds,
        unavailableCount: playlist.unavailableCount,
        unembeddableCount: playlist.unembeddableCount,
      },
      fromCache,
    })
  } catch (error) {
    if (error instanceof PlaylistNotFoundError) {
      return Response.json({ error: "not_found", message: error.message }, { status: 404 })
    }
    if (error instanceof QuotaExceededError) {
      return Response.json({ error: "quota_exceeded", message: error.message }, { status: 429 })
    }
    console.error("Playlist preview failed:", error)
    return Response.json(
      { error: "upstream_error", message: "YouTube didn't respond properly. Try again shortly." },
      { status: 502 },
    )
  }
}
