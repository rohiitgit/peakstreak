"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

import { LandingPaste } from "@/components/landing-paste"
import { Ambient } from "@/components/landing/ambient"
import { PlanMeter } from "@/components/landing/plan-meter"

/**
 * Above-the-fold hero. Orchestrated GSAP load sequence: eyebrow → headline
 * lines rise out of a mask → subcopy → paste tool. The plan meter below
 * carries its own scroll-triggered reveal.
 */
export function Hero() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".hero-anim", { opacity: 1, y: 0 })
        gsap.set(".hero-line-inner", { yPercent: 0 })
      })

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "power3.out", duration: 0.8 },
          delay: 0.15,
        })
        tl.from(".hero-eyebrow", { opacity: 0, y: 12, duration: 0.6 })
          .from(
            ".hero-line-inner",
            { yPercent: 115, stagger: 0.12, duration: 0.9, ease: "power4.out" },
            "-=0.25"
          )
          .from(".hero-sub", { opacity: 0, y: 14 }, "-=0.55")
          .from(".hero-paste", { opacity: 0, y: 16 }, "-=0.55")
          .from(".hero-fine", { opacity: 0, duration: 0.6 }, "-=0.5")
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={root} className="relative">
      <Ambient />
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-28 pb-16 text-center sm:pt-36 sm:pb-24">
        <span className="hero-eyebrow hero-anim border-border bg-card/50 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide backdrop-blur-sm">
          <span className="bg-primary size-1.5 rounded-full" />
          For playlists you saved with real intent
        </span>

        <h1 className="max-w-4xl text-[2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:whitespace-nowrap">
          <span className="block overflow-hidden pb-1">
            <span className="hero-line-inner block">YouTube keeps you watching.</span>
          </span>
          <span className="block overflow-hidden pb-1">
            <span className="hero-line-inner block">
              PeakStreak makes you <span className="text-primary">finish.</span>
            </span>
          </span>
        </h1>

        <p className="hero-sub hero-anim text-muted-foreground mt-6 max-w-xl text-base text-balance sm:text-lg">
          Paste any public playlist and PeakStreak turns it into a plan with a real finish date, a
          daily streak, and a nudge the moment you slip.
        </p>

        <div className="hero-paste hero-anim mt-8 w-full max-w-xl">
          <LandingPaste />
        </div>

        <p className="hero-fine hero-anim text-muted-foreground mt-4 font-mono text-[11px]">
          Free · any public YouTube playlist · no account access needed
        </p>

        <div className="mt-16 flex w-full justify-center sm:mt-20">
          <PlanMeter />
        </div>
      </div>
    </section>
  )
}
