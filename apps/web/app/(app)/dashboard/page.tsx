import type { Metadata } from "next"
import Link from "next/link"
import { ListPlus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { requireUserId } from "@/lib/auth"
import { getDashboard, type DashboardEnrollment } from "@/lib/dashboard"
import { ContributionGraph } from "@/components/contribution-graph"
import { PlaylistCard } from "@/components/playlist-card"
import { StreakStrip } from "@/components/streak-strip"

export const metadata: Metadata = { title: "Dashboard" }

function toCardProps(e: DashboardEnrollment) {
  return {
    id: e.id,
    status: e.status,
    title: e.title,
    channelTitle: e.channelTitle,
    thumbnailUrl: e.thumbnailUrl,
    videoCount: e.videoCount,
    completedCount: e.completedCount,
    totalDurationSeconds: e.totalDurationSeconds,
    projectedFinishDate: e.eta.projectedFinishDate,
    daysRemaining: e.eta.daysRemaining,
    aheadDays: e.eta.aheadDays,
    continueVideoId: e.continueVideoId,
    completedAtLabel: e.completedAt
      ? e.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null,
  }
}

export default async function DashboardPage() {
  const userId = await requireUserId()
  const { active, completed, archived, streak, activityDays, today } =
    await getDashboard(userId)

  const isEmpty = active.length === 0 && completed.length === 0 && archived.length === 0

  return (
    <div className="flex flex-col gap-6">
      <StreakStrip streak={streak} />
      {!isEmpty && <ContributionGraph days={activityDays} today={today} />}

      {isEmpty ? (
        <div className="border-border bg-card flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-20 text-center">
          <ListPlus className="text-muted-foreground size-10" />
          <div>
            <h2 className="text-lg font-semibold">Paste your first playlist</h2>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              Drop in any YouTube playlist link — we&apos;ll tell you exactly how long it takes to
              finish, and keep you honest about it.
            </p>
          </div>
          <Button size="lg" render={<Link href="/playlists/new" />}>
            Add a playlist
          </Button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-medium">In progress</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((e) => (
                  <PlaylistCard key={e.id} {...toCardProps(e)} />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-medium">Completed</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((e) => (
                  <PlaylistCard key={e.id} {...toCardProps(e)} />
                ))}
              </div>
            </section>
          )}

          {archived.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-medium">Archived</h2>
              <div className="grid grid-cols-1 gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
                {archived.map((e) => (
                  <PlaylistCard key={e.id} {...toCardProps(e)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
