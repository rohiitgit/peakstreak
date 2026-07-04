import { beforeEach, describe, expect, it } from "vitest"

import { db, resetDb, schema, seedEnrollment, seedUser } from "./helpers"

import { and, eq } from "drizzle-orm"

import { computeEta, recordCompletion, uncompleteVideo } from "@/lib/progress"

// 23:58 IST on Jul 4 / 00:02 IST on Jul 5 — the boundary pair from PS-7.
const LATE_NIGHT_IST = new Date("2026-07-04T18:28:00Z") // 23:58 IST Jul 4
const PAST_MIDNIGHT_IST = new Date("2026-07-04T18:32:00Z") // 00:02 IST Jul 5

async function activityRows(userId: string) {
  return db
    .select()
    .from(schema.dailyActivity)
    .where(eq(schema.dailyActivity.userId, userId))
    .orderBy(schema.dailyActivity.activityDate)
}

describe("recordCompletion", () => {
  beforeEach(resetDb)

  it("is idempotent — double-firing produces one completion and one activity increment", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 3 })

    const first = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
    })
    const second = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
    })

    expect(first.changed).toBe(true)
    expect(first.firstCompletionToday).toBe(true)
    expect(second.changed).toBe(false)

    const activity = await activityRows(user.id)
    expect(activity).toHaveLength(1)
    expect(activity[0]!.videosCompleted).toBe(1)
  })

  it("survives a concurrent race — auto-complete and manual click fire together", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 2 })

    const results = await Promise.all([
      recordCompletion({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id }),
      recordCompletion({
        userId: user.id,
        userPlaylistId: enrollment.id,
        videoId: videos[0]!.id,
        manual: true,
      }),
    ])

    expect(results.filter((r) => r.changed)).toHaveLength(1)
    const activity = await activityRows(user.id)
    expect(activity).toHaveLength(1)
    expect(activity[0]!.videosCompleted).toBe(1)
  })

  it("attributes completions to the user's local date across midnight (IST)", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 3 })

    const before = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
      now: LATE_NIGHT_IST,
    })
    const after = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[1]!.id,
      now: PAST_MIDNIGHT_IST,
    })

    expect(before.activityDate).toBe("2026-07-04")
    expect(after.activityDate).toBe("2026-07-05")
    expect(after.firstCompletionToday).toBe(true)

    const activity = await activityRows(user.id)
    expect(activity.map((a) => [a.activityDate, a.videosCompleted])).toEqual([
      ["2026-07-04", 1],
      ["2026-07-05", 1],
    ])
  })

  it("attributes the same instant to a different date in a western timezone", async () => {
    const user = await seedUser({ timezone: "America/Los_Angeles" })
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 1 })

    // 02:00 UTC Jul 5 = 19:00 PDT Jul 4
    const result = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
      now: new Date("2026-07-05T02:00:00Z"),
    })
    expect(result.activityDate).toBe("2026-07-04")
  })

  it("only the first completion of a day reports firstCompletionToday", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 3 })
    const now = new Date("2026-07-05T10:00:00Z")

    const a = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
      now,
    })
    const b = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[1]!.id,
      now,
    })
    expect(a.firstCompletionToday).toBe(true)
    expect(b.firstCompletionToday).toBe(false)
  })

  it("flags the enrollment completed when the final video completes", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 2 })

    const first = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
    })
    expect(first.playlistCompleted).toBe(false)

    const last = await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[1]!.id,
    })
    expect(last.playlistCompleted).toBe(true)

    const row = await db.query.userPlaylists.findFirst({
      where: eq(schema.userPlaylists.id, enrollment.id),
    })
    expect(row?.status).toBe("completed")
    expect(row?.completedAt).not.toBeNull()
  })

  it("rejects completions against someone else's enrollment", async () => {
    const owner = await seedUser()
    const attacker = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: owner.id, videoCount: 1 })

    await expect(
      recordCompletion({
        userId: attacker.id,
        userPlaylistId: enrollment.id,
        videoId: videos[0]!.id,
      }),
    ).rejects.toThrow("Enrollment not found")
  })
})

