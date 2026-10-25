/**
 * Lecture des contenus réseaux sociaux (§5.1). Chaque requête est filtrée par
 * site et par plage de dates : on ne charge jamais tout l'historique d'un site.
 * L'état du mois (créneaux à pourvoir, compteurs) est une fonction pure des
 * contenus déjà chargés : une seule lecture de `social_posts` par rendu de page.
 */

import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { blogArticles, getDb, sites, socialPosts, type Database, type SocialPost } from "@theralys/db";
import {
  isoDay,
  monthRange,
  sizesFor,
  socialSlotsForMonth,
  SOCIAL_REQUESTS_PER_MONTH,
  type SocialFormat,
  type SocialPillar,
  type SocialSize,
  type SocialSlot,
  type SocialSourceRef,
  type SocialTemplate,
} from "@theralys/shared";
import { resolveSocialTheme } from "@/lib/social/render/theme";

/** Transaction drizzle en cours (`tx` du callback de `db.transaction`). */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Exécuteur : le client partagé ou la transaction en cours — toute lecture sous transaction passe par `tx`. */
export type DbExecutor = Database | DbTransaction;

/** Horizon des demandes « sur mesure » et des planifications de mois (jours). */
export const SOCIAL_HORIZON_DAYS = 120;

export type SocialCalendarItem = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  topic: string;
  format: SocialFormat;
  source: "calendar" | "request";
  status: "ready" | "published";
  template: SocialTemplate;
  pillar: SocialPillar;
  /** Hex résolu (couleur choisie ou rôle d'accent dans la palette du site) — pastille du calendrier */
  accentColor: string;
  slideCount: number;
  caption: string;
  hashtags: string[];
  altText: string;
  note?: string;
  slides: { role: string; title: string; body: string; hasImage: boolean }[];
  sourceRefs: SocialSourceRef[];
  /** ISO 8601 */
  downloadedAt: string | null;
  publishedAt: string | null;
  sizes: SocialSize[];
};

export type SocialMonthState = {
  /** Créneaux restants du mois (cadence + nouvel article), strictement après `now` (UTC) */
  slots: SocialSlot[];
  /**
   * Créneaux à pourvoir : les N premiers créneaux sans contenu du calendrier
   * visible, N = créneaux − contenus du calendrier créés pour le mois (archivés
   * inclus). Déplacer ou retirer un contenu ne libère donc aucun créneau.
   */
  freeSlots: SocialSlot[];
  /** Contenus du calendrier (source = calendar) visibles (non archivés) */
  calendarCount: number;
  /** Contenus « sur mesure » visibles (non archivés) */
  requestCount: number;
  /** Contenus visibles marqués comme publiés */
  published: number;
  /** Contenus visibles téléchargés mais pas encore publiés */
  downloaded: number;
  /** Contenus visibles ni téléchargés ni publiés */
  toDownload: number;
};

/** Contenus du mois affichés et état dérivé, issus de la même lecture. */
export type SocialMonthData = { items: SocialCalendarItem[]; state: SocialMonthState };

/** Projection d'un contenu suffisante pour calculer l'état du mois. */
export type SocialMonthPostLite = {
  /** "YYYY-MM-DD" */
  scheduledFor: string;
  source: "calendar" | "request";
  status: "ready" | "published" | "archived";
  downloadedAt: Date | string | null;
  /** Contenu (seul `planDays` est lu : jours en vigueur à la préparation) */
  content?: { planDays?: number[] } | null;
};

/** Article du mois (`scheduled`/`published`) pour les créneaux « nouvel article ». */
export type SocialMonthArticle = { id: string; publishAt: Date | string | null };

export type SocialRequestUsage = {
  used: number;
  remaining: number;
  /** "YYYY-MM-DD" : 1er du mois suivant (UTC) */
  resetsOn: string;
};

/** Ligne de `social_posts` sans `assets` (inutile au calendrier). */
type CalendarRow = Omit<SocialPost, "assets">;

