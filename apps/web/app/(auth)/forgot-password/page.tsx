import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

export const metadata: Metadata = { title: "Reset password" }

// Reset-flow stub (per PS-2): accepts the request and shows a neutral
// confirmation. Actual reset emails ship with the email system work.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams

  return (
    <>
      <h1 className="mb-1 text-center text-xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="text-muted-foreground mt-4 text-center text-sm">
          If an account exists for that address, a reset link is on its way.{" "}
          <Link href="/login" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      ) : (
        <>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <form action="/forgot-password" method="GET" className="flex flex-col gap-4">
            <input type="hidden" name="sent" value="1" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@example.com" />
            </div>
            <Button type="submit" className="w-full">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </>
  )
}