describe("uncompleteVideo", () => {
  beforeEach(resetDb)

  it("removes the day's activity when unmarking its only completion", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 2 })
    await recordCompletion({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id })

    const result = await uncompleteVideo({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
    })

    expect(result.changed).toBe(true)
    expect(await activityRows(user.id)).toHaveLength(0)
  })

  it("keeps the day when other completions remain", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 2 })
    const now = new Date("2026-07-05T10:00:00Z")
    await recordCompletion({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id, now })
    await recordCompletion({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[1]!.id, now })

    await uncompleteVideo({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id })

    const activity = await activityRows(user.id)
    expect(activity).toHaveLength(1)
    expect(activity[0]!.videosCompleted).toBe(1)
  })

  it("rolls back the original local date, not today's", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 2 })
    await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
      now: LATE_NIGHT_IST, // attributed to Jul 4 (IST)
    })
    await recordCompletion({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[1]!.id,
      now: PAST_MIDNIGHT_IST, // attributed to Jul 5 (IST)
    })

    // Unmark the Jul 4 completion "later" — Jul 5's activity must survive.
    await uncompleteVideo({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
      now: new Date("2026-07-05T09:00:00Z"),
    })

    const activity = await activityRows(user.id)
    expect(activity.map((a) => a.activityDate)).toEqual(["2026-07-05"])
  })

  it("no-ops on a video that isn't completed", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 1 })
    const result = await uncompleteVideo({
      userId: user.id,
      userPlaylistId: enrollment.id,
      videoId: videos[0]!.id,
    })
    expect(result.changed).toBe(false)
  })

  it("reopens a completed enrollment", async () => {
    const user = await seedUser()
    const { videos, enrollment } = await seedEnrollment({ userId: user.id, videoCount: 1 })
    await recordCompletion({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id })
    await uncompleteVideo({ userId: user.id, userPlaylistId: enrollment.id, videoId: videos[0]!.id })

    const row = await db.query.userPlaylists.findFirst({
      where: and(eq(schema.userPlaylists.id, enrollment.id)),
    })
    expect(row?.status).toBe("active")
    expect(row?.completedAt).toBeNull()
  })
})

describe("computeEta (pure)", () => {
  const base = {
    remainingSeconds: 5 * 3600,
    remainingVideos: 10,
    completedSeconds: 0,
    completedVideos: 0,
    playbackSpeed: 1,
    startDate: "2026-07-01",
    today: "2026-07-05",
    targetFinishDate: "2026-07-15",
  }

  it("falls back to the chosen pace with no history", () => {
    const eta = computeEta({ ...base, pace: { type: "minutes_per_day", value: 60 } })
    expect(eta.source).toBe("planned")
    expect(eta.daysRemaining).toBe(5)
    expect(eta.projectedFinishDate).toBe("2026-07-10")
    expect(eta.aheadDays).toBe(5) // projected Jul 10 vs target Jul 15
  })

  it("projects from observed video rate when history exists", () => {
    // 5 days elapsed, 10 done → 2/day; 10 remaining → 5 days
    const eta = computeEta({
      ...base,
      completedVideos: 10,
      completedSeconds: 10 * 600,
      pace: { type: "videos_per_day", value: 1 },
    })
    expect(eta.source).toBe("actual")
    expect(eta.daysRemaining).toBe(5)
    expect(eta.projectedFinishDate).toBe("2026-07-10")
  })

  it("projects from observed watch-time rate for time-based pace", () => {
    // 5 days elapsed, 5h watched → 1h/day; 5h remaining → 5 days
    const eta = computeEta({
      ...base,
      completedVideos: 5,
      completedSeconds: 5 * 3600,
      pace: { type: "minutes_per_day", value: 30 },
    })
    expect(eta.source).toBe("actual")
    expect(eta.daysRemaining).toBe(5)
  })

  it("reports behind-schedule as negative aheadDays", () => {
    // 1 video in 5 days → 0.2/day; 10 remaining → 50 days → way past target
    const eta = computeEta({
      ...base,
      completedVideos: 1,
      completedSeconds: 600,
      pace: { type: "videos_per_day", value: 1 },
    })
    expect(eta.aheadDays).toBeLessThan(0)
  })

  it("returns zero days when nothing remains", () => {
    const eta = computeEta({
      ...base,
      remainingSeconds: 0,
      remainingVideos: 0,
      completedVideos: 10,
      completedSeconds: 6000,
      pace: { type: "videos_per_day", value: 1 },
    })
    expect(eta.daysRemaining).toBe(0)
    expect(eta.projectedFinishDate).toBe("2026-07-05")
  })
})
