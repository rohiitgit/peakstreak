import { eq } from "drizzle-orm"
import { z } from "zod"

import { db, schema } from "@/lib/db"

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#010102;color:#f7f8f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
<div style="max-width:420px;padding:32px;text-align:center;">
<p style="font-weight:600;margin:0 0 16px;">Peak<span style="color:#5e6ad2;">Streak</span></p>
<h1 style="font-size:18px;margin:0 0 8px;">${title}</h1>
<p style="color:#8a8f98;font-size:14px;line-height:1.6;">${body}</p>
</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

async function unsubscribe(token: string | null): Promise<Response> {
  if (!token || !z.string().uuid().safeParse(token).success) {
    return page("That link doesn't work", "The unsubscribe link is malformed or incomplete.", 400)
  }

  const [updated] = await db
    .update(schema.emailPreferences)
    .set({ remindersEnabled: false, updatedAt: new Date() })
    .where(eq(schema.emailPreferences.unsubscribeToken, token))
    .returning({ userId: schema.emailPreferences.userId })

  if (!updated) {
    return page("That link doesn't work", "We couldn't find a matching subscription.", 404)
  }
  return page(
    "You're unsubscribed",
    "Daily reminders are off. You can re-enable them anytime from Settings → Email reminders.",
  )
}

/** One-click unsubscribe — token-authed, works logged-out (PS-12). */
export async function GET(request: Request) {
  return unsubscribe(new URL(request.url).searchParams.get("token"))
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(request: Request) {
  return unsubscribe(new URL(request.url).searchParams.get("token"))
}
