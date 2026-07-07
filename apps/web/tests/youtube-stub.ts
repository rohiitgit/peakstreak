/**
 * Canned YouTube Data API responses for testing the ingestion path
 * without network access. Routes on the endpoint path; capture the
 * mock's calls to assert on request URLs.
 */
import { vi } from "vitest"

export interface StubVideo {
  id: string
  title?: string
  /** ISO-8601 duration; defaults to 10 minutes. */
  duration?: string
  /** Omit to leave `status` off the response entirely. */
  embeddable?: boolean
}

export function stubYouTubeFetch(input: { playlistTitle?: string; videos: StubVideo[] }) {
  const fetchMock = vi.fn(async (url: URL | string) => {
    const path = new URL(String(url)).pathname
    let body: unknown
    if (path.endsWith("/playlists")) {
      body = {
        items: [{ snippet: { title: input.playlistTitle ?? "Stub Playlist", channelTitle: "Stub Channel" } }],
      }
    } else if (path.endsWith("/playlistItems")) {
      body = {
        items: input.videos.map((v, i) => ({
          snippet: { title: v.title ?? `Video ${i + 1}`, position: i },
          contentDetails: { videoId: v.id },
        })),
      }
    } else if (path.endsWith("/videos")) {
      body = {
        items: input.videos.map((v, i) => ({
          id: v.id,
          snippet: { title: v.title ?? `Video ${i + 1}` },
          contentDetails: { duration: v.duration ?? "PT10M" },
          ...(v.embeddable === undefined ? {} : { status: { embeddable: v.embeddable } }),
        })),
      }
    } else {
      throw new Error(`Unexpected YouTube API path in test: ${path}`)
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
