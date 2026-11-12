-- Site internet du client (« site de référence ») : un praticien qui a déjà
-- son site peut le connecter pour que les outils s'appuient dessus. Une ligne
-- par site : pages lues, faits relevés, profil extrait, corrections du
-- praticien, clé publique du code de mesure. La colonne
-- analytics_events.origin distingue les visites mesurées sur le site du
-- client (« external ») de celles du site hébergé (null).
-- Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "external_sites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "url" text NOT NULL,
  "status" text DEFAULT 'reading' NOT NULL,
  "source" text DEFAULT 'crawl' NOT NULL,
  "error" text,
  "error_detail" text,
  "read_started_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "checked_at" timestamp with time zone,
  "pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "facts" jsonb,
  "profile" jsonb,
  "overrides" jsonb,
  "content_hash" text,
  "measure_key" text NOT NULL,
  "measure_seen_at" timestamp with time zone,
  "consent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "external_sites" ADD CONSTRAINT "external_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_sites_site_id_unique" ON "external_sites" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "external_sites_measure_key_unique" ON "external_sites" USING btree ("measure_key");--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "origin" text;
