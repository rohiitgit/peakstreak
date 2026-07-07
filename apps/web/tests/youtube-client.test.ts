import "./env-bootstrap"

import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchPlaylistFromYouTube } from "@/lib/youtube/client"
import { stubYouTubeFetch } from "./youtube-stub"

describe("fetchPlaylistFromYouTube — embeddability", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("captures status.embeddable per video, defaulting to true when absent", async () => {
    stubYouTubeFetch({
      videos: [
        { id: "vid-blocked", embeddable: false },
        { id: "vid-open", embeddable: true },
        { id: "vid-no-status" }, // missing status must never mark unembeddable
      ],
    })

    const fetched = await fetchPlaylistFromYouTube("PLTEST")
    const byId = new Map(fetched.videos.map((v) => [v.youtubeVideoId, v.isEmbeddable]))

    expect(byId.get("vid-blocked")).toBe(false)
    expect(byId.get("vid-open")).toBe(true)
    expect(byId.get("vid-no-status")).toBe(true)
  })

  it("requests the status part from the videos endpoint", async () => {
    const fetchMock = stubYouTubeFetch({ videos: [{ id: "vid1" }] })

    await fetchPlaylistFromYouTube("PLTEST")

    const videosCall = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((url) => url.pathname.endsWith("/videos"))
    expect(videosCall).toBeDefined()
    expect(videosCall!.searchParams.get("part")).toContain("status")
  })
})
