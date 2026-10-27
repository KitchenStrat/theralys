-- Réseaux sociaux, suite : provenance des visites (analytics_events.source) et
-- journal des notifications envoyées par les jobs (e-mail hebdomadaire des
-- contenus, rappel de préparation du mois).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0003.
CREATE TABLE IF NOT EXISTS "notification_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "period_key" text NOT NULL,
  "recipient" text NOT NULL,
  "sent" boolean DEFAULT false NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_log_site_kind_period_idx" ON "notification_log" USING btree ("site_id","kind","period_key");
