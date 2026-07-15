CREATE TYPE "public"."analytics_event_type" AS ENUM('pageview', 'rdv_click');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'scheduled', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."blog_publication_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."calendar_entry_status" AS ENUM('planned', 'generated', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'registered', 'configured', 'error');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('feminin', 'masculin');--> statement-breakpoint
CREATE TYPE "public"."google_connection_status" AS ENUM('connected', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'demo_sent', 'meeting', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."page_type" AS ENUM('home', 'motif', 'about', 'blog', 'legal');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('starter', 'boost', 'scale');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('generating', 'ready', 'error', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."site_type" AS ENUM('demo', 'client');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client');--> statement-breakpoint
CREATE TYPE "public"."voice_designation" AS ENUM('nous', 'je', 'on');--> statement-breakpoint
CREATE TYPE "public"."voice_reader" AS ENUM('vous', 'tu');--> statement-breakpoint
CREATE TYPE "public"."voice_tone" AS ENUM('chaleureux', 'rassurant', 'pose', 'direct', 'pedagogue');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"visitor_id" text,
	"path" text DEFAULT '/' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"image_url" text,
	"image_ai_generated" boolean DEFAULT false NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"motif_slug" text,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"reading_time_min" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"publication_mode" "blog_publication_mode" DEFAULT 'auto' NOT NULL,
	"voice_designation" "voice_designation" DEFAULT 'je' NOT NULL,
	"voice_accord" "gender" DEFAULT 'feminin' NOT NULL,
	"voice_reader" "voice_reader" DEFAULT 'vous' NOT NULL,
	"voice_tone" "voice_tone" DEFAULT 'chaleureux' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_settings_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registrar" text DEFAULT 'ovh' NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "editorial_calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"scheduled_for" date NOT NULL,
	"topic" text NOT NULL,
	"motif_slug" text,
	"status" "calendar_entry_status" DEFAULT 'planned' NOT NULL,
	"article_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"status" "google_connection_status" DEFAULT 'connected' NOT NULL,
	"google_email" text,
	"encrypted_refresh_token" text,
	"search_console_site_url" text,
	"business_profile_location_id" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_connections_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "google_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"source_review_id" text,
	"author_name" text NOT NULL,
	"rating" integer NOT NULL,
	"text" text NOT NULL,
	"reviewed_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"source" text DEFAULT 'demo' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"prospect_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"key" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "page_type" NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"profession" text NOT NULL,
	"city" text NOT NULL,
	"gender" "gender" NOT NULL,
	"google_place_id" text,
	"google_business_name" text,
	"google_address" text,
	"google_rating" real,
	"google_review_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_query_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"day" date NOT NULL,
	"query" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "site_type" DEFAULT 'demo' NOT NULL,
	"status" "site_status" DEFAULT 'generating' NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'scale' NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"booking_url" text,
	"theme" jsonb NOT NULL,
	"prospect_id" uuid,
	"highlighted_motifs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"generation_progress" jsonb DEFAULT '{"home":false,"motifs":false,"reviews":false,"articles":false}'::jsonb NOT NULL,
	"generation_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sites_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"billing_period" "billing_period" DEFAULT 'annual' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"name" text NOT NULL,
	"site_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_articles" ADD CONSTRAINT "blog_articles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_settings" ADD CONSTRAINT "blog_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_calendar_entries" ADD CONSTRAINT "editorial_calendar_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_calendar_entries" ADD CONSTRAINT "editorial_calendar_entries_article_id_blog_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_query_stats" ADD CONSTRAINT "search_query_stats_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_site_type_time_idx" ON "analytics_events" USING btree ("site_id","type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_articles_site_slug_idx" ON "blog_articles" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "blog_articles_site_status_idx" ON "blog_articles" USING btree ("site_id","status","publish_at");--> statement-breakpoint
CREATE INDEX "editorial_entries_site_date_idx" ON "editorial_calendar_entries" USING btree ("site_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "google_reviews_site_idx" ON "google_reviews" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_site_key_idx" ON "onboarding_tasks" USING btree ("site_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_site_slug_idx" ON "pages" USING btree ("site_id","type","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "search_stats_site_day_query_idx" ON "search_query_stats" USING btree ("site_id","day","query");--> statement-breakpoint
CREATE INDEX "sites_type_created_idx" ON "sites" USING btree ("type","created_at");