"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { NotebookPen } from "lucide-react"

import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

type SaveState = "loading" | "saved" | "dirty" | "saving" | "error"

const DEBOUNCE_MS = 1500
const RETRY_MS = 5000

/**
 * PS-9: autosaving per-video notes. Debounced save after typing stops,
 * plus on blur and page-hide; failed saves keep the text, retry, and warn
 * before unload. Render with key={videoId} — the component remounts per
 * video, which is what makes switching videos loss-free and simple.
 */
export function NotesPanel({
  videoId,
  enrollmentId,
  className,
}: {
  videoId: string
  enrollmentId: string
  className?: string
}) {
  const [content, setContent] = useState("")
  const [state, setState] = useState<SaveState>("loading")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  const contentRef = useRef("")
  const savedContentRef = useRef("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveRef = useRef<() => void>(() => {})

  // Post-render ref sync (never mutate refs during render).
  useEffect(() => {
    contentRef.current = content
  }, [content])

  const save = useCallback(async () => {
    const text = contentRef.current
    if (text === savedContentRef.current) {
      setState("saved")
      return
    }
    setState("saving")
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, enrollmentId, content: text }),
      })
      if (!res.ok) throw new Error(`save failed: ${res.status}`)
      const data = (await res.json()) as { updatedAt: string }
      savedContentRef.current = text
      setLastSavedAt(data.updatedAt)
      // The user may have kept typing while the request was in flight.
      setState(contentRef.current === text ? "saved" : "dirty")
    } catch {
      setState("error")
      clearTimeout(retryRef.current)
      retryRef.current = setTimeout(() => saveRef.current(), RETRY_MS)
    }
  }, [videoId, enrollmentId])

  useEffect(() => {
    saveRef.current = () => void save()
  }, [save])

  // Initial load; on unmount (leaving the video) flush any unsaved text
  // with a keepalive fetch so navigation never loses a keystroke.
  useEffect(() => {
    let cancelled = false
    void fetch(`/api/notes?videoId=${videoId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: { content: string; updatedAt: string | null }) => {
        if (cancelled) return
        contentRef.current = data.content
        savedContentRef.current = data.content
        setContent(data.content)
        setLastSavedAt(data.updatedAt)
        setState("saved")
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })

    return () => {
      cancelled = true
      clearTimeout(debounceRef.current)
      clearTimeout(retryRef.current)
      if (contentRef.current !== savedContentRef.current) {
        void fetch("/api/notes", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoId, enrollmentId, content: contentRef.current }),
          keepalive: true,
        }).catch(() => undefined)
      }
    }
  }, [videoId, enrollmentId])

  // Warn before closing the tab with unsaved changes (and try to flush).
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (contentRef.current !== savedContentRef.current) {
        event.preventDefault()
        void fetch("/api/notes", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoId, enrollmentId, content: contentRef.current }),
          keepalive: true,
        }).catch(() => undefined)
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [videoId, enrollmentId])

  function onChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(event.target.value)
    contentRef.current = event.target.value
    setState("dirty")
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void save(), DEBOUNCE_MS)
  }

  const statusLabel = {
    loading: "Loading…",
    saved: lastSavedAt
      ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    error: "Save failed — retrying…",
  }[state]

  return (
    <div className={cn("border-border bg-card flex flex-col rounded-xl border", className)}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
          <NotebookPen className="size-4" />
          Notes
        </span>
        <span
          className={cn(
            "text-xs",
            state === "error" ? "text-destructive" : "text-muted-foreground",
            state === "saved" && "text-success",
          )}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      </div>
      <Textarea
        value={content}
        onChange={onChange}
        onBlur={() => {
          clearTimeout(debounceRef.current)
          void save()
        }}
        disabled={state === "loading"}
        placeholder="Write while you watch — notes save automatically and stay private."
        className="min-h-[200px] flex-1 resize-y rounded-t-none border-x-0 border-b-0 font-sans"
      />
    </div>
  )
}
