import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, Flame, NotebookPen } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { auth } from "@/lib/auth"
import { LandingPaste } from "@/components/landing-paste"

const STEPS = [
  {
    icon: CalendarDays,
    title: "See the real cost up front",
    body: "Total runtime, video count, and a finish date computed from a pace you choose — before you commit a single evening.",
  },
  {
    icon: Flame,
    title: "Keep a streak, earn a freeze",
    body: "One video a day keeps the flame lit. Miss a day? A weekly streak freeze has your back — twice doesn't.",
  },
  {
    icon: NotebookPen,
    title: "Finish with proof you learned",
    body: "Private notes beside every video, compiled into one exportable document the day you finish.",
  },
]

export default async function LandingPage() {
  const session = await auth()
  if (session?.user) redirect("/dashboard")

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <span className="text-base font-semibold tracking-tight">
          Peak<span className="text-primary">Streak</span>
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/login" />}>
            Log in
          </Button>
          <Button variant="outline" render={<Link href="/signup" />}>
            Sign up
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Paste a playlist. See exactly how long it takes.{" "}
            <span className="text-primary">Actually finish it.</span>
          </h1>
          <p className="text-muted-foreground max-w-xl text-base text-balance">
            YouTube is built to keep you watching, not to help you finish. PeakStreak turns any
            playlist into a plan with a finish date, a daily streak, and a nudge when you slip.
          </p>
          <LandingPaste />
          <p className="text-muted-foreground text-xs">
            Free · works with any public YouTube playlist · no YouTube account access needed
          </p>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="border-border bg-card rounded-xl border p-6">
              <step.icon className="text-primary size-5" />
              <h2 className="mt-3 text-sm font-semibold">{step.title}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-border text-muted-foreground border-t py-8 text-center text-xs">
        PeakStreak — for people who save playlists with real intent.
      </footer>
    </div>
  )
}
