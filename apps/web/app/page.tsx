import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { auth } from "@/lib/auth"
import { SiteHeader } from "@/components/landing/site-header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { StreakBand } from "@/components/landing/streak-band"

export default async function LandingPage() {
  const session = await auth()
  if (session?.user) redirect("/dashboard")

  return (
    <div className="min-h-svh overflow-x-clip">
      <SiteHeader />

      <main>
        <Hero />
        <Features />
        <StreakBand />

        {/* closing CTA */}
        <section className="mx-auto max-w-5xl px-4 pb-28 text-center">
          <div className="border-border bg-card/60 relative overflow-hidden rounded-3xl border px-6 py-16">
            <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Stop saving playlists. Start finishing them.
            </h2>
            <div className="mt-8 flex justify-center">
              <Button size="lg" render={<Link href="/signup" />}>
                Create your free account
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border text-muted-foreground border-t py-8 text-center text-xs">
        PeakStreak — for people who save playlists with real intent.
      </footer>
    </div>
  )
}
