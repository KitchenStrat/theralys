-- CRM du back-office : prospects (importés par listes, saisis à la main ou
-- repris des demandes de la vitrine et des démos), historique de chaque
-- prospect (notes, appels, rendez-vous, tâches avec échéance) et listes
-- importées. Trois tables neuves : rien n'est modifié dans les tables
-- existantes (les demandes de démo continuent d'arriver dans « leads »).
-- Migration idempotente : rejouable sans risque.
CREATE TABLE IF NOT EXISTS "crm_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "filename" text NOT NULL,
  "format" text NOT NULL,
  "source" text DEFAULT 'import' NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "created_count" integer DEFAULT 0 NOT NULL,
  "updated_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text DEFAULT '' NOT NULL,
  "last_name" text DEFAULT '' NOT NULL,
  "company" text DEFAULT '' NOT NULL,
  "profession" text DEFAULT '' NOT NULL,
  "email" text,
  "phone" text,
  "website" text,
  "address" text,
  "postal_code" text,
  "city" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "stage" text DEFAULT 'new' NOT NULL,
  "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "plan" text,
  "billing_period" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "notes" text,
  "do_not_contact" boolean DEFAULT false NOT NULL,
  "lost_reason" text,
  "next_action_at" timestamp with time zone,
  "next_action" text,
  "last_contact_at" timestamp with time zone,
  "import_id" uuid,
  "lead_id" uuid,
  "prospect_id" uuid,
  "site_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "due_at" timestamp with time zone,
  "done_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_import_id_crm_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."crm_imports"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_stage_idx" ON "crm_contacts" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_email_idx" ON "crm_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_phone_idx" ON "crm_contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_next_action_idx" ON "crm_contacts" USING btree ("next_action_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_contacts_import_idx" ON "crm_contacts" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_contacts_lead_id_unique" ON "crm_contacts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_contact_idx" ON "crm_activities" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_due_idx" ON "crm_activities" USING btree ("due_at");
