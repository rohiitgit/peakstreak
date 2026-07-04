import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { and, eq, gte, lte } from "drizzle-orm"
import { CalendarCheck, Clock, Download, Flame, ListVideo } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { requireUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { daysBetween, localDateString } from "@/lib/dates"
import { formatDuration } from "@/lib/pace"
import { computeStreaks } from "@/lib/streaks"
import { getUser } from "@/lib/user"
import { Confetti } from "@/components/confetti"

export const metadata: Metadata = { title: "Playlist complete" }

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** PS-11: the celebration screen — revisitable from the completed card. */
export default async function CompletedPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>
}) {
  const userId = await requireUserId()
  const { enrollmentId } = await params

  const enrollment = await db.query.userPlaylists.findFirst({
    where: and(eq(schema.userPlaylists.id, enrollmentId), eq(schema.userPlaylists.userId, userId)),
  })
  if (!enrollment) notFound()
  if (enrollment.status !== "completed" || !enrollment.completedAt) redirect("/dashboard")

  const user = await getUser(userId)
  const playlist = await db.query.playlists.findFirst({
    where: eq(schema.playlists.id, enrollment.playlistId),
  })
  if (!playlist) notFound()

  const startDate = localDateString(enrollment.startedAt, user.timezone)
  const endDate = localDateString(enrollment.completedAt, user.timezone)
  const daysTaken = daysBetween(startDate, endDate) + 1

  // "vs original estimate": negative = finished early.
  const vsEstimate = enrollment.targetFinishDate
    ? daysBetween(enrollment.targetFinishDate, endDate)
    : null

  // Longest streak during the run — activity restricted to the run window.
  const runActivity = await db
    .select({
      activityDate: schema.dailyActivity.activityDate,
      videosCompleted: schema.dailyActivity.videosCompleted,
      isFrozen: schema.dailyActivity.isFrozen,
    })
    .from(schema.dailyActivity)
    .where(
      and(
        eq(schema.dailyActivity.userId, userId),
        gte(schema.dailyActivity.activityDate, startDate),
        lte(schema.dailyActivity.activityDate, endDate),
      ),
    )
  const { longestStreak } = computeStreaks(runActivity, endDate)

  const stats = [
    {
      icon: ListVideo,
      label: "Videos completed",
      value: String(playlist.videoCount),
    },
    {
      icon: Clock,
      label: "Watch time invested",
      value: formatDuration(playlist.totalDurationSeconds),
    },
    {
      icon: CalendarCheck,
      label: "Days taken",
      value:
        vsEstimate === null
          ? `${daysTaken}`
          : vsEstimate <= 0
            ? `${daysTaken} — ${Math.abs(vsEstimate) === 0 ? "right on" : `${Math.abs(vsEstimate)}d ahead of`} plan`
            : `${daysTaken} — ${vsEstimate}d past plan`,
    },
    {
      icon: Flame,
      label: "Longest streak during the run",
      value: `${longestStreak} day${longestStreak === 1 ? "" : "s"}`,
    },
  ]

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-8 py-16 text-center">
      <Confetti />
      <div>
        <p className="text-primary text-sm font-medium">Playlist complete</p>
        <h1 className="mt-2 text-2xl font-semibold text-balance">{playlist.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Started {prettyDate(startDate)} · finished {prettyDate(endDate)}
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-border bg-card flex flex-col items-center gap-1 rounded-xl border px-4 py-5"
          >
            <stat.icon className="text-muted-foreground mb-1 size-4" />
            <div className="font-mono text-lg font-semibold">{stat.value}</div>
            <div className="text-muted-foreground text-xs">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button
          variant="outline"
          render={<a href={`/api/playlists/${enrollmentId}/notes/export`} download />}
        >
          <Download className="size-4" />
          Export notes (.md)
        </Button>
        <Button render={<Link href="/playlists/new" />}>Start your next playlist</Button>
      </div>
    </div>
  )
}
