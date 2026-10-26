import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type {
  GoogleAudit,
  GoogleCompetitor,
  GoogleGridPoint,
  GooglePostContent,
  GoogleProfileSnapshot,
  GoogleReviewAnalysis,
  GoogleScanGrid,
  GoogleScanSummary,
  PageSections,
  SiteTheme,
  SocialPostAssets,
  SocialPostContent,
} from "@theralys/shared";
import type { PlanId } from "./plans";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "client"]);
export const genderEnum = pgEnum("gender", ["feminin", "masculin"]);
export const siteTypeEnum = pgEnum("site_type", ["demo", "client"]);
export const siteStatusEnum = pgEnum("site_status", [
  // Démos : generating (« En préparation ») → ready (« Prête à vérifier »)
  "generating",
  "ready",
  "error",
  // Sites clients (Phase 3)
  "published",
  "archived",
]);
export const pageTypeEnum = pgEnum("page_type", ["home", "motif", "about", "blog", "legal"]);
export const articleStatusEnum = pgEnum("article_status", [
  "draft", // Brouillon (rédigé, en attente de validation/planification)
  "scheduled", // Planifié (date de publication future)
  "published", // Publié
  "withdrawn", // Retiré
]);
export const blogPublicationModeEnum = pgEnum("blog_publication_mode", ["auto", "manual"]);
export const voiceDesignationEnum = pgEnum("voice_designation", ["nous", "je", "on"]);
export const voiceReaderEnum = pgEnum("voice_reader", ["vous", "tu"]);
export const voiceToneEnum = pgEnum("voice_tone", [
  "chaleureux",
  "rassurant",
  "pose",
  "direct",
  "pedagogue",
]);
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", ["pageview", "rdv_click"]);
export const planEnum = pgEnum("plan", ["starter", "boost", "scale"]);
export const calendarEntryStatusEnum = pgEnum("calendar_entry_status", [
  "planned",
  "generated",
  "skipped",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
]);
export const billingPeriodEnum = pgEnum("billing_period", ["monthly", "annual"]);
export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "registered",
  "configured",
  "error",
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "demo_sent",
  "meeting",
  "won",
  "lost",
]);
export const googleConnectionStatusEnum = pgEnum("google_connection_status", [
  "connected",
  "revoked",
  "error",
]);
export const socialPostFormatEnum = pgEnum("social_post_format", ["static", "carousel", "story"]);
export const socialPostSourceEnum = pgEnum("social_post_source", ["calendar", "request"]);
export const socialPostStatusEnum = pgEnum("social_post_status", ["ready", "published", "archived"]);
export const googleScanTriggerEnum = pgEnum("google_scan_trigger", ["manual", "scheduled"]);
export const googleScanStatusEnum = pgEnum("google_scan_status", ["running", "done", "error"]);
export const googleReviewTaskStatusEnum = pgEnum("google_review_task_status", ["pending", "done", "error"]);

