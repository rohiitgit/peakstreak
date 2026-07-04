import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { track } from "@/lib/analytics"
import { currentUserId } from "@/lib/auth"
import { db, schema } from "@/lib/db"
import { requireEnrollment } from "@/lib/dashboard"

/** Loads the caller's note for a video. Notes are strictly private. */
export async function GET(request: Request) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const videoId = new URL(request.url).searchParams.get("videoId")
  if (!videoId || !z.string().uuid().safeParse(videoId).success) {
    return Response.json({ error: "invalid_params" }, { status: 400 })
  }

  const note = await db.query.notes.findFirst({
    where: and(eq(schema.notes.userId, userId), eq(schema.notes.videoId, videoId)),
  })
  return Response.json({
    content: note?.content ?? "",
    updatedAt: note?.updatedAt?.toISOString() ?? null,
  })
}

const putSchema = z.object({
  videoId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  content: z.string().max(100_000),
})

/** Autosave upsert — one note document per (user, video). */
export async function PUT(request: Request) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 })
  const { videoId, enrollmentId, content } = parsed.data

  // Ownership of the enrollment gates note creation; the (user, video)
  // unique key keeps reads scoped to the caller regardless.
  const enrollment = await requireEnrollment(userId, enrollmentId)
  if (!enrollment) return Response.json({ error: "not_found" }, { status: 404 })

  const existing = await db.query.notes.findFirst({
    where: and(eq(schema.notes.userId, userId), eq(schema.notes.videoId, videoId)),
    columns: { id: true },
  })

  const now = new Date()
  const [note] = await db
    .insert(schema.notes)
    .values({ userId, videoId, userPlaylistId: enrollmentId, content })
    .onConflictDoUpdate({
      target: [schema.notes.userId, schema.notes.videoId],
      set: { content, updatedAt: now },
      // Never let one user's write path touch another's row.
      setWhere: sql`${schema.notes.userId} = ${userId}`,
    })
    .returning({ updatedAt: schema.notes.updatedAt })

  if (!existing && content.trim() !== "") {
    track("note_created", { userId, properties: { videoId, enrollmentId } })
  }

  return Response.json({ saved: true, updatedAt: note!.updatedAt.toISOString() })
}
