import { Ratelimit, type Duration } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { headers } from "next/headers"

import { env } from "@/lib/env"

/**
 * Rate limiting for abuse-prone endpoints (login, password-reset, feedback,
 * playlist preview). Backed by Upstash Redis over its REST API — the only
 * shape that survives serverless, where each invocation is isolated and an
 * in-memory counter would never see a second request.
 *
 * Fail-open by design: if the Upstash keys are unset (local dev) or Redis is
 * unreachable, requests are ALLOWED. A rate limiter that takes the whole app
 * down when its backing store blinks is worse than the abuse it prevents.
 */

let redis: Redis | null = null

function getRedis(): Redis | null {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env()
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return null
  redis ??= new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
  return redis
}

// One Ratelimit instance per (name, limit, window) — created lazily and reused
// so we don't rebuild the sliding-window machinery on every request.
const limiters = new Map<string, Ratelimit>()

function getLimiter(name: string, limit: number, window: Duration): Ratelimit | null {
  const r = getRedis()
  if (!r) return null
  const cacheKey = `${name}:${limit}:${window}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${name}`,
      analytics: false,
    })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

export interface RateLimitRule {
  /** Namespace for the limit, e.g. "login". Keeps counters from colliding. */
  name: string
  /** What we count per — an IP, an email, or `${ip}:${email}`. */
  identifier: string
  /** Max allowed events in the window. */
  limit: number
  /** Window as an Upstash duration string, e.g. "15 m", "1 h", "60 s". */
  window: Duration
}

/**
 * Returns `{ ok: false }` only when a configured limiter is definitively over
 * its limit. Any other outcome — no keys, Redis error — returns `{ ok: true }`.
 */
export async function checkRateLimit(rule: RateLimitRule): Promise<{ ok: boolean }> {
  const limiter = getLimiter(rule.name, rule.limit, rule.window)
  if (!limiter) return { ok: true } // disabled (no keys) → fail open
  try {
    const { success } = await limiter.limit(rule.identifier)
    return { ok: success }
  } catch (error) {
    console.error(`[rate-limit] ${rule.name} check failed, allowing request:`, error)
    return { ok: true } // Redis hiccup → fail open; availability beats perfect limiting
  }
}

/**
 * Passes only if EVERY rule is under its limit. Rules run sequentially and we
 * short-circuit on the first block so we don't spend Redis calls needlessly.
 */
export async function checkRateLimits(rules: RateLimitRule[]): Promise<{ ok: boolean }> {
  for (const rule of rules) {
    const { ok } = await checkRateLimit(rule)
    if (!ok) return { ok: false }
  }
  return { ok: true }
}

/**
 * Best-effort client IP from the proxy headers Vercel sets. Falls back to
 * "unknown" — which buckets all header-less callers together, still a useful
 * (if coarse) throttle rather than a bypass.
 */
export async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"
  return h.get("x-real-ip")?.trim() || "unknown"
}
