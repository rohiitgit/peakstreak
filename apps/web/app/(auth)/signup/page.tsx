import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { googleOAuthEnabled } from "@/lib/env"
import { AuthForm } from "@/components/auth-form"

export const metadata: Metadata = { title: "Sign up" }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect("/dashboard")
  const { callbackUrl } = await searchParams

  return (
    <>
      <h1 className="mb-1 text-center text-xl font-semibold">Create your account</h1>
      <p className="text-muted-foreground mb-6 text-center text-sm">
        Paste a playlist, pick a pace, actually finish it.
      </p>
      <AuthForm
        mode="signup"
        googleEnabled={googleOAuthEnabled()}
        callbackUrl={callbackUrl?.startsWith("/") ? callbackUrl : "/dashboard"}
      />
    </>
  )
}
