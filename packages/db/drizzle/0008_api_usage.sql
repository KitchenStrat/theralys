-- Registre des appels API (pilotage de l'activité et des coûts) : une ligne
-- par appel à une API externe, écrite par les clients des fournisseurs et lue
-- par l'admin.
-- Migration idempotente : rejouable sans risque. La reprise de l'historique
-- (coûts réels DataForSEO et ScrapeCreators déjà inscrits dans google_usage)
-- ne s'exécute qu'une fois.
CREATE TABLE IF NOT EXISTS "api_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provider" text NOT NULL,
  "operation" text NOT NULL,
  "feature" text,
  "site_id" uuid,
  "model" text,
  "status" text DEFAULT 'ok' NOT NULL,
  "requests" integer DEFAULT 1 NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "cache_read_tokens" integer DEFAULT 0 NOT NULL,
  "cache_write_tokens" integer DEFAULT 0 NOT NULL,
  "units" double precision DEFAULT 0 NOT NULL,
  "cost_usd" double precision DEFAULT 0 NOT NULL,
  "cost_source" text DEFAULT 'tariff' NOT NULL,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "error" text,
  "meta" jsonb
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_created_idx" ON "api_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_provider_created_idx" ON "api_usage" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_usage_site_created_idx" ON "api_usage" USING btree ("site_id","created_at");--> statement-breakpoint
INSERT INTO "api_usage" ("created_at", "provider", "operation", "feature", "site_id", "status", "requests", "units", "cost_usd", "cost_source", "meta")
SELECT
  gu."created_at",
  CASE WHEN gu."kind" = 'meta_media' THEN 'scrapecreators' ELSE 'dataforseo' END,
  gu."kind",
  CASE WHEN gu."kind" = 'meta_media' THEN 'meta_ads' WHEN gu."kind" = 'ads_keywords' THEN 'google_ads' ELSE 'google_profile' END,
  gu."site_id",
  'ok',
  gu."requests",
  gu."requests",
  gu."cost_usd",
  CASE WHEN gu."kind" = 'meta_media' THEN 'tariff' ELSE 'provider' END,
  jsonb_build_object('backfill', gu."id")
FROM "google_usage" gu
WHERE gu."kind" IN ('business_info', 'reviews', 'scan', 'ads_keywords', 'meta_media')
  AND NOT EXISTS (SELECT 1 FROM "api_usage" WHERE "meta" ? 'backfill');
