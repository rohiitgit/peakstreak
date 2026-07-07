import { z } from "zod"

import { currentUserId } from "@/lib/auth"
import { requireEnrollment } from "@/lib/dashboard"
import { recordEmbedError } from "@/lib/embeddable"

const bodySchema = z.object({ enrollmentId: z.string().uuid() })

/**
 * The player fired onError 101/150 (owner disabled embedding) — persist
 * the flag so later visits render the YouTube fallback without mounting
 * a doomed iframe. Self-heals on the next playlist sync if the owner
 * re-enables embedding.
 */
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

  const result = await recordEmbedError(enrollment.playlistId, videoId)
  if (!result.changed) return Response.json({ error: "not_found" }, { status: 404 })
  return Response.json({ ok: true })
}
