-- Meta Ads (studio) : analyses (veille de la bibliothèque publicitaire Meta,
-- diagnostic, créas statiques et leurs rendus, plan vidéo, plan de campagne IA).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0005.
CREATE TABLE IF NOT EXISTS "meta_ads_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "seed" jsonb NOT NULL,
  "market" jsonb,
  "diagnostic" jsonb,
  "creatives" jsonb,
  "video_plan" jsonb,
  "plan" jsonb,
  "assets" jsonb DEFAULT '{"version":1,"renders":{}}'::jsonb NOT NULL,
  "instructions" text,
  "provider" text DEFAULT 'none' NOT NULL,
  "generator" text DEFAULT 'mock' NOT NULL,
  "calls" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_ads_analyses" ADD CONSTRAINT "meta_ads_analyses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ads_analyses_site_created_idx" ON "meta_ads_analyses" USING btree ("site_id","created_at");
