"use client"

import { useActionState, useEffect, useRef } from "react"
import Link from "next/link"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

import {
  googleSignInAction,
  loginAction,
  signupAction,
  type AuthFormState,
} from "@/app/(auth)/actions"

export function AuthForm({
  mode,
  googleEnabled,
  callbackUrl,
}: {
  mode: "login" | "signup"
  googleEnabled: boolean
  callbackUrl: string
}) {
  const action = mode === "login" ? loginAction : signupAction
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {})
  const timezoneRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Capture the browser timezone so streak day-boundaries are right
    // from the first completion. Falls back to Asia/Kolkata server-side.
    if (timezoneRef.current) {
      timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
    }
  }, [])

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <>
          <form action={googleSignInAction}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <input type="hidden" name="timezone" ref={timezoneRef} />

        {mode === "signup" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Your name" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          />
        </div>

        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? mode === "login"
              ? "Logging in…"
              : "Creating account…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-primary hover:underline">
              Sign up
            </Link>
            <span className="mx-1.5">·</span>
            <Link href="/forgot-password" className="hover:underline">
              Forgot password?
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-primary hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
