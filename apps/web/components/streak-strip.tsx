import { Flame, Snowflake, Trophy } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { StreakSummary } from "@/lib/streaks"

function prettyShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function StreakStrip({ streak }: { streak: StreakSummary }) {
  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-5 py-4">
      <div className="flex items-center gap-2.5">
        <Flame
          className={cn(
            "size-7",
            streak.activeToday ? "fill-primary/30 text-primary" : "text-muted-foreground",
          )}
        />
        <div>
          <div className="font-mono text-xl leading-none font-semibold">
            {streak.currentStreak}
          </div>
          <div className="text-muted-foreground text-xs">
            day streak
            {streak.activeToday && <span className="text-primary ml-1">· lit today</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Trophy className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">
          Longest <span className="text-foreground font-mono font-medium">{streak.longestStreak}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Snowflake
          className={cn("size-4", streak.freezeAvailable ? "text-primary" : "text-muted-foreground")}
        />
        <span className="text-muted-foreground text-sm">
          {streak.freezeAvailable
            ? "Streak freeze available this week"
            : streak.frozenDateThisWeek
              ? `Freeze used ${prettyShortDate(streak.frozenDateThisWeek)}`
              : "Freeze used this week"}
        </span>
      </div>
    </div>
  )
}
