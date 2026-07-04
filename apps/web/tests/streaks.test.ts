import { beforeEach, describe, expect, it } from "vitest"

import { db, resetDb, schema, seedUser } from "./helpers"

import {
  computeStreaks,
  freezeAvailableForWeekOf,
  getStreakSummary,
  runStreakMaintenanceForUser,
  type ActivityDay,
} from "@/lib/streaks"

function day(date: string, videos = 1, frozen = false): ActivityDay {
  return { activityDate: date, videosCompleted: videos, isFrozen: frozen }
}

describe("computeStreaks (pure)", () => {
  it("N consecutive active days yield streak N; multiple videos count once", () => {
    const days = [day("2026-07-01", 3), day("2026-07-02"), day("2026-07-03", 5)]
    const stats = computeStreaks(days, "2026-07-03")
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(3)
    expect(stats.activeToday).toBe(true)
  })

  it("a not-yet-active today keeps yesterday's streak alive", () => {
    const days = [day("2026-07-01"), day("2026-07-02")]
    const stats = computeStreaks(days, "2026-07-03")
    expect(stats.currentStreak).toBe(2)
    expect(stats.activeToday).toBe(false)
  })

  it("a frozen day bridges the runs on both sides", () => {
    const days = [
      day("2026-07-01"),
      day("2026-07-02"),
      day("2026-07-03", 0, true), // frozen
      day("2026-07-04"),
    ]
    const stats = computeStreaks(days, "2026-07-04")
    expect(stats.currentStreak).toBe(4)
  })

  it("a frozen day does not read as activeToday", () => {
    const stats = computeStreaks([day("2026-07-04", 0, true)], "2026-07-04")
    expect(stats.activeToday).toBe(false)
    expect(stats.currentStreak).toBe(1)
  })

  it("an unfrozen gap resets the current streak but keeps the longest", () => {
    const days = [
      day("2026-06-01"),
      day("2026-06-02"),
      day("2026-06-03"),
      day("2026-06-04"),
      // gap on 06-05
      day("2026-06-06"),
      day("2026-06-07"),
    ]
    const stats = computeStreaks(days, "2026-06-07")
    expect(stats.currentStreak).toBe(2)
    expect(stats.longestStreak).toBe(4)
  })

  it("no activity at all → zeros", () => {
    const stats = computeStreaks([], "2026-07-05")
    expect(stats).toEqual({ currentStreak: 0, longestStreak: 0, activeToday: false })
  })

  it("handles month boundaries in runs", () => {
    const days = [day("2026-06-29"), day("2026-06-30"), day("2026-07-01")]
    expect(computeStreaks(days, "2026-07-01").currentStreak).toBe(3)
  })
})

describe("freezeAvailableForWeekOf", () => {
  it("is available when no frozen day exists this week", () => {
    expect(freezeAvailableForWeekOf([day("2026-07-01")], "2026-07-05")).toBe(true)
  })

  it("is consumed by a frozen day in the same Monday-based week", () => {
    // 2026-07-05 is a Sunday; its week starts Mon 2026-06-29
    const days = [day("2026-07-01", 0, true)]
    expect(freezeAvailableForWeekOf(days, "2026-07-05")).toBe(false)
  })

  it("resets in the following calendar week (non-stacking)", () => {
    const days = [day("2026-07-01", 0, true)]
    expect(freezeAvailableForWeekOf(days, "2026-07-06")).toBe(true) // next Monday
  })
})

describe("runStreakMaintenanceForUser (DB)", () => {
  beforeEach(resetDb)

  async function seedActivity(userId: string, dates: Array<[string, number] | [string, number, boolean]>) {
    await db.insert(schema.dailyActivity).values(
      dates.map(([activityDate, videosCompleted, isFrozen]) => ({
        userId,
        activityDate,
        videosCompleted,
        isFrozen: isFrozen ?? false,
      })),
    )
  }

  // "Now" such that the user's local (IST) today is 2026-07-05.
  const NOW = new Date("2026-07-05T06:00:00Z")

  it("freezes a single missed day when the streak was alive", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    await seedActivity(user.id, [
      ["2026-07-02", 1],
      ["2026-07-03", 2],
      // 07-04 missed; today (07-05) in progress
    ])

    const result = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    expect(result.froze).toBe(true)

    const summary = await getStreakSummary(user.id, user.timezone, NOW)
    expect(summary.currentStreak).toBe(3) // 02, 03, frozen 04
    expect(summary.freezeAvailable).toBe(false)
    expect(summary.frozenDateThisWeek).toBe("2026-07-04")
  })

  it("is idempotent — re-running the job doesn't stack freezes", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    await seedActivity(user.id, [["2026-07-03", 1]])

    const first = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    const second = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    expect(first.froze).toBe(true)
    expect(second.froze).toBe(false)
  })

  it("does not freeze when the freeze was already used this week", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    // Week of Mon 2026-06-29: freeze consumed on Wed 07-01.
    await seedActivity(user.id, [
      ["2026-06-30", 1],
      ["2026-07-01", 0, true],
      ["2026-07-02", 1],
      ["2026-07-03", 1],
      // 07-04 missed again, same week
    ])

    const result = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    expect(result.froze).toBe(false)

    const summary = await getStreakSummary(user.id, user.timezone, NOW)
    expect(summary.currentStreak).toBe(0) // gap stands → reset
  })

  it("does not spend a freeze when no streak was alive", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    // Last activity long ago — nothing to preserve.
    await seedActivity(user.id, [["2026-06-20", 1]])

    const result = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    expect(result.froze).toBe(false)
  })

  it("does nothing when yesterday was active", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    await seedActivity(user.id, [["2026-07-04", 1]])
    const result = await runStreakMaintenanceForUser(user.id, user.timezone, NOW)
    expect(result.froze).toBe(false)
  })

  it("allows a fresh freeze the following calendar week", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    // Freeze used Wed 07-01 (week of 06-29). New week starts Mon 07-06.
    await seedActivity(user.id, [
      ["2026-07-01", 0, true],
      ["2026-07-02", 1],
      ["2026-07-03", 1],
      ["2026-07-04", 1],
      ["2026-07-05", 1],
      ["2026-07-06", 1],
      // Tue 07-07 missed; local today = Wed 07-08
    ])
    const now = new Date("2026-07-08T06:00:00Z")

    const result = await runStreakMaintenanceForUser(user.id, user.timezone, now)
    expect(result.froze).toBe(true)

    const summary = await getStreakSummary(user.id, user.timezone, now)
    expect(summary.currentStreak).toBe(7) // 02..06 active, 07 frozen, 08 pending
    expect(summary.frozenDateThisWeek).toBe("2026-07-07")
  })

  it("streak state is correct after days of absence without any login", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    await seedActivity(user.id, [
      ["2026-06-28", 1],
      ["2026-06-29", 1],
      // absent since
    ])
    // Maintenance ran daily; freezes couldn't save a multi-day gap.
    for (const iso of ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]) {
      await runStreakMaintenanceForUser(user.id, user.timezone, new Date(`${iso}T06:00:00Z`))
    }
    const summary = await getStreakSummary(
      user.id,
      user.timezone,
      new Date("2026-07-05T06:00:00Z"),
    )
    expect(summary.currentStreak).toBe(0)
    expect(summary.longestStreak).toBe(3) // 28, 29, frozen 30
  })
})
