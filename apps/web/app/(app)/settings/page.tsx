import type { Metadata } from "next"
import { eq } from "drizzle-orm"

import { requireUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { ensureUserDefaults, getUser } from "@/lib/user"
import { SettingsForm } from "@/components/settings-form"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const userId = await requireUserId()
  await ensureUserDefaults(userId)
  const user = await getUser(userId)
  const prefs = await db.query.emailPreferences.findFirst({
    where: eq(schema.emailPreferences.userId, userId),
  })

  return (
    <div className="mx-auto max-w-lg py-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-muted-foreground mt-1 mb-8 text-sm">
        Your day boundary and reminders follow this timezone.
      </p>
      <SettingsForm
        timezone={user.timezone}
        remindersEnabled={prefs?.remindersEnabled ?? true}
        reminderHourLocal={prefs?.reminderHourLocal ?? 19}
      />
    </div>
  )
}
