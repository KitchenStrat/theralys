-- Sécurité et montée en charge.
-- 1. « rate_limits » : compteurs de tentatives (connexion, création de mot de
--    passe, demande de démo, téléversements, générations), partagés entre
--    toutes les instances. La clé est une empreinte : ni e-mail ni adresse IP
--    en clair. Tant que la table n'existe pas, le code compte en mémoire.
-- 2. « impersonations » : journal des entrées de l'équipe dans l'espace d'un
--    client, un lien ne servant qu'une fois. Tant que la table n'existe pas,
--    l'entrée fonctionne comme avant, sans journal.
-- 3. Index des requêtes qui parcourent toute une table quand le parc grandit
--    (statistiques d'une période, publication planifiée, file de rédaction,
--    relevés et avis d'un site, rapprochement des leads et du CRM, e-mails
--    hebdomadaires).
-- Rien n'est modifié dans les tables existantes : le code fonctionne avant
-- comme après. Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "impersonations" (
  "jti" text PRIMARY KEY NOT NULL,
  "admin_id" uuid,
  "site_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "impersonations" ADD CONSTRAINT "impersonations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_reset_idx" ON "rate_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "impersonations_site_time_idx" ON "impersonations" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_site_time_idx" ON "analytics_events" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blog_articles_status_publish_idx" ON "blog_articles" USING btree ("status","publish_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_rank_scans_site_time_idx" ON "google_rank_scans" USING btree ("site_id","scanned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_status_date_idx" ON "social_posts" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_posts_status_date_idx" ON "google_posts" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sites_prospect_idx" ON "sites" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_prospect_idx" ON "leads" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_prospect_idx" ON "crm_contacts" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_site_idx" ON "crm_contacts" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editorial_entries_status_date_idx" ON "editorial_calendar_entries" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_reviews_site_synced_idx" ON "google_reviews" USING btree ("site_id","synced_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "google_usage_kind_site_time_idx" ON "google_usage" USING btree ("kind","site_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_kind_period_idx" ON "notification_log" USING btree ("kind","period_key");
