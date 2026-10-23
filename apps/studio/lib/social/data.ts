/**
 * Lecture des contenus réseaux sociaux (§5.1). Chaque requête est filtrée par
 * site et par plage de dates : on ne charge jamais tout l'historique d'un site.
 */

import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { blogArticles, getDb, sites, socialPosts, type SocialPost } from "@theralys/db";
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
  /** Créneaux restants du mois (cadence + nouvel article), strictement après `now` */
  slots: SocialSlot[];
  /** Créneaux non encore occupés par un contenu du calendrier */
  freeSlots: SocialSlot[];
  /** Contenus du calendrier (source = calendar) non archivés dans le mois */
  calendarCount: number;
  /** Contenus du mois (toutes sources) déjà téléchargés */
  downloaded: number;
  /** Contenus du mois marqués comme publiés */
  published: number;
};

export type SocialRequestUsage = {
  used: number;
  remaining: number;
  /** "YYYY-MM-DD" : 1er du mois suivant (UTC) */
  resetsOn: string;
};

function toCalendarItem(post: SocialPost, accentColor: string): SocialCalendarItem {
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

/** Contenus non archivés du mois, triés par date puis création. */
export async function getSocialMonth(
  siteId: string,
  year: number,
  month: number,
): Promise<SocialCalendarItem[]> {
  const db = getDb();
  const { startIso, endIso } = monthRange(year, month);
  const [site, posts] = await Promise.all([
    db.query.sites.findFirst({ where: eq(sites.id, siteId), columns: { theme: true } }),
    db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.siteId, siteId),
        ne(socialPosts.status, "archived"),
        gte(socialPosts.scheduledFor, startIso),
        lt(socialPosts.scheduledFor, endIso),
      ),
      orderBy: [asc(socialPosts.scheduledFor), asc(socialPosts.createdAt)],
    }),
  ]);
  if (!site) return [];
  return posts.map((post) =>
    toCalendarItem(
      post,
      resolveSocialTheme(site.theme, post.accentColor, post.content.accentRole).accent,
    ),
  );
}

/** Articles du mois (en ligne ou planifiés) pour les créneaux « nouvel article ». */
async function monthArticles(siteId: string, year: number, month: number) {
  const db = getDb();
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

/** Créneaux du mois (`socialSlotsForMonth`) moins les dates déjà occupées, et compteurs. */
export async function getSocialMonthState(
  siteId: string,
  year: number,
  month: number,
  now: Date,
): Promise<SocialMonthState> {
  const db = getDb();
  const { startIso, endIso } = monthRange(year, month);
  const [articles, posts] = await Promise.all([
    monthArticles(siteId, year, month),
    db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.siteId, siteId),
        ne(socialPosts.status, "archived"),
        gte(socialPosts.scheduledFor, startIso),
        lt(socialPosts.scheduledFor, endIso),
      ),
      columns: { scheduledFor: true, source: true, status: true, downloadedAt: true },
    }),
  ]);
  const slots = socialSlotsForMonth({ year, month, today: now, articles });
  const occupied = new Set(posts.filter((p) => p.source === "calendar").map((p) => p.scheduledFor));
  return {
    slots,
    freeSlots: slots.filter((slot) => !occupied.has(slot.date)),
    calendarCount: posts.filter((p) => p.source === "calendar").length,
    downloaded: posts.filter((p) => p.downloadedAt !== null).length,
    published: posts.filter((p) => p.status === "published").length,
  };
}

/**
 * Demandes « sur mesure » du mois civil UTC en cours : comptées sur
 * `source = 'request'`, tous statuts confondus (archiver ne rembourse pas).
 */
export async function getSocialRequestUsage(siteId: string, now: Date): Promise<SocialRequestUsage> {
  const db = getDb();
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
