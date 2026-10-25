-- Réseaux sociaux (studio) : table social_settings (« Paramétrage » : voix, consignes, jours de publication).
-- Migration idempotente : rejouable sur une base déjà poussée (drizzle-kit push)
-- comme sur une base migrée depuis 0001.
CREATE TABLE IF NOT EXISTS "social_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "voice_designation" "voice_designation" DEFAULT 'je' NOT NULL,
  "voice_accord" "gender" DEFAULT 'feminin' NOT NULL,
  "voice_reader" "voice_reader" DEFAULT 'vous' NOT NULL,
  "voice_tone" "voice_tone" DEFAULT 'chaleureux' NOT NULL,
  "instructions" text,
  "post_days" jsonb DEFAULT '[2,5]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_settings_site_id_idx" ON "social_settings" USING btree ("site_id");
