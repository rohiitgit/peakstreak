"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, Check, CheckCircle2, Circle, ExternalLink, ListVideo } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@workspace/ui/components/button"
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
  thumbnailUrl: string | null
  isEmbeddable: boolean
  position: number
  isCompleted: boolean
  secondsWatched: number
}

const HEARTBEAT_INTERVAL_S = 20

// Start a few seconds before where they left off, for context on resume.
const RESUME_REWIND_S = 3

function clockLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`
}

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

  // ── YouTube-only fallback (owner disabled embedding) ──
  // The youtubeVideoId that failed with onError 101/150 this session —
  // storing the id (not a boolean) makes reset-on-video-change derived.
  const [failedEmbedId, setFailedEmbedId] = useState<string | null>(null)
  const fallbackMode = !current.isEmbeddable || failedEmbedId === current.youtubeVideoId

  const [popupState, setPopupState] = useState<"idle" | "tracking" | "confirm" | "blocked">("idle")
  const [popupElapsed, setPopupElapsed] = useState(0)
  const popupRef = useRef<Window | null>(null)
  const popupStartPosRef = useRef(0)
  // Mirror of watchedSeconds for the popup tick's duration guard.
  const watchedRef = useRef(initialSecondsWatched)

  // Where the player should begin. Resume from the furthest watched point
  // (minus a short rewind), unless the video is already done or they were
  // effectively at the end — then start fresh.
  const startAtSeconds = useMemo(() => {
    if (current.isCompleted) return 0
    if (resumePositionSeconds < 5) return 0
    if (resumePositionSeconds >= current.durationSeconds - 15) return 0
    return Math.max(0, Math.floor(resumePositionSeconds - RESUME_REWIND_S))
  }, [current.isCompleted, current.durationSeconds, resumePositionSeconds])

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
          watchedRef.current = data.secondsWatched
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
  // In fallback mode no player is mounted — the popup tracker effect
  // below feeds the same pendingRef/sendHeartbeat pipeline instead.
  useEffect(() => {
    let cancelled = false
    let tickTimer: ReturnType<typeof setInterval> | undefined
    let sinceFlush = 0

    if (!fallbackMode) {
      void loadIframeApi().then(() => {
        if (cancelled || !containerRef.current || !window.YT) return
        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: current.youtubeVideoId,
          // `start` makes YouTube seek to the resume point as it loads.
          playerVars: { rel: 0, start: startAtSeconds },
          events: {
            onStateChange: (event: { data: number }) => {
              if (event.data === window.YT!.PlayerState.PAUSED || event.data === window.YT!.PlayerState.ENDED) {
                void sendHeartbeat()
              }
            },
            // 101/150 = owner disabled embedding. Switch to the YouTube
            // fallback and persist the flag (self-heals on the next sync).
            // Other codes are transient — never degrade the video for them.
            onError: (event: { data: number }) => {
              if (event.data !== 101 && event.data !== 150) return
              setFailedEmbedId(current.youtubeVideoId)
              void fetch(`/api/videos/${currentVideoId}/embed-error`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ enrollmentId }),
              }).catch(() => {})
            },
          },
        })

        if (startAtSeconds > 0) {
          toast(`Resumed where you left off · ${clockLabel(startAtSeconds)}`, {
            description: "Skip back to the start any time.",
          })
        }

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
    }

    const onHide = () => {
      if (document.visibilityState === "hidden") void sendHeartbeat(true)
    }
    const onPageHide = () => void sendHeartbeat(true)
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onPageHide)

    return () => {
      cancelled = true
      if (tickTimer) clearInterval(tickTimer)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onPageHide)
      void sendHeartbeat(true)
      playerRef.current?.destroy()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.youtubeVideoId, fallbackMode])

  // Reset popup tracking when navigating to another video. The popup (if
  // any) stays open — it's the user's window — we just stop counting it.
  useEffect(() => {
    setPopupState("idle")
    setPopupElapsed(0)
    popupRef.current = null
    watchedRef.current = initialSecondsWatched
  }, [currentVideoId, initialSecondsWatched])

  // Popup tracker: while the YouTube window is open, wall-clock seconds
  // feed the same heartbeat pipeline as the embedded player (we can't see
  // YouTube's playhead or rate cross-origin — popup.closed is all we read).
  useEffect(() => {
    if (popupState !== "tracking") return
    let sinceFlush = 0
    let elapsed = 0
    const timer = setInterval(() => {
      const popup = popupRef.current
      if (!popup || popup.closed) {
        popupRef.current = null
        void sendHeartbeat()
        setPopupState(completedRef.current ? "idle" : "confirm")
        return
      }
      elapsed += 1
      setPopupElapsed(elapsed)
      // Never accrue past the video's length — wall-clock is an estimate,
      // and daily-activity seconds are not clamped server-side.
      if (watchedRef.current + pendingRef.current < current.durationSeconds) {
        pendingRef.current += 1
      }
      furthestRef.current = Math.min(
        current.durationSeconds,
        Math.max(furthestRef.current, popupStartPosRef.current + elapsed),
      )
      sinceFlush += 1
      if (sinceFlush >= HEARTBEAT_INTERVAL_S) {
        sinceFlush = 0
        void sendHeartbeat()
      }
    }, 1000)
    return () => {
      clearInterval(timer)
      void sendHeartbeat(true)
    }
  }, [popupState, current.durationSeconds, sendHeartbeat])

  const youtubeWatchUrl =
    `https://www.youtube.com/watch?v=${current.youtubeVideoId}` +
    (startAtSeconds > 0 ? `&t=${startAtSeconds}s` : "")

  function openOnYouTube() {
    // No "noopener" feature here — it would force a null return and kill
    // close-detection. We only ever read popup.closed.
    const popup = window.open(youtubeWatchUrl, "_blank")
    if (!popup) {
      setPopupState("blocked")
      return
    }
    popupRef.current = popup
    popupStartPosRef.current = startAtSeconds
    setPopupElapsed(0)
    setPopupState("tracking")
  }

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          {fallbackMode && (
            <div className="absolute inset-0 z-[5]">
              {current.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.thumbnailUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-30"
                />
              )}
              <div className="relative flex size-full flex-col items-center justify-center gap-4 px-6 text-center">
                {popupState === "idle" && (
                  <>
                    <p className="text-lg font-semibold text-white">
                      This video&apos;s owner only allows playback on YouTube
                    </p>
                    <p className="text-sm text-white/70">
                      Time you spend watching there still counts here.
                    </p>
                    <Button onClick={openOnYouTube}>
                      <ExternalLink className="size-4" />
                      {startAtSeconds > 0
                        ? `Resume on YouTube · ${clockLabel(startAtSeconds)}`
                        : "Watch on YouTube"}
                    </Button>
                  </>
                )}
                {popupState === "tracking" && (
                  <>
                    <p className="text-lg font-semibold text-white">
                      Watching on YouTube · tracking your time
                    </p>
                    <p className="font-mono text-3xl text-white">{clockLabel(popupElapsed)}</p>
                    <p className="text-sm text-white/70">
                      Close the YouTube window when you&apos;re done.
                    </p>
                  </>
                )}
                {popupState === "confirm" && (
                  <>
                    <p className="text-lg font-semibold text-white">
                      Watched {formatDuration(watchedSeconds)} of{" "}
                      {formatDuration(current.durationSeconds)}
                    </p>
                    <p className="text-sm text-white/70">Done for now, or finished the video?</p>
                    <div className="flex gap-3">
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void toggleComplete()
                          setPopupState("idle")
                        }}
                      >
                        <Check className="size-4" />
                        Mark complete
                      </Button>
                      <Button variant="outline" onClick={() => setPopupState("idle")}>
                        Not yet
                      </Button>
                    </div>
                  </>
                )}
                {popupState === "blocked" && (
                  <>
                    <p className="text-lg font-semibold text-white">
                      Your browser blocked the popup
                    </p>
                    <p className="text-sm text-white/70">
                      Open the video on YouTube, then come back and mark it complete.
                    </p>
                    <a
                      href={youtubeWatchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants()}
                    >
                      <ExternalLink className="size-4" />
                      Open on YouTube
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
          <AnimatePresence>
            {showCelebration && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 text-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 }}
                >
                  <CheckCircle2 className="text-success size-16" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="text-lg font-semibold text-white"
                >
                  {playlistDone ? "Playlist complete! 🎉" : "Video complete"}
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="flex gap-3"
                >
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
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
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

        {/* Watch progress toward the 80% auto-complete threshold. */}
        <div
          className="bg-secondary h-1 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={watchedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Watch progress"
        >
          <motion.div
            className={cn("h-full rounded-full", isCompleted ? "bg-success" : "bg-primary")}
            initial={false}
            animate={{ width: `${watchedPct}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          />
        </div>

        {/* Notes get the full width under the video — a real writing surface,
            wired to the player for insert-timestamp and click-to-seek. */}
        <NotesPanel
          key={currentVideoId}
          videoId={currentVideoId}
          enrollmentId={enrollmentId}
          // No player in fallback mode — omit the hooks and NotesPanel
          // degrades to plain untimed notes.
          getPlayerTime={
            fallbackMode ? undefined : () => playerRef.current?.getCurrentTime() ?? null
          }
          onSeek={fallbackMode ? undefined : (seconds) => playerRef.current?.seekTo(seconds, true)}
        />
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <div className="border-border bg-card flex flex-col rounded-xl border">
          <div className="text-muted-foreground flex items-center gap-2 px-4 py-3 text-sm font-medium">
            <ListVideo className="size-4" />
            Up next
          </div>
          <ol className="max-h-[70vh] overflow-y-auto pb-2">
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
