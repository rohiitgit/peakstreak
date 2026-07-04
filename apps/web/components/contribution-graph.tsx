import { cn } from "@workspace/ui/lib/utils"

import { addDays, weekStart } from "@/lib/dates"

const WEEKS = 52

export interface GraphDay {
  activityDate: string
  videosCompleted: number
  isFrozen: boolean
  secondsWatched: number
}

/**
 * PS-10: GitHub-style activity heatmap, hand-rolled as a CSS grid
 * (ARCHITECTURE §2.5 — charting libraries fight this exact shape).
 * Reads daily_activity rows directly; dates are already user-local.
 */
export function ContributionGraph({ days, today }: { days: GraphDay[]; today: string }) {
  const byDate = new Map(days.map((d) => [d.activityDate, d]))

  // Columns are Monday-started weeks; the rightmost column contains today.
  const firstMonday = weekStart(addDays(today, -7 * (WEEKS - 1)))
  const weeks: string[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const monday = addDays(firstMonday, w * 7)
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)))
  }

  function cellClass(date: string): string {
    if (date > today) return "invisible"
    const day = byDate.get(date)
    if (day?.isFrozen && day.videosCompleted === 0) {
      // Frozen day: outlined, icy — visually distinct from active & empty.
      return "bg-sky-500/20 ring-1 ring-inset ring-sky-400/70"
    }
    const count = day?.videosCompleted ?? 0
    if (count === 0) return "bg-secondary"
    if (count === 1) return "bg-primary/35"
    if (count <= 3) return "bg-primary/65"
    return "bg-primary"
  }

  function tooltip(date: string): string {
    const day = byDate.get(date)
    if (day?.isFrozen && day.videosCompleted === 0) return `${date} — streak freeze used 🧊`
    const count = day?.videosCompleted ?? 0
    const minutes = Math.round((day?.secondsWatched ?? 0) / 60)
    const parts = [`${count} video${count === 1 ? "" : "s"} completed`]
    if (minutes > 0) parts.push(`${minutes}m watched`)
    return `${date} — ${parts.join(", ")}`
  }

  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Activity</h2>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          Less
          <span className="bg-secondary inline-block size-2.5 rounded-[3px]" />
          <span className="bg-primary/35 inline-block size-2.5 rounded-[3px]" />
          <span className="bg-primary/65 inline-block size-2.5 rounded-[3px]" />
          <span className="bg-primary inline-block size-2.5 rounded-[3px]" />
          More
          <span className="ml-2 inline-block size-2.5 rounded-[3px] bg-sky-500/20 ring-1 ring-sky-400/70 ring-inset" />
          Frozen
        </div>
      </div>

      {/* dir=rtl anchors the scroll position to the right (current week)
          on narrow screens; inner dir=ltr restores reading order. */}
      <div className="overflow-x-auto" dir="rtl">
        <div dir="ltr" className="flex w-max gap-[3px]">
          {weeks.map((week, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {week.map((date) => (
                <div
                  key={date}
                  title={date <= today ? tooltip(date) : undefined}
                  className={cn("size-2.5 rounded-[3px]", cellClass(date))}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
