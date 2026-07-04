/**
 * Timezone/day-boundary helpers. The product-wide rule (ARCHITECTURE §6):
 * timestamps are stored in UTC; a user's *local calendar date* is computed
 * at write time from their IANA timezone and persisted as a plain date
 * string. These helpers are pure and side-effect free.
 *
 * A "date string" here is always YYYY-MM-DD.
 */

/** The user's local calendar date for a given instant. */
export function localDateString(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

/** The user's local hour (0-23) for a given instant — reminder windowing. */
export function localHour(instant: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
    }).format(instant),
  )
}

function toUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number): string {
  return fromUtcMs(toUtcMs(dateStr) + days * 86400000)
}

/** b - a in whole days. Positive when b is after a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000)
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(dateStr: string): number {
  const day = new Date(toUtcMs(dateStr)).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * The Monday starting the calendar week containing this date.
 * Used as the key for the weekly streak-freeze allowance.
 */
export function weekStart(dateStr: string): string {
  return addDays(dateStr, 1 - isoDayOfWeek(dateStr))
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return fromUtcMs(toUtcMs(value)) === value
}