function toCalendarItem(post: CalendarRow, accentColor: string): SocialCalendarItem {
  const format = post.format as SocialFormat;
  const template = post.template as SocialTemplate;
  return {
    id: post.id,
    date: post.scheduledFor,
    topic: post.topic,
    format,
    source: post.source,
    status: post.status === "published" ? "published" : "ready",
    template,
    pillar: post.content.pillar,
    accentColor,
    slideCount: post.content.slides.length,
    caption: post.content.caption,
    hashtags: post.content.hashtags,
    altText: post.content.altText,
    note: post.content.note,
    slides: post.content.slides.map((s) => ({
      role: s.role,
      title: s.title,
      body: s.body,
      hasImage: Boolean(s.imageUrl),
    })),
    sourceRefs: post.content.sourceRefs,
    downloadedAt: post.downloadedAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    sizes: sizesFor(format, template),
  };
}

/**
 * État du mois (fonction pure) à partir des contenus du mois — archivés
 * inclus — et des articles du mois.
 */
export function computeSocialMonthState(input: {
  year: number;
  month: number;
  now: Date;
  posts: SocialMonthPostLite[];
  articles: SocialMonthArticle[];
  /** Jours de publication des réglages (ISO 1..7) ; défaut mardi/vendredi */
  postDays?: readonly number[];
}): SocialMonthState {
  // Un mois déjà préparé garde les jours de sa préparation : changer les jours
  // dans « Paramétrage » ne rouvre pas le mois (seuls les créneaux d'un plan IA
  // incomplet restent « manquants »)
  const planned = input.posts.find((p) => p.source === "calendar" && p.content?.planDays?.length);
  const postDays = planned?.content?.planDays ?? input.postDays;
  const slots = socialSlotsForMonth({
    year: input.year,
    month: input.month,
    today: input.now,
    articles: input.articles,
    ...(postDays ? { postDays } : {}),
  });
  const visible = input.posts.filter((p) => p.status !== "archived");
  const calendarAll = input.posts.filter((p) => p.source === "calendar").length;
  const missing = Math.max(0, slots.length - calendarAll);
  const occupied = new Set(visible.filter((p) => p.source === "calendar").map((p) => p.scheduledFor));
  const published = visible.filter((p) => p.status === "published").length;
  const downloaded = visible.filter((p) => p.status !== "published" && p.downloadedAt !== null).length;
  return {
    slots,
    freeSlots: slots.filter((slot) => !occupied.has(slot.date)).slice(0, missing),
    calendarCount: visible.filter((p) => p.source === "calendar").length,
    requestCount: visible.filter((p) => p.source === "request").length,
    published,
    downloaded,
    toDownload: visible.length - published - downloaded,
  };
}

/** Articles du mois (en ligne ou planifiés) pour les créneaux « nouvel article ». */
function monthArticles(
  db: DbExecutor,
  siteId: string,
  year: number,
  month: number,
): Promise<SocialMonthArticle[]> {
  const { start, end } = monthRange(year, month);
  return db.query.blogArticles.findMany({
    where: and(
      eq(blogArticles.siteId, siteId),
      inArray(blogArticles.status, ["published", "scheduled"]),
      gte(blogArticles.publishAt, start),
      lt(blogArticles.publishAt, end),
    ),
    columns: { id: true, publishAt: true },
  });
}

/**
 * Contenus du mois pour la page : contenus non archivés (triés par date puis
 * création) et état du mois, en une seule lecture de `social_posts`.
 * `postDays` : jours de publication des réglages (`getSocialSettings`).
 */
