"use server"

import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"
import { z } from "zod"

import { track } from "@/lib/analytics"
import { signIn, signOut } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { ensureUserDefaults, normalizeTimezone } from "@/lib/user"

export type AuthFormState = { error?: string }

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

  await signIn("credentials", {
    email,
    password,
    redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
  })
  return {}
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "")
        .toLowerCase()
        .trim(),
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

export async function googleSignInAction(formData: FormData) {
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
