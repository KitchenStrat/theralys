-- Google Ads (studio) : analyses (mots-clés DataForSEO, prévision, diagnostic,
-- plan d'action IA) et clics sur le numéro de téléphone dans les statistiques
-- (analytics_event_type.call_click, conversions Google Ads).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0004.
CREATE TABLE IF NOT EXISTS "google_ads_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "seed" jsonb NOT NULL,
  "keywords" jsonb,
  "forecast" jsonb,
  "diagnostic" jsonb,
  "plan" jsonb,
  "instructions" text,
  "provider" text DEFAULT 'mock' NOT NULL,
  "generator" text DEFAULT 'mock' NOT NULL,
  "cost_usd" real DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_ads_analyses" ADD CONSTRAINT "google_ads_analyses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_ads_analyses_site_created_idx" ON "google_ads_analyses" USING btree ("site_id","created_at");--> statement-breakpoint
ALTER TYPE "public"."analytics_event_type" ADD VALUE IF NOT EXISTS 'call_click';
