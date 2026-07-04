"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { normalizeTimezone } from "@/lib/user"

const settingsSchema = z.object({
  timezone: z.string().min(1),
  remindersEnabled: z.boolean(),
  reminderHourLocal: z.number().int().min(0).max(23),
})

export type SettingsState = { error?: string; saved?: boolean }

export async function updateSettings(
  input: z.infer<typeof settingsSchema>,
): Promise<SettingsState> {
  const userId = await requireUserId()

  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid settings." }

  const timezone = normalizeTimezone(parsed.data.timezone)
  if (timezone !== parsed.data.timezone) {
    return { error: "Unknown timezone — pick one from the list." }
  }

  await db.update(schema.users).set({ timezone, updatedAt: new Date() }).where(eq(schema.users.id, userId))
  await db
    .update(schema.emailPreferences)
    .set({
      remindersEnabled: parsed.data.remindersEnabled,
      reminderHourLocal: parsed.data.reminderHourLocal,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailPreferences.userId, userId))

  revalidatePath("/settings")
  return { saved: true }
}
