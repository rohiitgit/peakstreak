import { env } from "@/lib/env"

export interface ReminderTemplateInput {
  name: string | null
  playlistTitle: string
  currentStreak: number
  watchUrl: string
  unsubscribeUrl: string
}

/** The streak-jeopardy reminder (PS-12). Plain, fast, single CTA. */
export function reminderEmail(input: ReminderTemplateInput) {
  const firstName = input.name?.split(" ")[0] ?? "there"
  const streakLine =
    input.currentStreak > 0
      ? `Your ${input.currentStreak}-day streak is about to cool down 🔥`
      : "Your streak is waiting to be lit 🔥"

  const subject =
    input.currentStreak > 0
      ? `Your ${input.currentStreak}-day streak is about to cool down 🔥`
      : `Pick up where you left off in “${input.playlistTitle}”`

  const text = [
    `Hey ${firstName},`,
    ``,
    `${streakLine} — you haven't watched anything today.`,
    ``,
    `Pick up where you left off in “${input.playlistTitle}”:`,
    input.watchUrl,
    ``,
    `One video keeps the streak alive.`,
    ``,
    `— PeakStreak`,
    ``,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n")

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#010102;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <p style="color:#f7f8f8;font-size:16px;font-weight:600;margin:0 0 4px;">Peak<span style="color:#5e6ad2;">Streak</span></p>
      <h1 style="color:#f7f8f8;font-size:20px;margin:24px 0 8px;">${streakLine}</h1>
      <p style="color:#8a8f98;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hey ${firstName} — you haven't watched anything today. One video keeps the streak alive.
      </p>
      <a href="${input.watchUrl}"
         style="display:inline-block;background:#5e6ad2;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">
        Continue “${escapeHtml(input.playlistTitle)}”
      </a>
      <p style="color:#62666d;font-size:12px;margin:32px 0 0;">
        Getting these at the wrong time? <a href="${env().NEXT_PUBLIC_APP_URL}/settings" style="color:#8a8f98;">Change your reminder hour</a>
        or <a href="${input.unsubscribeUrl}" style="color:#8a8f98;">unsubscribe</a>.
      </p>
    </div>
  </body>
</html>`

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
