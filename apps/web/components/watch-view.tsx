"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, CheckCircle2, Circle, ListVideo } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { NotesPanel } from "@/components/notes-panel"
import { formatDuration } from "@/lib/pace"

/* ── YouTube IFrame Player API (official embed only, per ToS) ── */

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YTPlayer {
  getCurrentTime(): number
  getPlaybackRate(): number
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

let apiPromise: Promise<void> | null = null
function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        resolve()
      }
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(tag)
    })
  }
  return apiPromise
}

/* ── Watch view ── */

export interface WatchVideo {
  id: string
  youtubeVideoId: string
  title: string
  durationSeconds: number
  position: number
  isCompleted: boolean
  secondsWatched: number
}

const HEARTBEAT_INTERVAL_S = 20

export function WatchView({
  enrollmentId,
  playlistTitle,
  videos,
  currentVideoId,
  initialSecondsWatched,
  resumePositionSeconds,
}: {
  enrollmentId: string
  playlistTitle: string
  videos: WatchVideo[]
  currentVideoId: string
  initialSecondsWatched: number
  resumePositionSeconds: number
}) {
  const router = useRouter()
  const current = videos.find((v) => v.id === currentVideoId)!

  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(videos.filter((v) => v.isCompleted).map((v) => v.id)),
  )
  const isCompleted = completedIds.has(currentVideoId)
  const [showCelebration, setShowCelebration] = useState(false)
  const [playlistDone, setPlaylistDone] = useState(false)
  const [busy, setBusy] = useState(false)

  // Displayed watch progress — refreshed by heartbeat responses.
  const [watchedSeconds, setWatchedSeconds] = useState(initialSecondsWatched)

  const playerRef = useRef<YTPlayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Unsent watched seconds (content-time: wall-clock × playback rate).
  const pendingRef = useRef(0)
  const furthestRef = useRef(resumePositionSeconds)
  const completedRef = useRef(isCompleted)
  useEffect(() => {
    completedRef.current = isCompleted
  }, [isCompleted])

  const nextVideo = useMemo(() => {
    const after = videos.filter((v) => v.position > current.position && !completedIds.has(v.id))
    if (after.length > 0) return after[0]!
    return videos.find((v) => !completedIds.has(v.id) && v.id !== currentVideoId) ?? null
  }, [videos, current.position, completedIds, currentVideoId])

  const markCompleted = useCallback(
    (result: { firstCompletionToday?: boolean; playlistCompleted?: boolean }) => {
      setCompletedIds((prev) => new Set(prev).add(currentVideoId))
      setShowCelebration(true)
      if (result.playlistCompleted) setPlaylistDone(true)
      if (result.firstCompletionToday) {
        toast.success("Streak extended! 🔥", {
          description: "First video of the day — your streak is safe.",
        })
      }
    },
    [currentVideoId],
  )

  const sendHeartbeat = useCallback(
    async (useBeacon = false) => {
      const delta = Math.round(pendingRef.current)
      if (delta <= 0 && !useBeacon) return
      pendingRef.current = 0
      const payload = {
        enrollmentId,
        videoId: currentVideoId,
        deltaSeconds: Math.min(delta, 300),
        positionSeconds: Math.round(furthestRef.current),
      }
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/progress/heartbeat",
          new Blob([JSON.stringify(payload)], { type: "application/json" }),
        )
        return
      }
      try {
        const res = await fetch("/api/progress/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = (await res.json()) as {
            secondsWatched: number
            autoCompleted: boolean
            firstCompletionToday: boolean
            playlistCompleted: boolean
          }
          setWatchedSeconds(data.secondsWatched)
          if (data.autoCompleted && !completedRef.current) markCompleted(data)
        }
      } catch {
        // Keep the unsent seconds for the next attempt.
        pendingRef.current += delta
      }
    },
    [enrollmentId, currentVideoId, markCompleted],
  )

  // Player lifecycle + the watch-time ticker. Wall-clock accumulation
  // while PLAYING (scaled by playback rate) is what makes the counter
  // seek-robust: skipping ahead moves the playhead, not the clock.
  useEffect(() => {
    let cancelled = false
    let tickTimer: ReturnType<typeof setInterval> | undefined
    let sinceFlush = 0

    void loadIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: current.youtubeVideoId,
        playerVars: { rel: 0, start: 0 },
        events: {
          onStateChange: (event: { data: number }) => {
            if (event.data === window.YT!.PlayerState.PAUSED || event.data === window.YT!.PlayerState.ENDED) {
              void sendHeartbeat()
            }
          },
        },
      })

      tickTimer = setInterval(() => {
        const player = playerRef.current
        if (!player || typeof player.getPlayerState !== "function") return
        if (player.getPlayerState() !== window.YT!.PlayerState.PLAYING) return

        const rate = player.getPlaybackRate?.() || 1
        pendingRef.current += 1 * rate
        furthestRef.current = Math.max(furthestRef.current, player.getCurrentTime())
        sinceFlush += 1

        if (sinceFlush >= HEARTBEAT_INTERVAL_S) {
          sinceFlush = 0
          void sendHeartbeat()
        }
      }, 1000)
    })

    const onHide = () => {
      if (document.visibilityState === "hidden") void sendHeartbeat(true)
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", () => void sendHeartbeat(true))

    return () => {
      cancelled = true
      if (tickTimer) clearInterval(tickTimer)
      document.removeEventListener("visibilitychange", onHide)
      void sendHeartbeat(true)
      playerRef.current?.destroy()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.youtubeVideoId])

  async function toggleComplete() {
    setBusy(true)
    try {
      if (isCompleted) {
        const res = await fetch(`/api/videos/${currentVideoId}/complete`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enrollmentId }),
        })
        if (res.ok) {
          setCompletedIds((prev) => {
            const next = new Set(prev)
            next.delete(currentVideoId)
            return next
          })
          setShowCelebration(false)
          setPlaylistDone(false)
        }
      } else {
        const res = await fetch(`/api/videos/${currentVideoId}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enrollmentId }),
        })
        if (res.ok) {
          const result = (await res.json()) as {
            changed: boolean
            firstCompletionToday: boolean
            playlistCompleted: boolean
          }
          markCompleted(result)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const completedCount = completedIds.size
  const watchedPct = Math.min(
    100,
    Math.round((watchedSeconds / Math.max(1, current.durationSeconds)) * 100),
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" />
            {playlistTitle}
          </Link>
          <span className="text-muted-foreground text-sm">
            · {completedCount}/{videos.length}
          </span>
        </div>

        <div className="border-border relative aspect-video w-full overflow-hidden rounded-xl border bg-black">
          <div ref={containerRef} className="size-full" />
          {showCelebration && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 text-center">
              <CheckCircle2 className="text-success size-16 animate-in zoom-in duration-300" />
              <p className="text-lg font-semibold text-white">
                {playlistDone ? "Playlist complete! 🎉" : "Video complete"}
              </p>
              <div className="flex gap-3">
                {playlistDone ? (
                  <Button onClick={() => router.push(`/completed/${enrollmentId}`)}>
                    See your stats
                  </Button>
                ) : nextVideo ? (
                  <Button
                    onClick={() =>
                      router.push(`/playlists/${enrollmentId}/watch/${nextVideo.id}`)
                    }
                  >
                    Next video
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setShowCelebration(false)}>
                  Keep watching
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{current.title}</h1>
            <p className="text-muted-foreground text-xs">
              {formatDuration(current.durationSeconds)} · {watchedPct}% watched
              {isCompleted && <span className="text-success ml-1">· completed</span>}
            </p>
          </div>
          <Button
            variant={isCompleted ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={toggleComplete}
          >
            {isCompleted ? "Unmark" : (
              <>
                <Check className="size-4" />
                Mark complete
              </>
            )}
          </Button>
        </div>

        <NotesPanel
          key={`m-${currentVideoId}`}
          videoId={currentVideoId}
          enrollmentId={enrollmentId}
          className="lg:hidden"
        />
      </div>

      <div className="flex flex-col gap-4">
        <NotesPanel
          key={currentVideoId}
          videoId={currentVideoId}
          enrollmentId={enrollmentId}
          className="hidden lg:flex"
        />

        <div className="border-border bg-card flex flex-col rounded-xl border">
          <div className="text-muted-foreground flex items-center gap-2 px-4 py-3 text-sm font-medium">
            <ListVideo className="size-4" />
            Up next
          </div>
          <ol className="max-h-[420px] overflow-y-auto pb-2">
            {videos.map((video) => {
              const done = completedIds.has(video.id)
              const isCurrent = video.id === currentVideoId
              return (
                <li key={video.id}>
                  <Link
                    href={`/playlists/${enrollmentId}/watch/${video.id}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                      isCurrent ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="text-success size-4 shrink-0" />
                    ) : (
                      <Circle className="text-muted-foreground size-4 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        isCurrent ? "text-foreground font-medium" : "text-muted-foreground",
                        done && !isCurrent && "line-through opacity-70",
                      )}
                    >
                      {video.position + 1}. {video.title}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {formatDuration(video.durationSeconds)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
