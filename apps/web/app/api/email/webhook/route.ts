import { eq } from "drizzle-orm"
import { z } from "zod"

import { track } from "@/lib/analytics"
import { db, schema } from "@/lib/db"

const eventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string() }).passthrough(),
})

/**
 * Resend event webhook — records opens into email_log so "streak saves"
 * (return within 2h of a reminder) are measurable. Only ever sets an
 * opened_at timestamp, so an unverified payload can't do damage; add
 * svix signature verification alongside real provider config.
 */
export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 })

  if (parsed.data.type === "email.opened") {
    const [row] = await db
      .update(schema.emailLog)
      .set({ openedAt: new Date() })
      .where(eq(schema.emailLog.providerMessageId, parsed.data.data.email_id))
      .returning({ userId: schema.emailLog.userId })
    if (row) track("reminder_opened", { userId: row.userId })
  }

  return Response.json({ received: true })
}
