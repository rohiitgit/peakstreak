"use client"

import Link from "next/link"
import { useState } from "react"
import { motion, useMotionValueEvent, useScroll } from "motion/react"

import { Button } from "@workspace/ui/components/button"

/**
 * Landing header. Transparent over the hero, then settles into a blurred,
 * bordered bar once the user scrolls past the fold.
 */
export function SiteHeader() {
  const { scrollY } = useScroll()
  const [stuck, setStuck] = useState(false)

  useMotionValueEvent(scrollY, "change", (y) => {
    setStuck(y > 24)
  })

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      data-stuck={stuck}
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent transition-colors duration-300 data-[stuck=true]:border-border data-[stuck=true]:bg-background/70 data-[stuck=true]:backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Peak<span className="text-primary">Streak</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/login" />}>
            Log in
          </Button>
          <Button variant="outline" render={<Link href="/signup" />}>
            Sign up
          </Button>
        </div>
      </div>
    </motion.header>
  )
}
