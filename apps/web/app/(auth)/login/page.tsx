import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { googleOAuthEnabled } from "@/lib/env"
import { AuthForm } from "@/components/auth-form"

export const metadata: Metadata = { title: "Log in" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect("/dashboard")
  const { callbackUrl } = await searchParams

  return (
    <>
      <h1 className="mb-1 text-center text-xl font-semibold">Welcome back</h1>
      <p className="text-muted-foreground mb-6 text-center text-sm">
        Log in to keep your streak alive.
      </p>
      <AuthForm
        mode="login"
        googleEnabled={googleOAuthEnabled()}
        callbackUrl={callbackUrl?.startsWith("/") ? callbackUrl : "/dashboard"}
      />
    </>
  )
}
