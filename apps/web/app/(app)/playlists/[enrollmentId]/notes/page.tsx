import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, NotebookPen } from "lucide-react"

import { requireUserId } from "@/lib/auth"
import { requireEnrollment } from "@/lib/dashboard"
import { getPlaylistNotes } from "@/lib/notes"

export const metadata: Metadata = { title: "All notes" }

export default async function PlaylistNotesPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>
}) {
  const userId = await requireUserId()
  const { enrollmentId } = await params

  const enrollment = await requireEnrollment(userId, enrollmentId)
  if (!enrollment) notFound()

  const { playlistTitle, notes } = await getPlaylistNotes(userId, enrollmentId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Notes — {playlistTitle}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything you wrote, in playlist order. Only you can see this.
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="border-border text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center text-sm">
          <NotebookPen className="size-8" />
          No notes yet — open a video and start writing in the panel beside the player.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {notes.map((note) => (
            <article key={note.videoId} className="border-border bg-card rounded-xl border p-5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">
                  <Link
                    href={`/playlists/${enrollmentId}/watch/${note.videoId}`}
                    className="hover:text-primary"
                  >
                    {note.position + 1}. {note.videoTitle}
                  </Link>
                </h2>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="text-secondary-foreground text-sm whitespace-pre-wrap">{note.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