// ─── Utilisateurs (admin agence / client praticien) ──────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("client"),
  name: text("name").notNull(),
  // Les comptes clients sont rattachés à leur site (null pour les admins)
  siteId: uuid("site_id").references((): AnyPgColumn => sites.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Prospects (cible d'une démo) ────────────────────────────────────────────

export const prospects = pgTable("prospects", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  profession: text("profession").notNull(), // ex. « Sophrologue »
  city: text("city").notNull(), // ex. « Albi »
  gender: genderEnum("gender").notNull(), // pour les accords grammaticaux
  // Fiche Google optionnelle (enrichissement pendant la préparation)
  googlePlaceId: text("google_place_id"),
  googleBusinessName: text("google_business_name"),
  googleAddress: text("google_address"),
  googleRating: real("google_rating"),
  googleReviewCount: integer("google_review_count"),
  // Photo principale de la fiche (URL googleusercontent résolue côté serveur)
  googlePhotoUrl: text("google_photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Sites (démos et clients) ────────────────────────────────────────────────

export type GenerationProgress = {
  home: boolean; // accueil
  motifs: boolean; // pages de spécialités
  reviews: boolean; // avis
  articles: boolean; // exemples d'articles
};

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: siteTypeEnum("type").notNull().default("demo"),
    status: siteStatusEnum("status").notNull().default("generating"),
    slug: text("slug").notNull().unique(),
    domain: text("domain").unique(), // domaine custom (Phase 3)
    name: text("name").notNull(), // ex. « Séverine Salesa, massages bien-être »
    plan: planEnum("plan").notNull().default("scale"),
    language: text("language").notNull().default("fr"),
    bookingUrl: text("booking_url"), // lien RDV externe (Calendly, Crenolib, tel:…)
    theme: jsonb("theme").$type<SiteTheme>().notNull(),
    prospectId: uuid("prospect_id").references(() => prospects.id),
    // Motifs à mettre en avant, saisis à la création de la démo (tags libres)
    highlightedMotifs: jsonb("highlighted_motifs").$type<string[]>().notNull().default([]),
    // Validité du lien de démo (« Lien actif » / « Expiré »)
    demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
    generationProgress: jsonb("generation_progress")
      .$type<GenerationProgress>()
      .notNull()
      .default({ home: false, motifs: false, reviews: false, articles: false }),
    generationError: text("generation_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sites_type_created_idx").on(t.type, t.createdAt)],
);

// ─── Pages (contenu structuré en sections typées, jamais de HTML libre) ──────

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    type: pageTypeEnum("type").notNull(),
    slug: text("slug").notNull(), // "" pour l'accueil, sinon slug du motif…
    title: text("title").notNull(),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    sections: jsonb("sections").$type<PageSections>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pages_site_slug_idx").on(t.siteId, t.type, t.slug)],
);

// ─── Blog ────────────────────────────────────────────────────────────────────

export const blogArticles = pgTable(
  "blog_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    content: text("content").notNull(), // markdown
    imageUrl: text("image_url"),
    imageAiGenerated: boolean("image_ai_generated").notNull().default(false),
    status: articleStatusEnum("status").notNull().default("draft"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    motifSlug: text("motif_slug"), // spécialité rattachée (maillage interne)
    publishAt: timestamp("publish_at", { withTimezone: true }), // date de publication prévue
    publishedAt: timestamp("published_at", { withTimezone: true }),
    readingTimeMin: integer("reading_time_min").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blog_articles_site_slug_idx").on(t.siteId, t.slug),
    index("blog_articles_site_status_idx").on(t.siteId, t.status, t.publishAt),
  ],
);

export const blogSettings = pgTable("blog_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: "cascade" }),
  publicationMode: blogPublicationModeEnum("publication_mode").notNull().default("auto"),
  voiceDesignation: voiceDesignationEnum("voice_designation").notNull().default("je"),
  voiceAccord: genderEnum("voice_accord").notNull().default("feminin"),
  voiceReader: voiceReaderEnum("voice_reader").notNull().default("vous"),
  voiceTone: voiceToneEnum("voice_tone").notNull().default("chaleureux"),
  /** Thématiques du blog + répartition mensuelle (wizard Paramètres, étapes 2-3) */
  themes: jsonb("themes").$type<BlogTheme[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Thématique éditoriale : libellé + nombre d'articles par mois. */
export type BlogTheme = { label: string; perMonth: number };

export const editorialCalendarEntries = pgTable(
  "editorial_calendar_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scheduledFor: date("scheduled_for").notNull(),
    topic: text("topic").notNull(),
    motifSlug: text("motif_slug"),
    status: calendarEntryStatusEnum("status").notNull().default("planned"),
    articleId: uuid("article_id").references(() => blogArticles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("editorial_entries_site_date_idx").on(t.siteId, t.scheduledFor)],
);

// ─── Statistiques (tracking maison) ──────────────────────────────────────────

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    type: analyticsEventTypeEnum("type").notNull(),
    // Identifiant de visiteur (cookie first-party, uniquement après consentement)
    visitorId: text("visitor_id"),
    path: text("path").notNull().default("/"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_site_type_time_idx").on(t.siteId, t.type, t.occurredAt)],
);

// ─── Google (OAuth par client, Phase 2) ──────────────────────────────────────

export const googleConnections = pgTable("google_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: "cascade" }),
  status: googleConnectionStatusEnum("status").notNull().default("connected"),
  googleEmail: text("google_email"),
  // Refresh token chiffré au repos (AES-256-GCM, clé TOKEN_ENCRYPTION_KEY)
  encryptedRefreshToken: text("encrypted_refresh_token"),
  searchConsoleSiteUrl: text("search_console_site_url"),
  businessProfileLocationId: text("business_profile_location_id"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const googleReviews = pgTable(
  "google_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    sourceReviewId: text("source_review_id"),
    authorName: text("author_name").notNull(),
    // Photo de profil Google de l'auteur (null → pastille avec initiale)
    authorPhotoUrl: text("author_photo_url"),
    rating: integer("rating").notNull(), // 1..5
    text: text("text").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    // ─── Fiche Google (0003) ───
    /** Provenance : places | dataforseo | mock | null (avis générés pour une démo, seed) */
    source: text("source"),
    /** Réponse publiée par le praticien sur Google (DataForSEO seulement ; null = pas de réponse ou inconnu) */
    ownerReply: text("owner_reply"),
    ownerRepliedAt: timestamp("owner_replied_at", { withTimezone: true }),
    /** Lien direct vers l'avis sur Google Maps (pour y répondre) */
    reviewUrl: text("review_url"),
    /** Analyse IA (sentiment, thèmes, réponse proposée), null tant que non analysé */
    analysis: jsonb("analysis").$type<GoogleReviewAnalysis>(),
  },
  (t) => [index("google_reviews_site_idx").on(t.siteId)],
);

export const searchQueryStats = pgTable(
  "search_query_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    day: date("day").notNull(), // données GSC décalées de 2-3 jours
    query: text("query").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [uniqueIndex("search_stats_site_day_query_idx").on(t.siteId, t.day, t.query)],
);

// ─── Onboarding client (Phase 2) ─────────────────────────────────────────────

export const onboardingTasks = pgTable(
  "onboarding_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    // guided_tour | connect_google | verify_pages | publish_site | activate_blog
    key: text("key").notNull(),
    done: boolean("done").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("onboarding_site_key_idx").on(t.siteId, t.key)],
);

// ─── Abonnements Stripe (Phase 3) ────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull(),
  billingPeriod: billingPeriodEnum("billing_period").notNull().default("annual"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Domaines custom (Phase 3) ───────────────────────────────────────────────

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  registrar: text("registrar").notNull().default("ovh"),
  status: domainStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Leads (Phase 4) ─────────────────────────────────────────────────────────

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  source: text("source").notNull().default("demo"), // demo | landing | referral…
  status: leadStatusEnum("status").notNull().default("new"),
  prospectId: uuid("prospect_id").references(() => prospects.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Réseaux sociaux (contenus prêts à poster, studio) ───────────────────────

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Toujours le site (sessions « agence »), jamais users.id
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scheduledFor: date("scheduled_for").notNull(),
    format: socialPostFormatEnum("format").notNull(),
    source: socialPostSourceEnum("source").notNull().default("calendar"),
    status: socialPostStatusEnum("status").notNull().default("ready"),
    topic: text("topic").notNull(),
    // Texte saisi dans la barre « sur mesure » (source = request)
    request: text("request"),
    // SocialTemplate (packages/shared)
    template: text("template").notNull(),
    // Hex #rrggbb choisi par le client ; null = content.accentRole
    accentColor: text("accent_color"),
    content: jsonb("content").$type<SocialPostContent>().notNull(),
    assets: jsonb("assets")
      .$type<SocialPostAssets>()
      .notNull()
      .default({ version: 1, renders: {} }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("social_posts_site_date_idx").on(t.siteId, t.scheduledFor)],
);

/**
 * Réglages « Paramétrage » des contenus réseaux sociaux (une ligne par site,
 * absente tant que le praticien n'a rien enregistré : la voix du blog fait
 * alors foi). Même voix que `blog_settings`, mais indépendante.
 */
export const socialSettings = pgTable("social_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  voiceDesignation: voiceDesignationEnum("voice_designation").notNull().default("je"),
  voiceAccord: genderEnum("voice_accord").notNull().default("feminin"),
  voiceReader: voiceReaderEnum("voice_reader").notNull().default("vous"),
  voiceTone: voiceToneEnum("voice_tone").notNull().default("chaleureux"),
  /** Consignes libres au générateur (≤ 1 500 caractères), null = aucune */
  instructions: text("instructions"),
  /** Jours de publication (ISO : 1 = lundi … 7 = dimanche), triés, 1 à 7 valeurs */
  postDays: jsonb("post_days").$type<number[]>().notNull().default([2, 5]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("social_settings_site_id_idx").on(t.siteId)]);

// ─── Fiche Google (studio : audit, visibilité, avis, posts) ──────────────────

/**
 * Instantané de la fiche + audit calculé (une ligne par synchronisation ; la
 * plus récente fait foi, les anciennes servent d'historique du score).
 */
export const googleProfileAudits = pgTable(
  "google_profile_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<GoogleProfileSnapshot>().notNull(),
    audit: jsonb("audit").$type<GoogleAudit>().notNull(),
    /** 0..100 (copie de audit.score, pour les requêtes) */
    score: integer("score").notNull(),
    /** Coût fournisseur de cette synchronisation (USD) */
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("google_profile_audits_site_time_idx").on(t.siteId, t.createdAt)],
);

/** Mots-clés suivis sur la carte de visibilité (≤ GOOGLE_KEYWORDS_MAX actifs par site). */
export const googleKeywords = pgTable(
  "google_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** Mot-clé normalisé (minuscules, espaces simples), ex. « sophrologue albi » */
    keyword: text("keyword").notNull(),
    /** GoogleGridRadius : quartier | ville | agglomeration */
    radius: text("radius").notNull().default("ville"),
    position: integer("position").notNull().default(0),
    /** false = retiré (historique des relevés conservé) */
    active: boolean("active").notNull().default(true),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("google_keywords_site_keyword_idx").on(t.siteId, t.keyword)],
);

/** Relevé de visibilité : une grille de positions pour un mot-clé à un instant. */
export const googleRankScans = pgTable(
  "google_rank_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => googleKeywords.id, { onDelete: "cascade" }),
    trigger: googleScanTriggerEnum("trigger").notNull().default("manual"),
    status: googleScanStatusEnum("status").notNull().default("running"),
    grid: jsonb("grid").$type<GoogleScanGrid>().notNull(),
    /** Résultats point par point (ordre de gridPoints), vide tant que running */
    points: jsonb("points").$type<GoogleGridPoint[]>().notNull().default([]),
    summary: jsonb("summary").$type<GoogleScanSummary>(),
    competitors: jsonb("competitors").$type<GoogleCompetitor[]>().notNull().default([]),
    costUsd: real("cost_usd").notNull().default(0),
    error: text("error"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("google_rank_scans_keyword_time_idx").on(t.keywordId, t.scannedAt)],
);

/** Posts Google prêts à publier (calendrier + demandes), même moteur que social_posts. */
export const googlePosts = pgTable(
  "google_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scheduledFor: date("scheduled_for").notNull(),
    source: socialPostSourceEnum("source").notNull().default("calendar"),
    status: socialPostStatusEnum("status").notNull().default("ready"),
    topic: text("topic").notNull(),
    request: text("request"),
    /** SocialTemplate statique (GOOGLE_POST_TEMPLATES) */
    template: text("template").notNull(),
    accentColor: text("accent_color"),
    content: jsonb("content").$type<GooglePostContent>().notNull(),
    assets: jsonb("assets")
      .$type<SocialPostAssets>()
      .notNull()
      .default({ version: 1, renders: {} }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("google_posts_site_date_idx").on(t.siteId, t.scheduledFor)],
);

/**
 * Registre des dépenses fournisseur (DataForSEO) par site et par mois : une
 * ligne par appel, `kind` = business_info | reviews | scan. Le plafond
 * GOOGLE_MONTHLY_BUDGET_USD se vérifie sur SUM(cost_usd) du mois.
 */
export const googleUsage = pgTable(
  "google_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** "YYYY-MM" (UTC) */
    month: text("month").notNull(),
    kind: text("kind").notNull(),
    costUsd: real("cost_usd").notNull(),
    requests: integer("requests").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("google_usage_site_month_idx").on(t.siteId, t.month)],
);

/** Tâches asynchrones « avis Google » (DataForSEO : task_post → task_get). */
export const googleReviewTasks = pgTable(
  "google_review_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** Identifiant DataForSEO */
    taskId: text("task_id").notNull(),
    status: googleReviewTaskStatusEnum("status").notNull().default("pending"),
    depth: integer("depth").notNull(),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("google_review_tasks_site_idx").on(t.siteId, t.status)],
);

// ─── Types dérivés ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type BlogArticle = typeof blogArticles.$inferSelect;
export type BlogSettingsRow = typeof blogSettings.$inferSelect;
export type EditorialCalendarEntry = typeof editorialCalendarEntries.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type GoogleReview = typeof googleReviews.$inferSelect;
export type SearchQueryStat = typeof searchQueryStats.$inferSelect;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
export type SocialSettings = typeof socialSettings.$inferSelect;
export type NewSocialSettings = typeof socialSettings.$inferInsert;
export type SitePlan = PlanId;
export type GoogleProfileAudit = typeof googleProfileAudits.$inferSelect;
export type GoogleKeyword = typeof googleKeywords.$inferSelect;
export type GoogleRankScan = typeof googleRankScans.$inferSelect;
export type NewGoogleRankScan = typeof googleRankScans.$inferInsert;
export type GooglePost = typeof googlePosts.$inferSelect;
export type NewGooglePost = typeof googlePosts.$inferInsert;
export type GoogleUsage = typeof googleUsage.$inferSelect;
export type GoogleReviewTask = typeof googleReviewTasks.$inferSelect;
