-- Fiche Google (studio) : audits de fiche, mots-clés et relevés de visibilité,
-- posts Google, registre des dépenses DataForSEO, tâches d'avis, colonnes
-- supplémentaires sur google_reviews (réponse du propriétaire, lien, analyse).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0002.
DO $$ BEGIN CREATE TYPE "public"."google_review_task_status" AS ENUM('pending', 'done', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."google_scan_status" AS ENUM('running', 'done', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."google_scan_trigger" AS ENUM('manual', 'scheduled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_keywords" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "keyword" text NOT NULL,
  "radius" text DEFAULT 'ville' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_scanned_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "scheduled_for" date NOT NULL,
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
CREATE TABLE IF NOT EXISTS "google_profile_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "snapshot" jsonb NOT NULL,
  "audit" jsonb NOT NULL,
  "score" integer NOT NULL,
  "cost_usd" real DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_rank_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "keyword_id" uuid NOT NULL,
  "trigger" "google_scan_trigger" DEFAULT 'manual' NOT NULL,
  "status" "google_scan_status" DEFAULT 'running' NOT NULL,
  "grid" jsonb NOT NULL,
  "points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" jsonb,
  "competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cost_usd" real DEFAULT 0 NOT NULL,
  "error" text,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_review_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "task_id" text NOT NULL,
  "status" "google_review_task_status" DEFAULT 'pending' NOT NULL,
  "depth" integer NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "month" text NOT NULL,
  "kind" text NOT NULL,
  "cost_usd" real NOT NULL,
  "requests" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "owner_reply" text;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "owner_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "review_url" text;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD COLUMN IF NOT EXISTS "analysis" jsonb;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_keywords" ADD CONSTRAINT "google_keywords_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_posts" ADD CONSTRAINT "google_posts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_profile_audits" ADD CONSTRAINT "google_profile_audits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_rank_scans" ADD CONSTRAINT "google_rank_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_rank_scans" ADD CONSTRAINT "google_rank_scans_keyword_id_google_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."google_keywords"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_review_tasks" ADD CONSTRAINT "google_review_tasks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_usage" ADD CONSTRAINT "google_usage_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "google_keywords_site_keyword_idx" ON "google_keywords" USING btree ("site_id","keyword");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_posts_site_date_idx" ON "google_posts" USING btree ("site_id","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_profile_audits_site_time_idx" ON "google_profile_audits" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_rank_scans_keyword_time_idx" ON "google_rank_scans" USING btree ("keyword_id","scanned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_review_tasks_site_idx" ON "google_review_tasks" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_usage_site_month_idx" ON "google_usage" USING btree ("site_id","month");
