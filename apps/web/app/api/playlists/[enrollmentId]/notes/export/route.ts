import { z } from "zod"

import { currentUserId } from "@/lib/auth"
import { getPlaylistNotes } from "@/lib/notes"

/**
 * PS-11: one-click notes export — every note for the playlist compiled
 * into a single downloadable markdown document, in video order.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ enrollmentId: string }> }) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { enrollmentId } = await ctx.params
  if (!z.string().uuid().safeParse(enrollmentId).success) {
    return Response.json({ error: "invalid_params" }, { status: 400 })
  }

  let data
  try {
    data = await getPlaylistNotes(userId, enrollmentId)
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 })
  }

  const lines: string[] = [`# ${data.playlistTitle} — Notes`, ""]
  for (const note of data.notes) {
    lines.push(`## ${note.position + 1}. ${note.videoTitle}`, "", note.content.trim(), "")
  }
  if (data.notes.length === 0) {
    lines.push("_No notes were written for this playlist._", "")
  }

  const filename = `${data.playlistTitle.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "notes"}-notes.md`

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
