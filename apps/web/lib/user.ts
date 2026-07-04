import { eq } from "drizzle-orm"

import { db, schema } from "@/lib/db"

/**
 * Guarantees the per-user default rows exist (email preferences with
 * reminders enabled at 7 PM local). Idempotent — safe to call on every
 * signup path and repeat sign-ins.
 */
export async function ensureUserDefaults(userId: string) {
  await db.insert(schema.emailPreferences).values({ userId }).onConflictDoNothing()
}

/** Validates an IANA timezone string; falls back to the product default. */
export function normalizeTimezone(tz: string | null | undefined): string {
  if (!tz) return "Asia/Kolkata"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "Asia/Kolkata"
  }
}

export async function getUser(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  if (!user) throw new Error(`User ${userId} not found`)
  return user
}
