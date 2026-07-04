import { env } from "@/lib/env"
import { runReminderSweep } from "@/lib/reminders"
import { runStreakMaintenance } from "@/lib/streaks"

/**
 * The hourly heartbeat of the habit loop (PS-8 + PS-12): streak/freeze
 * maintenance first (so reminder copy reflects fresh streak state), then
 * the reminder sweep. Both are idempotent — overlapping or re-run
 * invocations are harmless.
 */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const frozeCount = await runStreakMaintenance()
  const reminders = await runReminderSweep()

  const summary = {
    ok: true,
    streakFreezesApplied: frozeCount,
    remindersConsidered: reminders.considered,
    remindersSent: reminders.sent,
    tookMs: Date.now() - startedAt,
  }
  console.info("[cron/hourly]", JSON.stringify(summary))
  return Response.json(summary)
}
