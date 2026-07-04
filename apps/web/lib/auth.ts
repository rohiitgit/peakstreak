import { DrizzleAdapter } from "@auth/drizzle-adapter"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import NextAuth, { type NextAuthResult } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { track } from "@/lib/analytics"
import { db, schema } from "@/lib/db"
import { env, googleOAuthEnabled } from "@/lib/env"
import { ensureUserDefaults } from "@/lib/user"

const nextAuth = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // JWT sessions: required for the Credentials provider, and they persist
  // across browser restarts (30-day cookie) without a DB read per request.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleOAuthEnabled()
      ? [
          Google({
            clientId: env().GOOGLE_CLIENT_ID,
            clientSecret: env().GOOGLE_CLIENT_SECRET,
            // Links a Google sign-in to an existing email/password account
            // with the same address. Safe here because Google verifies
            // email ownership before issuing the profile.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim()
        const password = String(credentials?.password ?? "")
        if (!email || !password) return null

        const user = await db.query.users.findFirst({
          where: eq(schema.users.email, email),
        })
        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id
        // Only present at sign-in — i.e., once per session.
        track("session_started", { userId: user.id })
      }
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
  events: {
    // Fires when the adapter creates a user (OAuth signups). Credentials
    // signups create their row + defaults directly in the signup action.
    async createUser({ user }) {
      if (user.id) {
        await ensureUserDefaults(user.id)
        track("signup", { userId: user.id, properties: { method: "google" } })
      }
    },
  },
})

// Explicit annotations work around TS2742 ("inferred type cannot be named")
// caused by pnpm's nested node_modules layout.
export const handlers: NextAuthResult["handlers"] = nextAuth.handlers
export const auth: NextAuthResult["auth"] = nextAuth.auth
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
    }
  }
}

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/** The signed-in user's id; throws if unauthenticated (routes behind proxy). */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId()
  if (!id) throw new Error("Unauthenticated")
  return id
}
