import { beforeEach, describe, expect, it } from "vitest"

import { db, resetDb, schema, seedEnrollment, seedUser } from "./helpers"

import { eq } from "drizzle-orm"

import { runReminderSweep } from "@/lib/reminders"
import type { EmailTransport, OutgoingEmail } from "@/lib/email/send"

function fakeTransport() {
  const sentEmails: OutgoingEmail[] = []
  const transport: EmailTransport = async (email) => {
    sentEmails.push(email)
    return { providerMessageId: `fake-${sentEmails.length}` }
  }
  return { sentEmails, transport }
}

// 19:00 IST on 2026-07-05 = 13:30 UTC — inside the default reminder hour.
const REMINDER_TIME = new Date("2026-07-05T13:30:00Z")
// 15:00 IST — outside it.
const OFF_HOUR = new Date("2026-07-05T09:30:00Z")

async function seedReminderUser() {
  const user = await seedUser({ timezone: "Asia/Kolkata", name: "Asha" })
  await db.insert(schema.emailPreferences).values({ userId: user.id })
  const seeded = await seedEnrollment({ userId: user.id, videoCount: 3 })
  return { user, ...seeded }
}

describe("runReminderSweep", () => {
  beforeEach(resetDb)

  it("sends exactly one email to an inactive user at their local hour", async () => {
    const { user } = await seedReminderUser()
    const { sentEmails, transport } = fakeTransport()

    const result = await runReminderSweep(REMINDER_TIME, transport)

    expect(result.sent).toBe(1)
    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0]!.to).toBe(user.email)
    expect(sentEmails[0]!.headers?.["List-Unsubscribe"]).toContain("/api/email/unsubscribe?token=")
    expect(sentEmails[0]!.text).toContain("/watch/")

    const log = await db.query.emailLog.findMany({ where: eq(schema.emailLog.userId, user.id) })
    expect(log).toHaveLength(1)
    expect(log[0]!.providerMessageId).toBe("fake-1")
  })

  it("running the sweep twice in the same hour cannot double-send", async () => {
    await seedReminderUser()
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport)
    await runReminderSweep(REMINDER_TIME, transport)
    // A slightly later overlapping invocation, still the same local day:
    await runReminderSweep(new Date("2026-07-05T13:45:00Z"), transport)

    expect(sentEmails).toHaveLength(1)
  })

  it("skips users who already completed a video today", async () => {
    const { user } = await seedReminderUser()
    await db.insert(schema.dailyActivity).values({
      userId: user.id,
      activityDate: "2026-07-05",
      videosCompleted: 1,
    })
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport)
    expect(sentEmails).toHaveLength(0)
  })

  it("does nothing outside the user's reminder hour", async () => {
    await seedReminderUser()
    const { sentEmails, transport } = fakeTransport()

    const result = await runReminderSweep(OFF_HOUR, transport)
    expect(result.considered).toBe(0)
    expect(sentEmails).toHaveLength(0)
  })

  it("never emails users with reminders disabled", async () => {
    const { user } = await seedReminderUser()
    await db
      .update(schema.emailPreferences)
      .set({ remindersEnabled: false })
      .where(eq(schema.emailPreferences.userId, user.id))
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport)
    expect(sentEmails).toHaveLength(0)
  })

  it("never emails users with zero active playlists", async () => {
    const user = await seedUser({ timezone: "Asia/Kolkata" })
    await db.insert(schema.emailPreferences).values({ userId: user.id })
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport)
    expect(sentEmails).toHaveLength(0)
  })

  it("never emails users whose playlists are all completed", async () => {
    const { enrollment } = await seedReminderUser()
    await db
      .update(schema.userPlaylists)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(schema.userPlaylists.id, enrollment.id))
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport)
    expect(sentEmails).toHaveLength(0)
  })

  it("respects a custom reminder hour", async () => {
    const { user } = await seedReminderUser()
    await db
      .update(schema.emailPreferences)
      .set({ reminderHourLocal: 7 }) // 7 AM IST = 01:30 UTC
      .where(eq(schema.emailPreferences.userId, user.id))
    const { sentEmails, transport } = fakeTransport()

    await runReminderSweep(REMINDER_TIME, transport) // 7 PM IST — not their hour
    expect(sentEmails).toHaveLength(0)

    await runReminderSweep(new Date("2026-07-05T01:30:00Z"), transport)
    expect(sentEmails).toHaveLength(1)
  })

  it("a failed send keeps the claim — no duplicate on the next run", async () => {
    await seedReminderUser()
    let attempts = 0
    const failing: EmailTransport = async () => {
      attempts++
      throw new Error("provider down")
    }
    const first = await runReminderSweep(REMINDER_TIME, failing)
    expect(first.sent).toBe(0)
    expect(attempts).toBe(1)

    const { sentEmails, transport } = fakeTransport()
    await runReminderSweep(REMINDER_TIME, transport)
    expect(sentEmails).toHaveLength(0) // claim already taken today
  })
})
