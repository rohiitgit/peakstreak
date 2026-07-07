import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { and, asc, eq } from "drizzle-orm"

import { requireUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { requireEnrollment } from "@/lib/dashboard"
import { WatchView } from "@/components/watch-view"

export const metadata: Metadata = { title: "Watch" }

export default async function WatchPage({
  params,
}: {
  params: Promise<{ enrollmentId: string; videoId: string }>
}) {
  const userId = await requireUserId()
  const { enrollmentId, videoId } = await params

  const enrollment = await requireEnrollment(userId, enrollmentId)
  if (!enrollment) notFound()

  const playlist = await db.query.playlists.findFirst({
    where: eq(schema.playlists.id, enrollment.playlistId),
  })
  if (!playlist) notFound()

  const rows = await db
    .select({
      id: schema.videos.id,
      youtubeVideoId: schema.videos.youtubeVideoId,
      title: schema.videos.title,
      durationSeconds: schema.videos.durationSeconds,
      thumbnailUrl: schema.videos.thumbnailUrl,
      isEmbeddable: schema.videos.isEmbeddable,
      position: schema.playlistVideos.position,
      isCompleted: schema.videoProgress.isCompleted,
      secondsWatched: schema.videoProgress.secondsWatched,
      furthestPositionSeconds: schema.videoProgress.furthestPositionSeconds,
    })
    .from(schema.playlistVideos)
    .innerJoin(schema.videos, eq(schema.playlistVideos.videoId, schema.videos.id))
    .leftJoin(
      schema.videoProgress,
      and(
        eq(schema.videoProgress.videoId, schema.videos.id),
        eq(schema.videoProgress.userPlaylistId, enrollmentId),
      ),
    )
    .where(
      and(
        eq(schema.playlistVideos.playlistId, enrollment.playlistId),
        eq(schema.videos.isAvailable, true),
      ),
    )
    .orderBy(asc(schema.playlistVideos.position))

  const videos = rows.map((r) => ({
    id: r.id,
    youtubeVideoId: r.youtubeVideoId,
    title: r.title,
    durationSeconds: r.durationSeconds,
    thumbnailUrl: r.thumbnailUrl,
    isEmbeddable: r.isEmbeddable,
    position: r.position,
    isCompleted: r.isCompleted ?? false,
    secondsWatched: r.secondsWatched ?? 0,
  }))

  const current = videos.find((v) => v.id === videoId)
  if (!current) notFound()

  return (
    <WatchView
      enrollmentId={enrollmentId}
      playlistTitle={playlist.title}
      videos={videos}
      currentVideoId={videoId}
      initialSecondsWatched={current.secondsWatched}
      resumePositionSeconds={rows.find((r) => r.id === videoId)?.furthestPositionSeconds ?? 0}
    />
  )
}
