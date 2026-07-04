import { Resend } from "resend"

import { env } from "@/lib/env"

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export type EmailTransport = (email: OutgoingEmail) => Promise<{ providerMessageId: string | null }>

let resend: Resend | null = null

/**
 * Sends via Resend when configured; in local dev without a key it logs
 * to the console so the whole reminder loop stays testable.
 */
export const sendEmail: EmailTransport = async (email) => {
  const key = env().RESEND_API_KEY
  if (!key) {
    console.info(
      `[email] (dev, not sent) to=${email.to} subject="${email.subject}"\n${email.text.slice(0, 500)}`,
    )
    return { providerMessageId: null }
  }

  resend ??= new Resend(key)
  const { data, error } = await resend.emails.send({
    from: env().EMAIL_FROM,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
  return { providerMessageId: data?.id ?? null }
}
