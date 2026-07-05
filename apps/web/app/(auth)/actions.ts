"use server"

import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { z } from "zod"

import { track } from "@/lib/analytics"
import { signIn, signOut } from "@/lib/auth"
import { requestPasswordReset, resetPassword } from "@/lib/auth/password-reset"
import { db, schema } from "@/lib/db"
import { checkRateLimits, clientIp } from "@/lib/rate-limit"
import { ensureUserDefaults, normalizeTimezone } from "@/lib/user"

export type AuthFormState = { error?: string }
export type ForgotPasswordState = { error?: string; sent?: boolean }
export type ResetPasswordState = { error?: string }

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

function safeCallbackUrl(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? "")
  // Only same-origin relative paths — never redirect off-site after auth.
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { email, password } = parsed.data
  const name = String(formData.get("name") ?? "").trim() || null
  const timezone = normalizeTimezone(String(formData.get("timezone") ?? ""))

  const passwordHash = await bcrypt.hash(password, 12)

  const [user] = await db
    .insert(schema.users)
    .values({ email, name, passwordHash, timezone })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id })

  if (!user) {
    return { error: "An account with this email already exists — try logging in." }
  }
  await ensureUserDefaults(user.id)
  track("signup", { userId: user.id, properties: { method: "credentials" } })

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    })
    return {}
  } catch (error) {
    // The account row was already created above; only the auto-login failed
    // (e.g. a transient DB error inside the authorize callback). Point the
    // user at login rather than crashing the page — their credentials work.
    if (error instanceof AuthError) {
      return { error: "Your account was created, but automatic sign-in failed. Please log in." }
    }
    throw error // NEXT_REDIRECT on success — let Next handle it
  }
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim()

  // Throttle both the account (brute-force one email) and the source IP
  // (spray many emails from one host). Either tripping stops the attempt.
  const ip = await clientIp()
  const { ok } = await checkRateLimits([
    { name: "login-email", identifier: email || "unknown", limit: 6, window: "15 m" },
    { name: "login-ip", identifier: ip, limit: 20, window: "15 m" },
  ])
  if (!ok) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." }
  }

  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." }
    }
    throw error // NEXT_REDIRECT on success — let Next handle it
  }
}

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"))
  if (!email.success) {
    return { error: "Enter a valid email address" }
  }

  // Throttle to stop email-bombing an address and burning Resend quota. When
  // limited we skip the send but STILL return the neutral "sent" response —
  // the whole point of this flow is that its answer never varies, so it can't
  // be probed for which emails exist (or which are being throttled).
  const ip = await clientIp()
  const { ok } = await checkRateLimits([
    { name: "pwreset-email", identifier: email.data, limit: 3, window: "1 h" },
    { name: "pwreset-ip", identifier: ip, limit: 10, window: "1 h" },
  ])
  if (ok) {
    await requestPasswordReset(email.data)
  }
  return { sent: true }
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const outcome = await resetPassword(parsed.data.token, parsed.data.password)
  if (outcome === "expired") {
    return { error: "This reset link has expired. Request a new one." }
  }
  if (outcome === "invalid") {
    return { error: "This reset link is invalid or has already been used." }
  }
  redirect("/login?reset=1")
}

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
