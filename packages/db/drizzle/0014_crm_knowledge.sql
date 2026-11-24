-- Base de connaissances de l'équipe commerciale : les questions et les
-- objections entendues au téléphone, leur réponse, et le journal de chaque
-- question posée à l'assistant du CRM.
-- Deux tables nouvelles, rien de modifié dans l'existant : le CRM, l'onglet
-- Équipe et le reste de l'admin fonctionnent avant comme après. Tant que la
-- migration n'est pas appliquée, l'encart « Une question sur Harmony ? » ne
-- s'affiche pas et la page de la base montre un message d'activation.
-- Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "crm_knowledge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question" text NOT NULL,
  "question_key" text NOT NULL,
  "kind" text DEFAULT 'question' NOT NULL,
  "category" text DEFAULT 'autre' NOT NULL,
  "reply" text DEFAULT '' NOT NULL,
  "details" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'ai' NOT NULL,
  "asked_count" integer DEFAULT 1 NOT NULL,
  "author_id" uuid,
  "validated_by" uuid,
  "validated_at" timestamp with time zone,
  "last_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_knowledge_asks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL,
  "user_id" uuid,
  "asked" text NOT NULL,
  "asked_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_knowledge" ADD CONSTRAINT "crm_knowledge_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_knowledge" ADD CONSTRAINT "crm_knowledge_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_knowledge_asks" ADD CONSTRAINT "crm_knowledge_asks_entry_id_crm_knowledge_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."crm_knowledge"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_knowledge_asks" ADD CONSTRAINT "crm_knowledge_asks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_category_idx" ON "crm_knowledge" USING btree ("category","asked_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_key_idx" ON "crm_knowledge" USING btree ("question_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_status_idx" ON "crm_knowledge" USING btree ("status","last_asked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_asks_entry_idx" ON "crm_knowledge_asks" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_asks_user_idx" ON "crm_knowledge_asks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_knowledge_asks_key_idx" ON "crm_knowledge_asks" USING btree ("asked_key");
