-- Réseaux sociaux (studio) : table social_posts + enums.
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0000.
-- Dérive existante (colonnes présentes dans schema.ts, absentes de 0000, déjà poussées à la main)
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "google_photo_url" text;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "author_photo_url" text;--> statement-breakpoint
ALTER TABLE "blog_settings" ADD COLUMN IF NOT EXISTS "themes" jsonb;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."social_post_format" AS ENUM('static', 'carousel', 'story'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."social_post_source" AS ENUM('calendar', 'request'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."social_post_status" AS ENUM('ready', 'published', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "scheduled_for" date NOT NULL,
  "format" "social_post_format" NOT NULL,
  "source" "social_post_source" DEFAULT 'calendar' NOT NULL,
  "status" "social_post_status" DEFAULT 'ready' NOT NULL,
  "topic" text NOT NULL,
  "request" text,
  "template" text NOT NULL,
  "accent_color" text,
  "content" jsonb NOT NULL,
  "assets" jsonb DEFAULT '{"version":1,"renders":{}}'::jsonb NOT NULL,
  "downloaded_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_site_date_idx" ON "social_posts" USING btree ("site_id","scheduled_for");
