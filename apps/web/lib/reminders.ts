import { and, desc, eq, sql } from "drizzle-orm"

import { track } from "@/lib/analytics"
import { db, schema } from "@/lib/db"
import { localDateString, localHour } from "@/lib/dates"
import { sendEmail, type EmailTransport } from "@/lib/email/send"
import { reminderEmail } from "@/lib/email/templates"
import { env } from "@/lib/env"
import { nextUnwatchedVideo } from "@/lib/progress"
import { getStreakSummary } from "@/lib/streaks"

/**
 * PS-12: the hourly reminder sweep. For every user whose local clock is
 * inside their chosen reminder hour and who hasn't completed a video
 * today, send at most ONE email — the dedupe is the email_log unique
 * constraint (user, type, local date), claimed BEFORE sending, so an
 * overlapping or re-run cron can never double-send.
 */
export async function runReminderSweep(
  now: Date = new Date(),
  transport: EmailTransport = sendEmail,
): Promise<{ considered: number; sent: number }> {
  const candidates = await db
    .select({
      user: schema.users,
      prefs: schema.emailPreferences,
    })
    .from(schema.users)
    .innerJoin(schema.emailPreferences, eq(schema.emailPreferences.userId, schema.users.id))
    .where(eq(schema.emailPreferences.remindersEnabled, true))

  let considered = 0
  let sent = 0

  for (const { user, prefs } of candidates) {
    if (localHour(now, user.timezone) !== prefs.reminderHourLocal) continue
    considered++

    const today = localDateString(now, user.timezone)

    // Already active today → no nudge needed.
    const [activity] = await db
      .select({ videosCompleted: schema.dailyActivity.videosCompleted })
      .from(schema.dailyActivity)
      .where(
        and(
          eq(schema.dailyActivity.userId, user.id),
          eq(schema.dailyActivity.activityDate, today),
        ),
      )
    if ((activity?.videosCompleted ?? 0) > 0) continue

    // Most recently watched active playlist, falling back to newest.
    const [enrollment] = await db
      .select({
        id: schema.userPlaylists.id,
        playlistId: schema.userPlaylists.playlistId,
        lastWatched: sql<Date | null>`(
          select max(vp.last_watched_at) from video_progress vp
          where vp.user_playlist_id = ${schema.userPlaylists.id}
        )`,
      })
      .from(schema.userPlaylists)
      .where(
        and(eq(schema.userPlaylists.userId, user.id), eq(schema.userPlaylists.status, "active")),
      )
      .orderBy(
        sql`(
          select max(vp.last_watched_at) from video_progress vp
          where vp.user_playlist_id = ${schema.userPlaylists.id}
        ) desc nulls last`,
        desc(schema.userPlaylists.startedAt),
      )
      .limit(1)
    // No active playlists (none, or all completed) → never email.
    if (!enrollment) continue

    const next = await nextUnwatchedVideo(enrollment.id)
    if (!next) continue

    const playlist = await db.query.playlists.findFirst({
      where: eq(schema.playlists.id, enrollment.playlistId),
    })
    if (!playlist) continue

    // Claim today's send slot FIRST. Zero rows back = someone (a parallel
    // run, an earlier run this hour) already claimed it — skip.
    const claimed = await db
      .insert(schema.emailLog)
      .values({ userId: user.id, type: "daily_reminder", sentOnLocalDate: today, sentAt: now })
      .onConflictDoNothing({
        target: [schema.emailLog.userId, schema.emailLog.type, schema.emailLog.sentOnLocalDate],
      })
      .returning({ id: schema.emailLog.id })
    if (claimed.length === 0) continue

    const streak = await getStreakSummary(user.id, user.timezone, now)
    const appUrl = env().NEXT_PUBLIC_APP_URL
    const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${prefs.unsubscribeToken}`
    const template = reminderEmail({
      name: user.name,
      playlistTitle: playlist.title,
      currentStreak: streak.currentStreak,
      watchUrl: `${appUrl}/playlists/${enrollment.id}/watch/${next.videoId}`,
      unsubscribeUrl,
    })

    try {
      const { providerMessageId } = await transport({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      })
      if (providerMessageId) {
        await db
          .update(schema.emailLog)
          .set({ providerMessageId })
          .where(eq(schema.emailLog.id, claimed[0]!.id))
      }
      await track("reminder_sent", {
        userId: user.id,
        properties: { enrollmentId: enrollment.id, localDate: today },
      })
      sent++
    } catch (error) {
      // Keep the claim: a provider hiccup must not turn into a duplicate
      // send on the next run. Log loudly instead.
      console.error(`[reminders] send failed for user ${user.id}:`, error)
    }
  }

  return { considered, sent }
}
