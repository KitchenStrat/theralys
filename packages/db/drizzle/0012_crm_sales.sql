-- Commerciaux du back-office : un rôle « sales » de plus, leurs comptes dans
-- une table à part, et de quoi savoir à qui appartient chaque prospect du
-- CRM et qui a inscrit chaque ligne d'historique.
-- Rien n'est ajouté à la table « users » : la connexion de l'admin et celle
-- des clients lisent toutes ses colonnes, elles continuent de fonctionner
-- avant comme après cette migration. Les deux colonnes ajoutées au CRM sont
-- facultatives : les fiches et l'historique existants restent tels quels
-- (prospects non attribués, lignes sans auteur).
-- Tant que la migration n'est pas appliquée, le CRM et l'onglet Équipe
-- affichent un message d'activation ; le reste de l'admin n'est pas touché.
-- Migration idempotente : rejouable sans risque.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'sales';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_reps" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "disabled_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "author_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_reps" ADD CONSTRAINT "crm_reps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_owner_idx" ON "crm_contacts" USING btree ("owner_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_author_idx" ON "crm_activities" USING btree ("author_id","created_at");
