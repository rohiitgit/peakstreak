import { and, asc, eq, ne } from "drizzle-orm"

import { db, schema } from "@/lib/db"

export interface PlaylistNote {
  videoId: string
  videoTitle: string
  position: number
  content: string
  updatedAt: Date
}

/** A user's notes for one playlist, in video order (PS-9 / PS-11 export). */
export async function getPlaylistNotes(userId: string, enrollmentId: string) {
  const enrollment = await db.query.userPlaylists.findFirst({
    where: and(eq(schema.userPlaylists.id, enrollmentId), eq(schema.userPlaylists.userId, userId)),
  })
  if (!enrollment) throw new Error("Enrollment not found")

  const playlist = await db.query.playlists.findFirst({
    where: eq(schema.playlists.id, enrollment.playlistId),
  })

  const notes = await db
    .select({
      videoId: schema.notes.videoId,
      videoTitle: schema.videos.title,
      position: schema.playlistVideos.position,
      content: schema.notes.content,
      updatedAt: schema.notes.updatedAt,
    })
    .from(schema.notes)
    .innerJoin(schema.videos, eq(schema.notes.videoId, schema.videos.id))
    .innerJoin(
      schema.playlistVideos,
      and(
        eq(schema.playlistVideos.videoId, schema.videos.id),
        eq(schema.playlistVideos.playlistId, enrollment.playlistId),
      ),
    )
    .where(
      and(
        eq(schema.notes.userId, userId),
        eq(schema.notes.userPlaylistId, enrollmentId),
        ne(schema.notes.content, ""),
      ),
    )
    .orderBy(asc(schema.playlistVideos.position))

  return { playlistTitle: playlist?.title ?? "Playlist", notes: notes as PlaylistNote[] }
}