export async function getSocialMonth(
  siteId: string,
  year: number,
  month: number,
  now: Date,
  postDays?: readonly number[],
): Promise<SocialMonthData> {
  const db = getDb();
  const { startIso, endIso } = monthRange(year, month);
  const [site, posts, articles] = await Promise.all([
    db.query.sites.findFirst({ where: eq(sites.id, siteId), columns: { theme: true } }),
    // Archivés inclus : ils comptent dans les créneaux pourvus (jamais réaffichés)
    db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.siteId, siteId),
        gte(socialPosts.scheduledFor, startIso),
        lt(socialPosts.scheduledFor, endIso),
      ),
      columns: { assets: false },
      orderBy: [asc(socialPosts.scheduledFor), asc(socialPosts.createdAt)],
    }),
    monthArticles(db, siteId, year, month),
  ]);
  const state = computeSocialMonthState({ year, month, now, posts, articles, postDays });
  if (!site) return { items: [], state };
  const items = posts
    .filter((post) => post.status !== "archived")
    .map((post) =>
      toCalendarItem(post, resolveSocialTheme(site.theme, post.accentColor, post.content.accentRole).accent),
    );
  return { items, state };
}

/**
 * État du mois seul (projection minimale), pour la planification sous
 * transaction : `db` est alors la transaction en cours.
 */
export async function loadSocialMonthState(
  db: DbExecutor,
  siteId: string,
  year: number,
  month: number,
  now: Date,
  postDays?: readonly number[],
): Promise<SocialMonthState> {
  const { startIso, endIso } = monthRange(year, month);
  const [articles, posts] = await Promise.all([
    monthArticles(db, siteId, year, month),
    db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.siteId, siteId),
        gte(socialPosts.scheduledFor, startIso),
        lt(socialPosts.scheduledFor, endIso),
      ),
      columns: { scheduledFor: true, source: true, status: true, downloadedAt: true, content: true },
    }),
  ]);
  return computeSocialMonthState({ year, month, now, posts, articles, postDays });
}

/**
 * Demandes « sur mesure » du mois civil UTC en cours : comptées sur
 * `source = 'request'`, tous statuts confondus (archiver ne rembourse pas).
 * Sous transaction (quota garanti à l'insertion), passer `tx` en `db`.
 */
export async function getSocialRequestUsage(
  siteId: string,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<SocialRequestUsage> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ used: sql<number>`count(*)`.mapWith(Number) })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.siteId, siteId),
        eq(socialPosts.source, "request"),
        gte(socialPosts.createdAt, monthStart),
      ),
    );
  const used = row?.used ?? 0;
  return {
    used,
    remaining: Math.max(0, SOCIAL_REQUESTS_PER_MONTH - used),
    resetsOn: isoDay(nextMonthStart),
  };
}

/** Fenêtre des sujets récents transmis au modèle (jours). */
const RECENT_TOPICS_DAYS = 60;
const RECENT_TOPICS_MAX = 40;

/**
 * Sujets déjà traités : topics et libellés de sources des contenus prévus
 * depuis J-60 (à venir inclus, archivés inclus — on ne refait pas un contenu
 * que le praticien vient d'écarter), ≤ 40 entrées dédoublonnées.
 */
export async function recentSocialTopics(siteId: string, now: Date): Promise<string[]> {
  const db = getDb();
  const since = new Date(now.getTime() - RECENT_TOPICS_DAYS * 86_400_000);
  const posts = await db.query.socialPosts.findMany({
    where: and(eq(socialPosts.siteId, siteId), gte(socialPosts.scheduledFor, isoDay(since))),
    orderBy: [desc(socialPosts.scheduledFor)],
    limit: RECENT_TOPICS_MAX,
    columns: { topic: true, content: true },
  });
  const seen = new Set<string>();
  const topics: string[] = [];
  const push = (label: string) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key) || topics.length >= RECENT_TOPICS_MAX) return;
    seen.add(key);
    topics.push(label.trim());
  };
  for (const post of posts) {
    push(post.topic);
    for (const ref of post.content.sourceRefs) {
      if (ref.kind !== "request") push(ref.label);
    }
  }
  return topics;
}

/** Codes Postgres d'un schéma incomplet : table, colonne ou type (enum) absents. */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "42704"]);

/**
 * Vrai si l'erreur (ou une de ses causes, drizzle enveloppant celle du pilote)
 * signale que la migration `social_posts` n'est pas appliquée.
 */
export function isMissingSchemaError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && MISSING_SCHEMA_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}
