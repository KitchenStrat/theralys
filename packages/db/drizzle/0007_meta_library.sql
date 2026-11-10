-- Meta Ads (studio) : visuels des annonces de la veille (cache par identifiant
-- d'annonce, commun aux sites) et bibliothèque personnelle de chaque site
-- (annonces gardées comme exemples, annonces supprimées de la veille).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0006.
CREATE TABLE IF NOT EXISTS "meta_ad_media" (
  "ad_id" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "media" jsonb,
  "provider" text DEFAULT 'scrapecreators' NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_ads_library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "ad_id" text NOT NULL,
  "status" text DEFAULT 'kept' NOT NULL,
  "page_name" text DEFAULT '' NOT NULL,
  "ad" jsonb,
  "media" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_ads_library" ADD CONSTRAINT "meta_ads_library_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_ads_library_site_ad_idx" ON "meta_ads_library" USING btree ("site_id","ad_id");
