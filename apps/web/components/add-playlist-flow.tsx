"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { CalendarDays, Clock, ListVideo, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

import { enrollInPlaylist } from "@/app/(app)/playlists/actions"
import {
  estimateDays,
  finishDate,
  formatDuration,
  PLAYBACK_SPEEDS,
  validatePace,
  type Pace,
  type PaceType,
} from "@/lib/pace"

interface PreviewPlaylist {
  youtubePlaylistId: string
  title: string
  channelTitle: string | null
  thumbnailUrl: string | null
  videoCount: number
  totalDurationSeconds: number
  unavailableCount: number
  unembeddableCount: number
}

const PACE_PRESETS: Array<{ label: string; pace: Pace }> = [
  { label: "30 min / day", pace: { type: "minutes_per_day", value: 30 } },
  { label: "1 hour / day", pace: { type: "minutes_per_day", value: 60 } },
  { label: "1 video / day", pace: { type: "videos_per_day", value: 1 } },
  { label: "2 videos / day", pace: { type: "videos_per_day", value: 2 } },
]

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
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function AddPlaylistFlow({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "")
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewPlaylist | null>(null)

  const [presetIndex, setPresetIndex] = useState<number | "custom">(0)
  const [customValue, setCustomValue] = useState("30")
  const [customType, setCustomType] = useState<PaceType>("minutes_per_day")
  const [speed, setSpeed] = useState<number>(1)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrolling, startEnroll] = useTransition()

  const pace: Pace =
    presetIndex === "custom"
      ? { type: customType, value: Number(customValue) }
      : PACE_PRESETS[presetIndex]!.pace

  const paceError = presetIndex === "custom" ? validatePace(pace) : null

  // Cheap enough to recompute every render — this is the "live update as
  // the user changes pace or speed" requirement, no memo needed.
  const estimate = (() => {
    if (!preview || paceError) return null
    const days = estimateDays({
      remainingSeconds: preview.totalDurationSeconds,
      remainingVideos: preview.videoCount,
      pace,
      playbackSpeed: speed,
    })
    return { days, finish: finishDate(localToday(), days) }
  })()

  async function runPreview(targetUrl: string) {
    setLoading(true)
    setFetchError(null)
    setPreview(null)
    try {
      const res = await fetch("/api/playlists/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      })
      const data = (await res.json()) as { playlist?: PreviewPlaylist; message?: string }
      if (!res.ok || !data.playlist) {
        setFetchError(data.message ?? "Something went wrong. Try again.")
      } else {
        setPreview(data.playlist)
      }
    } catch {
      setFetchError("Network error — check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  async function fetchPreview(event: React.FormEvent) {
    event.preventDefault()
    await runPreview(url)
  }

  // A URL carried through the signup redirect (landing-page funnel, PS-13)
  // fetches its estimate immediately — the user already pasted it once.
  const autoFetched = useRef(false)
  useEffect(() => {
    if (initialUrl && !autoFetched.current) {
      autoFetched.current = true
      void runPreview(initialUrl)
    }
  }, [initialUrl])

  function confirm() {
    if (!preview || paceError) return
    setEnrollError(null)
    startEnroll(async () => {
      const result = await enrollInPlaylist({
        url,
        paceType: pace.type,
        paceValue: pace.value,
        playbackSpeed: speed,
      })
      // On success the action redirects; reaching here means it returned an error.
      if (result?.error) setEnrollError(result.error)
    })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <form onSubmit={fetchPreview} className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube playlist link…"
          aria-label="YouTube playlist URL"
          autoFocus
        />
        <Button type="submit" disabled={loading || url.trim() === ""}>
          {loading ? "Fetching…" : "Get estimate"}
        </Button>
      </form>

      {fetchError && (
        <Alert variant="destructive">
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="border-border bg-card animate-pulse rounded-xl border p-6">
          <div className="bg-muted mb-3 h-5 w-2/3 rounded" />
          <div className="bg-muted h-4 w-1/3 rounded" />
        </div>
      )}

      {preview && (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="flex gap-4 p-5">
            {preview.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.thumbnailUrl}
                alt=""
                className="h-20 w-32 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{preview.title}</h2>
              {preview.channelTitle && (
                <p className="text-muted-foreground truncate text-sm">{preview.channelTitle}</p>
              )}
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <ListVideo className="size-4" />
                  {preview.videoCount} videos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" />
                  {formatDuration(preview.totalDurationSeconds)}
                </span>
              </div>
              {preview.unavailableCount > 0 && (
                <p className="text-warning mt-1.5 inline-flex items-center gap-1.5 text-xs">
                  <TriangleAlert className="size-3.5" />
                  {preview.unavailableCount} video{preview.unavailableCount > 1 ? "s" : ""}{" "}
                  unavailable — excluded from the plan
                </p>
              )}
              {preview.unembeddableCount > 0 && (
                <p className="text-muted-foreground mt-1.5 flex items-start gap-1.5 text-xs">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {preview.unembeddableCount} of {preview.videoCount} videos open on YouTube —
                    owner disabled playback on other sites. Your progress, streaks and completions
                    still work here.
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="border-border border-t p-5">
            <Label className="mb-2.5 block">Your pace</Label>
            <div className="flex flex-wrap gap-2">
              {PACE_PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPresetIndex(i)}
                  className={cn(
                    "border-border rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    presetIndex === i
                      ? "border-primary bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPresetIndex("custom")}
                className={cn(
                  "border-border rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  presetIndex === "custom"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                Custom
              </button>
            </div>

            {presetIndex === "custom" && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-24"
                  aria-label="Custom pace value"
                />
                <Select
                  value={customType}
                  onValueChange={(v) => setCustomType(v as PaceType)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes_per_day">minutes / day</SelectItem>
                    <SelectItem value="videos_per_day">videos / day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {paceError && <p className="text-destructive mt-2 text-sm">{paceError}</p>}

            <Label className="mt-5 mb-2.5 block">Playback speed</Label>
            <div className="flex gap-2">
              {PLAYBACK_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "border-border rounded-lg border px-3 py-1.5 font-mono text-sm transition-colors",
                    speed === s
                      ? "border-primary bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
            {pace.type === "videos_per_day" && speed !== 1 && (
              <p className="text-muted-foreground mt-2 text-xs">
                Speed doesn&apos;t change a videos-per-day plan — it just shortens each session.
              </p>
            )}
          </div>

          <div className="border-border bg-secondary/50 flex flex-col gap-4 border-t p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {estimate ? (
                <>
                  <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                    <CalendarDays className="size-4" />
                    Estimated finish
                  </p>
                  <p className="text-lg font-semibold">
                    {prettyDate(estimate.finish)}
                    <span className="text-muted-foreground ml-2 text-sm font-normal">
                      {estimate.days} day{estimate.days === 1 ? "" : "s"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Fix the pace to see your finish date.</p>
              )}
            </div>
            <Button onClick={confirm} disabled={!estimate || enrolling} size="lg">
              {enrolling ? "Starting…" : "Start this playlist"}
            </Button>
          </div>
          {enrollError && (
            <div className="px-5 pb-4">
              <Alert variant="destructive">
                <AlertDescription>{enrollError}</AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
