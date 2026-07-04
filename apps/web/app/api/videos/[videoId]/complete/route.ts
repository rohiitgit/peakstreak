import { z } from "zod"

import { currentUserId } from "@/lib/auth"
import { requireEnrollment } from "@/lib/dashboard"
import { recordCompletion, uncompleteVideo } from "@/lib/progress"

const bodySchema = z.object({ enrollmentId: z.string().uuid() })

/** Manual "Mark complete" (PS-6) — a first-class completion path. */
export async function POST(request: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { videoId } = await ctx.params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(videoId).success) {
    return Response.json({ error: "invalid_body" }, { status: 400 })
  }

  const enrollment = await requireEnrollment(userId, parsed.data.enrollmentId)
  if (!enrollment) return Response.json({ error: "not_found" }, { status: 404 })

  const result = await recordCompletion({
    userId,
    userPlaylistId: parsed.data.enrollmentId,
    videoId,
    manual: true,
  })
  return Response.json(result)
}

/** Unmark — mis-click recovery. */
export async function DELETE(request: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const userId = await currentUserId()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { videoId } = await ctx.params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(videoId).success) {
    return Response.json({ error: "invalid_body" }, { status: 400 })
  }

  const enrollment = await requireEnrollment(userId, parsed.data.enrollmentId)
  if (!enrollment) return Response.json({ error: "not_found" }, { status: 404 })

  const result = await uncompleteVideo({
    userId,
    userPlaylistId: parsed.data.enrollmentId,
    videoId,
  })
  return Response.json(result)
}
