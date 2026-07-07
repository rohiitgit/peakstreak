import { beforeEach, describe, expect, it } from "vitest"

import { eq } from "drizzle-orm"

import { db, resetDb, schema, seedEnrollment, seedUser } from "./helpers"

import { recordEmbedError } from "@/lib/embeddable"

async function isEmbeddable(videoId: string) {
  const row = await db.query.videos.findFirst({ where: eq(schema.videos.id, videoId) })
  return row?.isEmbeddable
}

describe("recordEmbedError", () => {
  beforeEach(resetDb)

  it("marks a playlist member non-embeddable, idempotently", async () => {
    const user = await seedUser()
    const { playlist, videos } = await seedEnrollment({ userId: user.id, videoCount: 2 })

    const first = await recordEmbedError(playlist.id, videos[0]!.id)
    const second = await recordEmbedError(playlist.id, videos[0]!.id)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(true)
    expect(await isEmbeddable(videos[0]!.id)).toBe(false)
    // Sibling video untouched.
    expect(await isEmbeddable(videos[1]!.id)).toBe(true)
  })

  it("refuses videos outside the given playlist", async () => {
    const user = await seedUser()
    const mine = await seedEnrollment({ userId: user.id, videoCount: 1 })
    const other = await seedEnrollment({ userId: user.id, videoCount: 1 })

    const result = await recordEmbedError(mine.playlist.id, other.videos[0]!.id)

    expect(result.changed).toBe(false)
    expect(await isEmbeddable(other.videos[0]!.id)).toBe(true)
  })
})
