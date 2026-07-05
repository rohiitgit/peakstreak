"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

const GLOW = 672 // px — the follow glow's box size (matches h/w below)

/**
 * Ambient hero backdrop: a lavender glow that trails the cursor across the
 * hero (chasing it, so the pointer always stays a step ahead), over a faint
 * grid with a second slow-drifting glow for depth. Holds still and simply
 * drifts under prefers-reduced-motion.
 */
export function Ambient() {
  const root = useRef<HTMLDivElement>(null)
  const follow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = follow.current
    const container = root.current
    if (!el || !container) return
    // the hero section is the ambient layer's parent — track the pointer over it
    const surface = container.parentElement ?? container

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()

      // resting position: horizontally centred, sitting just above the fold
      const rest = () => {
        const r = surface.getBoundingClientRect()
        gsap.set(el, { x: r.width / 2 - GLOW / 2, y: -GLOW / 3 })
      }
      rest()

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // second glow keeps a gentle life of its own
        gsap.to(".ambient-glow-b", {
          xPercent: -14,
          yPercent: -8,
          duration: 18,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })

        // smooth trailing follow — the glow eases toward the pointer
        const xTo = gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" })
        const yTo = gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" })

        const onMove = (e: PointerEvent) => {
          const r = surface.getBoundingClientRect()
          xTo(e.clientX - r.left - GLOW / 2)
          yTo(e.clientY - r.top - GLOW / 2)
        }
        const onLeave = () => {
          const r = surface.getBoundingClientRect()
          xTo(r.width / 2 - GLOW / 2)
          yTo(-GLOW / 3)
        }

        surface.addEventListener("pointermove", onMove)
        surface.addEventListener("pointerleave", onLeave)
        return () => {
          surface.removeEventListener("pointermove", onMove)
          surface.removeEventListener("pointerleave", onLeave)
        }
      })

      // reduced motion: everything stays put
      mm.add("(prefers-reduced-motion: reduce)", () => rest())
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* faint grid, faded toward the edges */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #23252a 1px, transparent 1px), linear-gradient(to bottom, #23252a 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 75%)",
        }}
      />
      {/* cursor-following lavender glow */}
      <div
        ref={follow}
        className="absolute top-0 left-0 h-[42rem] w-[42rem] rounded-full blur-[120px] will-change-transform"
        style={{ background: "radial-gradient(circle, rgba(94,106,210,0.30), transparent 62%)" }}
      />
      {/* second, slow-drifting glow for depth */}
      <div
        className="ambient-glow-b absolute top-24 right-[8%] h-[30rem] w-[30rem] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(94,106,210,0.14), transparent 65%)" }}
      />
    </div>
  )
}
