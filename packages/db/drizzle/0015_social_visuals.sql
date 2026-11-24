-- Réseaux sociaux : d'où viennent les photos préparées pour les visuels
-- (IA, banque d'images, ou les deux), réglage du « Paramétrage ».
-- Une table nouvelle, rien de modifié dans l'existant : `social_settings`
-- reste telle quelle. Tant que la migration n'est pas appliquée, le réglage
-- n'est pas proposé et les visuels gardent les photos du site, comme avant.
-- Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "social_visual_settings" (
  "site_id" uuid PRIMARY KEY NOT NULL,
  "photo_source" text DEFAULT 'stock' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "social_visual_settings" ADD CONSTRAINT "social_visual_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
