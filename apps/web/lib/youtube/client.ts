import { env } from "@/lib/env"

/** User-facing ingestion failures, each with a distinct message. */
export class PlaylistNotFoundError extends Error {
  constructor() {
    super("We couldn't find that playlist — it may be private or deleted.")
    this.name = "PlaylistNotFoundError"
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super("YouTube is rate-limiting us right now. Please try again in a few hours.")
    this.name = "QuotaExceededError"
  }
}

export class YouTubeApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "YouTubeApiError"
  }
}

export interface FetchedVideo {
  youtubeVideoId: string
  title: string
  durationSeconds: number
  thumbnailUrl: string | null
  position: number
  /** False when the owner disabled embedding — playable only on YouTube. */
  isEmbeddable: boolean
}

export interface FetchedPlaylist {
  youtubePlaylistId: string
  title: string
  channelTitle: string | null
  thumbnailUrl: string | null
  videos: FetchedVideo[]
  /** Items in the playlist that are private/deleted/region-blocked. */
  unavailableCount: number
  /** YouTube API requests made — asserted on in cache tests/logs. */
  apiCallCount: number
}

const API_BASE = "https://www.googleapis.com/youtube/v3"

/** Parses ISO-8601 durations like PT1H2M3S (also P1DT2H) into seconds. */
export function parseIsoDuration(iso: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso)
  if (!match) return 0
  const [, days, hours, minutes, seconds] = match
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  )
}

interface YtErrorBody {
  error?: { errors?: Array<{ reason?: string }>; message?: string }
}

async function ytFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("key", env().YOUTUBE_API_KEY)

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    let body: YtErrorBody = {}
    try {
      body = (await res.json()) as YtErrorBody
    } catch {
      /* non-JSON error body */
    }
    const reason = body.error?.errors?.[0]?.reason ?? ""
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
      throw new QuotaExceededError()
    }
    if (res.status === 404 || reason === "playlistNotFound") {
      throw new PlaylistNotFoundError()
    }
    throw new YouTubeApiError(
      `YouTube API ${res.status}: ${body.error?.message ?? res.statusText}`,
    )
  }
  return res.json()
}

function bestThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string | null {
  if (!thumbnails) return null
  for (const key of ["medium", "high", "standard", "default", "maxres"]) {
    const url = thumbnails[key]?.url
    if (url) return url
  }
  return null
}

/**
 * Fetches a playlist's full metadata from the YouTube Data API:
 * one `playlists` call, paginated `playlistItems` (50/page), and batched
 * `videos` calls (50/batch) for durations. Cost: ~2 + 2×(n/50) units.
 */
export async function fetchPlaylistFromYouTube(playlistId: string): Promise<FetchedPlaylist> {
  let apiCallCount = 0

  apiCallCount++
  const playlistData = (await ytFetch("playlists", {
    part: "snippet,contentDetails",
    id: playlistId,
    maxResults: "1",
  })) as {
    items?: Array<{
      snippet?: {
        title?: string
        channelTitle?: string
        thumbnails?: Record<string, { url?: string }>
      }
    }>
  }
  const playlist = playlistData.items?.[0]
  // The API returns 200 with an empty items array for private/deleted playlists.
  if (!playlist?.snippet) throw new PlaylistNotFoundError()

  // Collect every item (id + position + title), paginating past 50.
  const items: Array<{ videoId: string; position: number; title: string }> = []
  let pageToken: string | undefined
  do {
    apiCallCount++
    const page = (await ytFetch("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    })) as {
      items?: Array<{
        snippet?: { title?: string; position?: number }
        contentDetails?: { videoId?: string }
      }>
      nextPageToken?: string
    }
    for (const item of page.items ?? []) {
      const videoId = item.contentDetails?.videoId
      if (!videoId) continue
      items.push({
        videoId,
        position: item.snippet?.position ?? items.length,
        title: item.snippet?.title ?? "",
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  // Durations + availability come from the videos endpoint, batched by 50.
  // Private/deleted/region-blocked videos are simply absent from the response.
  const available = new Map<
    string,
    { title: string; durationSeconds: number; thumbnailUrl: string | null; isEmbeddable: boolean }
  >()
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50)
    apiCallCount++
    const videoData = (await ytFetch("videos", {
      part: "snippet,contentDetails,status",
      id: batch.map((b) => b.videoId).join(","),
      maxResults: "50",
    })) as {
      items?: Array<{
        id?: string
        snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }
        contentDetails?: { duration?: string }
        status?: { embeddable?: boolean }
      }>
    }
    for (const video of videoData.items ?? []) {
      if (!video.id) continue
      const durationSeconds = parseIsoDuration(video.contentDetails?.duration ?? "")
      // Upcoming/live entries report 0s or P0D — treat them as unavailable
      // rather than polluting runtime math with zero-length videos.
      if (durationSeconds <= 0) continue
      available.set(video.id, {
        title: video.snippet?.title ?? "Untitled video",
        durationSeconds,
        thumbnailUrl: bestThumbnail(video.snippet?.thumbnails),
        // A missing status must never mark a video unembeddable.
        isEmbeddable: video.status?.embeddable !== false,
      })
    }
  }

  const videos: FetchedVideo[] = []
  let unavailableCount = 0
  for (const item of items) {
    const meta = available.get(item.videoId)
    if (!meta) {
      unavailableCount++
      continue
    }
    videos.push({
      youtubeVideoId: item.videoId,
      title: meta.title,
      durationSeconds: meta.durationSeconds,
      thumbnailUrl: meta.thumbnailUrl,
      position: videos.length, // re-packed positions skip unavailable items
      isEmbeddable: meta.isEmbeddable,
    })
  }

  return {
    youtubePlaylistId: playlistId,
    title: playlist.snippet.title ?? "Untitled playlist",
    channelTitle: playlist.snippet.channelTitle ?? null,
    thumbnailUrl: bestThumbnail(playlist.snippet.thumbnails),
    videos,
    unavailableCount,
    apiCallCount,
  }
}
