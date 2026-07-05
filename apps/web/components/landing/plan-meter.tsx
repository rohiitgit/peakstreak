"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { Flag } from "lucide-react"

gsap.registerPlugin(ScrollTrigger)

// Illustrative, internally consistent demo numbers:
// 1127 min of runtime at 30 min/day ≈ 38 days → from Jul 5, done Aug 12.
const VIDEOS = 24
const RUNTIME_MIN = 1127
const DAYS = 38
const FINISH_LABEL = "Aug 12"
const TICKS = 26 // day-cells drawn along the meter

function fmtRuntime(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = Math.round(totalMin % 60)
  return `${h}h ${m.toString().padStart(2, "0")}m`
}

/**
 * The signature element. A playlist reads as "endless" — so the meter opens
 * as an open-ended, chevron-fading track, then GSAP resolves it into a
 * finite plan: the fill grows to a hard finish edge, a flag plants at the
 * end, and the three mono readouts count up to the real cost.
 */
export function PlanMeter() {
  const root = useRef<HTMLDivElement>(null)
  const videosRef = useRef<HTMLSpanElement>(null)
  const runtimeRef = useRef<HTMLSpanElement>(null)
  const daysRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const setFinal = () => {
      if (videosRef.current) videosRef.current.textContent = String(VIDEOS)
      if (runtimeRef.current) runtimeRef.current.textContent = fmtRuntime(RUNTIME_MIN)
      if (daysRef.current) daysRef.current.textContent = String(DAYS)
    }

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".pm-card", { opacity: 1, y: 0 })
        gsap.set(".pm-fill", { scaleX: 1 })
        gsap.set(".pm-tick", { opacity: 1 })
        gsap.set(".pm-flag", { opacity: 1, scale: 1 })
        gsap.set(".pm-open", { opacity: 0 })
        setFinal()
      })

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const counters = { videos: 0, runtime: 0, days: 0 }
        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          scrollTrigger: { trigger: ".pm-card", start: "top 88%", once: true },
        })

        tl.from(".pm-card", { opacity: 0, y: 28, duration: 0.7 })
          .from(".pm-head", { opacity: 0, y: 10, duration: 0.5 }, "-=0.4")
          // meter grows to a hard finish edge, open-ended chevrons fade out
          .to(".pm-open", { opacity: 0, duration: 0.5 }, "<0.1")
          .to(
            ".pm-fill",
            { scaleX: 1, duration: 1.1, ease: "power2.inOut" },
            "<"
          )
          .from(
            ".pm-tick",
            { opacity: 0, scaleY: 0.4, stagger: 0.02, duration: 0.4 },
            "<0.15"
          )
          .to(
            counters,
            {
              videos: VIDEOS,
              runtime: RUNTIME_MIN,
              days: DAYS,
              duration: 1.1,
              ease: "power2.out",
              onUpdate: () => {
                if (videosRef.current)
                  videosRef.current.textContent = String(Math.round(counters.videos))
                if (runtimeRef.current)
                  runtimeRef.current.textContent = fmtRuntime(counters.runtime)
                if (daysRef.current)
                  daysRef.current.textContent = String(Math.round(counters.days))
              },
            },
            "<"
          )
          .from(
            ".pm-flag",
            { opacity: 0, scale: 0.4, y: 6, duration: 0.5, ease: "back.out(2.2)" },
            "-=0.35"
          )
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={root} className="w-full max-w-xl">
      <div className="pm-card border-border bg-card/70 relative rounded-2xl border p-5 backdrop-blur-sm sm:p-6">
        <div className="pm-head flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">
              Neural Networks: Zero to Hero
            </p>
            <p className="text-muted-foreground truncate text-xs">Andrej Karpathy · 24 videos</p>
          </div>
          <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase">
            Playlist → Plan
          </span>
        </div>

        {/* meter */}
        <div className="mt-5">
          <div className="relative h-7">
            {/* track */}
            <div className="bg-muted absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full">
              <div
                className="pm-fill h-full origin-left rounded-full"
                style={{
                  transform: "scaleX(0)",
                  background: "linear-gradient(90deg, #5e6ad2, #8b95e8)",
                }}
              />
            </div>
            {/* open-ended chevrons implying "endless", fade away on resolve */}
            <div
              className="pm-open text-muted-foreground/60 absolute top-1/2 right-0 flex -translate-y-1/2 font-mono text-xs"
              aria-hidden
            >
              ›››
            </div>
            {/* day ticks */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-0.5">
              {Array.from({ length: TICKS }).map((_, i) => (
                <span
                  key={i}
                  className="pm-tick bg-background/70 block h-3 w-px origin-center"
                />
              ))}
            </div>
            {/* finish flag */}
            <div className="pm-flag absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-1">
              <span className="border-border bg-popover text-foreground flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap shadow-sm">
                <Flag className="text-primary size-2.5" />
                {FINISH_LABEL}
              </span>
            </div>
          </div>
        </div>

        {/* readouts */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="videos">
            <span ref={videosRef}>0</span>
          </Stat>
          <Stat label="runtime">
            <span ref={runtimeRef}>0h 00m</span>
          </Stat>
          <Stat label="at 30 min / day">
            <span ref={daysRef}>0</span>
            <span className="text-muted-foreground"> days</span>
          </Stat>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-foreground font-mono text-lg font-semibold tabular-nums">{children}</div>
      <div className="text-muted-foreground mt-0.5 text-[11px]">{label}</div>
    </div>
  )
}
