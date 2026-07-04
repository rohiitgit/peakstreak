CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"videos_completed" integer DEFAULT 0 NOT NULL,
	"seconds_watched" integer DEFAULT 0 NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"sent_on_local_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_message_id" text,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_hour_local" smallint DEFAULT 19 NOT NULL,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_preferences_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"user_playlist_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_videos" (
	"playlist_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "playlist_videos_playlist_id_video_id_pk" PRIMARY KEY("playlist_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_playlist_id" text NOT NULL,
	"title" text NOT NULL,
	"channel_title" text,
	"thumbnail_url" text,
	"video_count" integer DEFAULT 0 NOT NULL,
	"total_duration_seconds" integer DEFAULT 0 NOT NULL,
	"unavailable_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlists_youtube_playlist_id_unique" UNIQUE("youtube_playlist_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"playlist_id" uuid NOT NULL,
	"pace_type" text NOT NULL,
	"pace_value" integer NOT NULL,
	"playback_speed" numeric(2, 1) DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_finish_date" date,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "video_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_playlist_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"seconds_watched" integer DEFAULT 0 NOT NULL,
	"furthest_position_seconds" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_manually" boolean DEFAULT false NOT NULL,
	"last_watched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"thumbnail_url" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_youtube_video_id_unique" UNIQUE("youtube_video_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_playlist_id_user_playlists_id_fk" FOREIGN KEY ("user_playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_videos" ADD CONSTRAINT "playlist_videos_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_videos" ADD CONSTRAINT "playlist_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_user_playlist_id_user_playlists_id_fk" FOREIGN KEY ("user_playlist_id") REFERENCES "public"."user_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_activity_user_date_idx" ON "daily_activity" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "daily_activity_user_date_desc_idx" ON "daily_activity" USING btree ("user_id","activity_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_user_type_date_idx" ON "email_log" USING btree ("user_id","type","sent_on_local_date");--> statement-breakpoint
CREATE INDEX "email_log_user_sent_idx" ON "email_log" USING btree ("user_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notes_user_video_idx" ON "notes" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_videos_playlist_position_idx" ON "playlist_videos" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "user_playlists_user_playlist_idx" ON "user_playlists" USING btree ("user_id","playlist_id");--> statement-breakpoint
CREATE INDEX "user_playlists_user_status_idx" ON "user_playlists" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "video_progress_enrollment_video_idx" ON "video_progress" USING btree ("user_playlist_id","video_id");--> statement-breakpoint
CREATE INDEX "video_progress_enrollment_completed_idx" ON "video_progress" USING btree ("user_playlist_id","is_completed");