import { db, schema } from "@/lib/db"

export type EventName =
  | "signup"
  | "session_started"
  | "playlist_pasted"
  | "playlist_enrolled"
  | "video_completed"
  | "streak_extended"
  | "streak_frozen"
  | "streak_reset"
  | "note_created"
  | "reminder_sent"
  | "reminder_opened"
  | "playlist_completed"

/**
 * PS-14: best-effort event tracking into the self-hosted events table.
 * The returned promise NEVER rejects — losing an analytics row must not
 * break a completion or a signup. Await it (cheap single insert) or
 * `void` it; both are safe. Payload rule: ids only, no PII beyond user_id.
 */
export function track(
  name: EventName,
  input: { userId?: string | null; properties?: Record<string, unknown> } = {},
): Promise<void> {
  return db
    .insert(schema.events)
    .values({
      name,
      userId: input.userId ?? null,
      properties: input.properties ?? {},
    })
    .then(() => undefined)
    .catch((error) => {
      console.warn(`[analytics] failed to record ${name}:`, error)
    })
}
