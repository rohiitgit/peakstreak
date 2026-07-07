import { and, eq } from "drizzle-orm"

import { db, schema } from "@/lib/db"

/**
 * Marks a video non-embeddable after a runtime player error (101/150).
 * The playlist membership check stops arbitrary flag-flipping: callers
 * may only report videos in a playlist they're enrolled in. Returns
 * changed=false when the video isn't in that playlist.
 */
export async function recordEmbedError(
  playlistId: string,
  videoId: string,
): Promise<{ changed: boolean }> {
  const member = await db.query.playlistVideos.findFirst({
    where: and(
      eq(schema.playlistVideos.playlistId, playlistId),
      eq(schema.playlistVideos.videoId, videoId),
    ),
  })
  if (!member) return { changed: false }

  await db
    .update(schema.videos)
    .set({ isEmbeddable: false, updatedAt: new Date() })
    .where(eq(schema.videos.id, videoId))
  return { changed: true }
}
