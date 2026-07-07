ALTER TABLE "playlists" ADD COLUMN "unembeddable_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "is_embeddable" boolean DEFAULT true NOT NULL;