"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, CalendarDays, Clock, ListVideo } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { estimateDays, finishDate, formatDuration } from "@/lib/pace"

interface Teaser {
  title: string
  channelTitle: string | null
  videoCount: number
  totalDurationSeconds: number
}

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

/**
 * PS-13: the anonymous above-the-fold hook. Paste → real estimate with
 * no account; signing up carries the URL through so the estimate screen
 * is pre-loaded after auth.
 */
export function LandingPaste() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teaser, setTeaser] = useState<Teaser | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setTeaser(null)
    try {
      const res = await fetch("/api/playlists/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json()) as { playlist?: Teaser; message?: string }
      if (!res.ok || !data.playlist) setError(data.message ?? "Something went wrong — try again.")
      else setTeaser(data.playlist)
    } catch {
      setError("Network error — try again.")
    } finally {
      setLoading(false)
    }
  }

  const days = teaser
    ? estimateDays({
        remainingSeconds: teaser.totalDurationSeconds,
        remainingVideos: teaser.videoCount,
        pace: { type: "minutes_per_day", value: 30 },
      })
    : 0

  const signupHref = `/signup?callbackUrl=${encodeURIComponent(`/playlists/new?url=${encodeURIComponent(url)}`)}`

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube playlist link…"
          aria-label="YouTube playlist URL"
          className="h-11 flex-1 text-base"
        />
        <Button type="submit" size="lg" disabled={loading || url.trim() === ""}>
          {loading ? "Working…" : "See how long"}
        </Button>
      </form>
      {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

      {teaser && (
        <div className="border-border bg-card mt-4 rounded-xl border p-5 text-left">
          <h3 className="truncate text-sm font-semibold">{teaser.title}</h3>
          {teaser.channelTitle && (
            <p className="text-muted-foreground truncate text-xs">{teaser.channelTitle}</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <ListVideo className="size-3.5" /> Videos
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold">{teaser.videoCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="size-3.5" /> Runtime
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold">
                {formatDuration(teaser.totalDurationSeconds)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <CalendarDays className="size-3.5" /> At 30 min/day
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold">
                {prettyDate(finishDate(localToday(), days))}
              </div>
            </div>
          </div>
          <Button className="mt-4 w-full" size="lg" onClick={() => router.push(signupHref)}>
            Start tracking it — free
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
