import { z } from "zod"

/**
 * Server-side environment configuration.
 *
 * Required vars fail fast at boot (see instrumentation.ts) with a clear
 * message instead of surfacing as confusing runtime errors deep in a request.
 * Optional vars gate features: the Google button hides without OAuth creds,
 * and emails fall back to console logging without a Resend key.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required — generate with `openssl rand -base64 32`"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  YOUTUBE_API_KEY: z.string().min(1, "YOUTUBE_API_KEY is required — create one in Google Cloud Console"),
  PLAYLIST_SYNC_TTL_HOURS: z.coerce.number().int().positive().default(24),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("PeakStreak <nudge@localhost>"),
  // Inbox that receives "Send feedback" submissions. Optional — without it,
  // feedback is still stored in the DB, just not emailed.
  FEEDBACK_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().optional(),

  // Upstash Redis (REST) backs rate limiting. Both optional — without them,
  // rate limiting fails open (allows everything), same feature-gating pattern
  // as Google OAuth. Use the REST URL/TOKEN, NOT the redis:// connection string.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env)
    if (!parsed.success) {
      const problems = parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")
      throw new Error(`Missing or invalid environment variables:\n${problems}`)
    }
    if (process.env.NODE_ENV === "production" && !parsed.data.CRON_SECRET) {
      throw new Error("CRON_SECRET is required in production — cron routes must not be public")
    }
    cached = parsed.data
  }
  return cached
}

export function googleOAuthEnabled(): boolean {
  const e = env()
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)
}

export function rateLimitEnabled(): boolean {
  const e = env()
  return Boolean(e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN)
}
