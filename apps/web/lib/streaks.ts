import { and, eq, gte } from "drizzle-orm"

import { track } from "@/lib/analytics"
import { db, schema } from "@/lib/db"
import { addDays, localDateString, weekStart } from "@/lib/dates"

/**
 * PS-8: the streak system. Streak numbers are ALWAYS derived by a pure
 * function over the daily_activity date series — there is no stored
 * counter to drift out of sync. The only stateful piece is freeze
 * consumption: the daily maintenance job materializes a "frozen" day row
 * when a missed day is covered by the weekly grace allowance, so the
 * computation (and heatmap) can treat it like any other qualifying day.
 */

export interface ActivityDay {
  activityDate: string
  videosCompleted: number
  isFrozen: boolean
}

export interface StreakStats {
  currentStreak: number
  longestStreak: number
  /** True when the user completed a video today (not merely frozen). */
  activeToday: boolean
}

function qualifies(day: ActivityDay): boolean {
  return day.videosCompleted >= 1 || day.isFrozen
}

/**
 * Pure streak computation. `today` is the user's local date. A missed
 * *today* doesn't break the streak (the day isn't over yet): the current
 * run may end at today or yesterday.
 */
export function computeStreaks(days: ActivityDay[], today: string): StreakStats {
  const qualified = new Set(days.filter(qualifies).map((d) => d.activityDate))

  let anchor = today
  if (!qualified.has(anchor)) anchor = addDays(today, -1)
  let currentStreak = 0
  while (qualified.has(anchor)) {
    currentStreak++
    anchor = addDays(anchor, -1)
  }

  // Longest run over the whole history.
  let longestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const date of [...qualified].sort()) {
    run = prev !== null && addDays(prev, 1) === date ? run + 1 : 1
    if (run > longestStreak) longestStreak = run
    prev = date
  }

  const todayRow = days.find((d) => d.activityDate === today)
  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    activeToday: (todayRow?.videosCompleted ?? 0) >= 1,
  }
}

/** One freeze per calendar week (Monday-start), non-stacking. */
export function freezeAvailableForWeekOf(days: ActivityDay[], date: string): boolean {
  const start = weekStart(date)
  return !days.some(
    (d) => d.isFrozen && d.activityDate >= start && d.activityDate <= date,
  )
}

export interface StreakSummary extends StreakStats {
  freezeAvailable: boolean
  /** The frozen date of the current week, if the freeze was consumed. */
  frozenDateThisWeek: string | null
  today: string
}

async function loadActivity(userId: string, sinceDate: string): Promise<ActivityDay[]> {
  return db
    .select({
      activityDate: schema.dailyActivity.activityDate,
      videosCompleted: schema.dailyActivity.videosCompleted,
      isFrozen: schema.dailyActivity.isFrozen,
    })
    .from(schema.dailyActivity)
    .where(
      and(eq(schema.dailyActivity.userId, userId), gte(schema.dailyActivity.activityDate, sinceDate)),
    )
}

/** Dashboard-facing streak state for a user. */
export async function getStreakSummary(
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<StreakSummary> {
  const today = localDateString(now, timezone)
  // 400 days of history bounds the query while covering the year heatmap
  // and any realistic streak length for current/longest computation.
  const days = await loadActivity(userId, addDays(today, -400))
  const stats = computeStreaks(days, today)
  const start = weekStart(today)
  const frozen = days.find((d) => d.isFrozen && d.activityDate >= start && d.activityDate <= today)
  return {
    ...stats,
    freezeAvailable: !frozen,
    frozenDateThisWeek: frozen?.activityDate ?? null,
    today,
  }
}

/**
 * Daily streak maintenance for one user (idempotent — safe to run every
 * hour). Evaluates the user's *yesterday*: if it was missed while a streak
 * was alive and this week's freeze is unused, materialize a frozen day so
 * the streak survives. Two consecutive misses, or a miss with the freeze
 * spent, leave the gap in place and the streak computes to zero naturally.
 */
export async function runStreakMaintenanceForUser(
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<{ froze: boolean }> {
  const today = localDateString(now, timezone)
  const yesterday = addDays(today, -1)
  const dayBefore = addDays(today, -2)

  const days = await loadActivity(userId, addDays(yesterday, -7))
  const byDate = new Map(days.map((d) => [d.activityDate, d]))

  const yesterdayRow = byDate.get(yesterday)
  if (yesterdayRow && qualifies(yesterdayRow)) return { froze: false }

  // A freeze only makes sense when it actually preserves a streak.
  const dayBeforeRow = byDate.get(dayBefore)
  if (!dayBeforeRow || !qualifies(dayBeforeRow)) return { froze: false }

  if (!freezeAvailableForWeekOf(days, yesterday)) {
    // A live streak just died: yesterday missed, no freeze left.
    await track("streak_reset", { userId, properties: { missedDate: yesterday } })
    return { froze: false }
  }

  const inserted = await db
    .insert(schema.dailyActivity)
    .values({ userId, activityDate: yesterday, videosCompleted: 0, isFrozen: true })
    .onConflictDoNothing({
      target: [schema.dailyActivity.userId, schema.dailyActivity.activityDate],
    })
    .returning({ id: schema.dailyActivity.id })

  if (inserted.length > 0) {
    await track("streak_frozen", { userId, properties: { frozenDate: yesterday } })
  }
  return { froze: inserted.length > 0 }
}

/** Runs maintenance across all users — invoked by the hourly cron (PS-12). */
export async function runStreakMaintenance(now: Date = new Date()): Promise<number> {
  const users = await db
    .select({ id: schema.users.id, timezone: schema.users.timezone })
    .from(schema.users)
  let frozeCount = 0
  for (const user of users) {
    const { froze } = await runStreakMaintenanceForUser(user.id, user.timezone, now)
    if (froze) frozeCount++
  }
  return frozeCount
}
