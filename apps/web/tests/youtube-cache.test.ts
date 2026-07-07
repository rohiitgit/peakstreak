import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { eq } from "drizzle-orm"

import { db, resetDb, schema } from "./helpers"
import { stubYouTubeFetch } from "./youtube-stub"

import { getOrSyncPlaylist } from "@/lib/youtube/cache"

const PLAYLIST_ID = "PLCACHETEST"

async function videoFlag(youtubeVideoId: string) {
  const row = await db.query.videos.findFirst({
    where: eq(schema.videos.youtubeVideoId, youtubeVideoId),
  })
  return row?.isEmbeddable
}

describe("getOrSyncPlaylist — embeddability", () => {
  beforeEach(resetDb)
  afterEach(() => vi.unstubAllGlobals())

  it("persists is_embeddable per video and unembeddable_count on the playlist", async () => {
    stubYouTubeFetch({
      videos: [
        { id: "cache-blocked", embeddable: false },
        { id: "cache-open", embeddable: true },
      ],
    })

    const { playlist } = await getOrSyncPlaylist(PLAYLIST_ID)

    expect(playlist.unembeddableCount).toBe(1)
    expect(await videoFlag("cache-blocked")).toBe(false)
    expect(await videoFlag("cache-open")).toBe(true)
  })

  it("self-heals when the owner re-enables embedding", async () => {
    stubYouTubeFetch({ videos: [{ id: "cache-heal", embeddable: false }] })
    const first = await getOrSyncPlaylist(PLAYLIST_ID)
    expect(first.playlist.unembeddableCount).toBe(1)
    expect(await videoFlag("cache-heal")).toBe(false)

    // Expire the cache, then re-sync with embedding re-enabled upstream.
    await db
      .update(schema.playlists)
      .set({ lastSyncedAt: new Date(Date.now() - 48 * 3600 * 1000) })
      .where(eq(schema.playlists.id, first.playlist.id))
    stubYouTubeFetch({ videos: [{ id: "cache-heal", embeddable: true }] })

    const second = await getOrSyncPlaylist(PLAYLIST_ID)

    expect(second.fromCache).toBe(false)
    expect(second.playlist.unembeddableCount).toBe(0)
    expect(await videoFlag("cache-heal")).toBe(true)
  })
})
