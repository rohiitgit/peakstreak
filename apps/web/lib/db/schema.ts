import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

// ── Users & auth ────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  // Null for OAuth-only accounts; set when the user has an email/password login.
  passwordHash: text("password_hash"),
  // IANA zone. Defines the user's day boundary for streaks and reminders.
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // Community leaderboard: opt-out (visible by default), shown by a chosen
  // display name only — never the email. Null displayName falls back to the
  // first name, then an anonymous "Learner #…" label.
  showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(true),
  displayName: text("display_name"),
  ...timestamps,
})

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
)

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
})

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
)

// Single-use, expiring password-reset tokens. We store only the SHA-256 of
// the token; the raw value exists solely in the emailed link, so a leaked
// database row can't be used to reset an account.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
)

// ── Shared YouTube metadata cache (not user-owned) ──────────────

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  youtubePlaylistId: text("youtube_playlist_id").notNull().unique(),
  title: text("title").notNull(),
  channelTitle: text("channel_title"),
  thumbnailUrl: text("thumbnail_url"),
  // Available videos only — private/deleted ones are excluded.
  videoCount: integer("video_count").notNull().default(0),
  totalDurationSeconds: integer("total_duration_seconds").notNull().default(0),
  unavailableCount: integer("unavailable_count").notNull().default(0),
  // Videos whose owner disabled embedding — playable only on YouTube.
  unembeddableCount: integer("unembeddable_count").notNull().default(0),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  syncStatus: text("sync_status", { enum: ["ok", "partial", "failed"] })
    .notNull()
    .default("ok"),
  ...timestamps,
})

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  youtubeVideoId: text("youtube_video_id").notNull().unique(),
  title: text("title").notNull(),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  thumbnailUrl: text("thumbnail_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  // False when the owner disabled embedding (YouTube status.embeddable).
  isEmbeddable: boolean("is_embeddable").notNull().default(true),
  ...timestamps,
})

export const playlistVideos = pgTable(
  "playlist_videos",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.videoId] }),
    uniqueIndex("playlist_videos_playlist_position_idx").on(t.playlistId, t.position),
  ],
)

// ── User enrollment & progress ──────────────────────────────────

export const userPlaylists = pgTable(
  "user_playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "restrict" }),
    paceType: text("pace_type", { enum: ["minutes_per_day", "videos_per_day"] }).notNull(),
    paceValue: integer("pace_value").notNull(),
    playbackSpeed: numeric("playback_speed", { precision: 2, scale: 1 }).notNull().default("1.0"),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    // The estimate shown at enrollment time; the live ETA is always recomputed.
    targetFinishDate: date("target_finish_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_playlists_user_playlist_idx").on(t.userId, t.playlistId),
    index("user_playlists_user_status_idx").on(t.userId, t.status),
  ],
)

export const videoProgress = pgTable(
  "video_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userPlaylistId: uuid("user_playlist_id")
      .notNull()
      .references(() => userPlaylists.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    // Accumulated genuine watch time (seek-robust), capped at duration.
    secondsWatched: integer("seconds_watched").notNull().default(0),
    furthestPositionSeconds: integer("furthest_position_seconds").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedManually: boolean("completed_manually").notNull().default(false),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("video_progress_enrollment_video_idx").on(t.userPlaylistId, t.videoId),
    index("video_progress_enrollment_completed_idx").on(t.userPlaylistId, t.isCompleted),
  ],
)

// ── Daily activity (streaks + heatmap source of truth) ──────────
// activity_date is the user's LOCAL calendar date, computed at write
// time from users.timezone. Never re-derived from UTC timestamps.

export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull(),
    videosCompleted: integer("videos_completed").notNull().default(0),
    secondsWatched: integer("seconds_watched").notNull().default(0),
    // A streak-freeze day: no activity, but the streak survived through it.
    isFrozen: boolean("is_frozen").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("daily_activity_user_date_idx").on(t.userId, t.activityDate),
    index("daily_activity_user_date_desc_idx").on(t.userId, t.activityDate.desc()),
  ],
)

// ── Notes ───────────────────────────────────────────────────────

// Legacy single-document-per-video notes (PS-9 v1). Superseded by
// note_entries below; kept only so the migration can backfill old content.
// Nothing writes to this table anymore.
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userPlaylistId: uuid("user_playlist_id")
      .notNull()
      .references(() => userPlaylists.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("notes_user_video_idx").on(t.userId, t.videoId)],
)

// Timestamped note entries: many per (user, video). Each note optionally
// pins the video moment it was written at, so notes render as a seekable
// log beneath the player. timestampSeconds is null for untimed notes.
export const noteEntries = pgTable(
  "note_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userPlaylistId: uuid("user_playlist_id")
      .notNull()
      .references(() => userPlaylists.id, { onDelete: "cascade" }),
    timestampSeconds: integer("timestamp_seconds"),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("note_entries_user_video_idx").on(t.userId, t.videoId)],
)

// ── Email preferences & log ─────────────────────────────────────

export const emailPreferences = pgTable("email_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  // Local hour (0-23) at which the daily reminder may fire.
  reminderHourLocal: smallint("reminder_hour_local").notNull().default(19),
  // One-click unsubscribe without login (List-Unsubscribe compliance).
  unsubscribeToken: uuid("unsubscribe_token").notNull().unique().defaultRandom(),
  ...timestamps,
})

// ── Product analytics (PS-14) ───────────────────────────────────
// Self-hosted event log. Payloads carry ids only — no PII beyond user_id.

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    properties: jsonb("properties").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_name_created_idx").on(t.name, t.createdAt.desc()),
    index("events_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
)

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["daily_reminder", "completion"] }).notNull(),
    // User-local date the send counts against. The unique index below is
    // the frequency cap: at most one email of a type per user per day,
    // enforced by the database no matter how often the cron re-runs.
    sentOnLocalDate: date("sent_on_local_date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_log_user_type_date_idx").on(t.userId, t.type, t.sentOnLocalDate),
    index("email_log_user_sent_idx").on(t.userId, t.sentAt.desc()),
  ],
)

// ── Feedback (in-app "Send feedback" form) ──────────────────────
// Durable record of every submission; also emailed to FEEDBACK_TO when set.
// user_id/email are nullable so signed-out visitors can still send feedback.

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    message: text("message").notNull(),
    // The path the user was on when they submitted, for context.
    path: text("path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feedback_created_idx").on(t.createdAt.desc())],
)
