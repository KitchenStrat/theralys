-- « Votre avis » : les avis des praticiens sur le produit, donnés depuis leur
-- espace client quelle que soit leur formule, lus par l'équipe dans l'admin.
-- Une table nouvelle, rien de modifié dans l'existant : l'espace client et
-- l'admin fonctionnent avant comme après. Tant que la migration n'est pas
-- appliquée, l'espace client ne propose pas de donner son avis et la page
-- « Avis clients » de l'admin montre un message d'activation.
-- Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "product_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "user_id" uuid,
  "kind" text DEFAULT 'idea' NOT NULL,
  "topic" text DEFAULT 'general' NOT NULL,
  "rating" integer,
  "message" text NOT NULL,
  "contact_ok" boolean DEFAULT false NOT NULL,
  "page" text,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_feedback_status_idx" ON "product_feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_feedback_site_idx" ON "product_feedback" USING btree ("site_id","created_at");
