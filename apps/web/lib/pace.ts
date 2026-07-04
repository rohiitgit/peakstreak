import { addDays } from "@/lib/dates"

/**
 * Pace & ETA math (PS-4/PS-5). Pure functions — unit tested in
 * tests/pace.test.ts. All "days" results are whole days, rounded up:
 * finishing mid-day still occupies that day.
 */

export type PaceType = "minutes_per_day" | "videos_per_day"

export interface Pace {
  type: PaceType
  value: number
}

export const PACE_LIMITS = {
  minutes_per_day: { min: 5, max: 24 * 60 },
  videos_per_day: { min: 1, max: 100 },
} as const

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const

export function validatePace(pace: Pace): string | null {
  if (!Number.isFinite(pace.value) || !Number.isInteger(pace.value)) {
    return "Pace must be a whole number."
  }
  const limits = PACE_LIMITS[pace.type]
  if (pace.value < limits.min) {
    return pace.type === "minutes_per_day"
      ? `At least ${limits.min} minutes a day — below that the estimate is meaningless.`
      : "At least 1 video a day."
  }
  if (pace.value > limits.max) {
    return pace.type === "minutes_per_day"
      ? "There are only 24 hours in a day."
      : `More than ${limits.max} videos a day isn't a pace, it's a marathon.`
  }
  return null
}

export function isValidPlaybackSpeed(speed: number): boolean {
  return (PLAYBACK_SPEEDS as readonly number[]).includes(speed)
}

/**
 * Days needed to finish the remaining material at a pace.
 *
 * Time-based pace: playback speed divides the effective runtime (watching
 * at 2x halves the days). Video-count pace: speed is irrelevant — a video
 * is a video no matter how fast you watch it.
 */
export function estimateDays(input: {
  remainingSeconds: number
  remainingVideos: number
  pace: Pace
  playbackSpeed?: number
}): number {
  const speed = input.playbackSpeed ?? 1
  if (input.remainingVideos <= 0 || input.remainingSeconds < 0) return 0

  if (input.pace.type === "videos_per_day") {
    return Math.ceil(input.remainingVideos / input.pace.value)
  }
  const effectiveSeconds = input.remainingSeconds / speed
  return Math.ceil(effectiveSeconds / (input.pace.value * 60))
}

/** Finish date given a local start date (YYYY-MM-DD) and days of work.
 * Day 1 of watching is the start date itself, so 20 days from 2026-07-05
 * means finishing on 2026-07-24. Zero days = already done = today. */
export function finishDate(startDate: string, days: number): string {
  return addDays(startDate, Math.max(0, days - 1))
}

/** "14h 32m" / "45m" / "32s"-style human runtime. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  if (safe < 60) return `${safe}s`
  let hours = Math.floor(safe / 3600)
  let minutes = Math.round((safe % 3600) / 60)
  if (minutes === 60) {
    hours += 1
    minutes = 0
  }
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
