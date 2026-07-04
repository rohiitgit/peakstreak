import { describe, expect, it } from "vitest"

import { estimateDays, finishDate, formatDuration, validatePace } from "@/lib/pace"

const TEN_HOURS = 10 * 3600

describe("estimateDays — time-based pace", () => {
  it("10h playlist at 30 min/day at 1x = 20 days", () => {
    expect(
      estimateDays({
        remainingSeconds: TEN_HOURS,
        remainingVideos: 40,
        pace: { type: "minutes_per_day", value: 30 },
        playbackSpeed: 1,
      }),
    ).toBe(20)
  })

  it("10h playlist at 30 min/day at 2x = 10 days", () => {
    expect(
      estimateDays({
        remainingSeconds: TEN_HOURS,
        remainingVideos: 40,
        pace: { type: "minutes_per_day", value: 30 },
        playbackSpeed: 2,
      }),
    ).toBe(10)
  })

  it("rounds partial days up", () => {
    // 61 minutes at 30 min/day → 3rd day needed for the last minute
    expect(
      estimateDays({
        remainingSeconds: 61 * 60,
        remainingVideos: 2,
        pace: { type: "minutes_per_day", value: 30 },
      }),
    ).toBe(3)
  })

  it("1.5x speed scales runtime before dividing", () => {
    // 9h at 1.5x = 6h effective; at 60 min/day = 6 days
    expect(
      estimateDays({
        remainingSeconds: 9 * 3600,
        remainingVideos: 9,
        pace: { type: "minutes_per_day", value: 60 },
        playbackSpeed: 1.5,
      }),
    ).toBe(6)
  })
})

describe("estimateDays — video-count pace", () => {
  it("41 videos at 2/day = 21 days", () => {
    expect(
      estimateDays({
        remainingSeconds: TEN_HOURS,
        remainingVideos: 41,
        pace: { type: "videos_per_day", value: 2 },
      }),
    ).toBe(21)
  })

  it("playback speed does not change video-count pace", () => {
    const base = {
      remainingSeconds: TEN_HOURS,
      remainingVideos: 10,
      pace: { type: "videos_per_day", value: 1 } as const,
    }
    expect(estimateDays({ ...base, playbackSpeed: 2 })).toBe(10)
    expect(estimateDays({ ...base, playbackSpeed: 1 })).toBe(10)
  })

  it("finished playlist needs zero days", () => {
    expect(
      estimateDays({
        remainingSeconds: 0,
        remainingVideos: 0,
        pace: { type: "videos_per_day", value: 1 },
      }),
    ).toBe(0)
  })
})

describe("finishDate", () => {
  it("counts the start date as day 1", () => {
    expect(finishDate("2026-07-05", 20)).toBe("2026-07-24")
    expect(finishDate("2026-07-05", 1)).toBe("2026-07-05")
  })

  it("crosses month and year boundaries", () => {
    expect(finishDate("2026-12-30", 5)).toBe("2027-01-03")
  })

  it("clamps zero/negative days to today", () => {
    expect(finishDate("2026-07-05", 0)).toBe("2026-07-05")
  })
})

describe("validatePace", () => {
  it("rejects zero, negative, fractional, and absurd values", () => {
    expect(validatePace({ type: "minutes_per_day", value: 0 })).toBeTruthy()
    expect(validatePace({ type: "minutes_per_day", value: -30 })).toBeTruthy()
    expect(validatePace({ type: "minutes_per_day", value: 2.5 })).toBeTruthy()
    expect(validatePace({ type: "minutes_per_day", value: 3000 })).toBeTruthy()
    expect(validatePace({ type: "videos_per_day", value: 0 })).toBeTruthy()
    expect(validatePace({ type: "videos_per_day", value: 500 })).toBeTruthy()
  })

  it("accepts sensible values", () => {
    expect(validatePace({ type: "minutes_per_day", value: 30 })).toBeNull()
    expect(validatePace({ type: "videos_per_day", value: 1 })).toBeNull()
    expect(validatePace({ type: "minutes_per_day", value: 1440 })).toBeNull()
  })
})

describe("formatDuration", () => {
  it("formats hours + minutes", () => {
    expect(formatDuration(14 * 3600 + 32 * 60)).toBe("14h 32m")
    expect(formatDuration(45 * 60)).toBe("45m")
    expect(formatDuration(2 * 3600)).toBe("2h")
    expect(formatDuration(32)).toBe("32s")
  })
})
