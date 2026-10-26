/**
 * Posts Google (calendrier + demandes « sur mesure ») : lecture du mois
 * filtrée par site et par plage de dates, état du mois (fonction pure :
 * un créneau par semaine, le mardi — `GOOGLE_POST_DAY`), quota des demandes
 * (`GOOGLE_POST_REQUESTS_PER_MONTH`, mois civil UTC, archivage compris).
 * Miroir de `lib/social/data.ts` pour la table `google_posts`.
 */

import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, googlePosts, sites, type GooglePost } from "@theralys/db";
import {
  GOOGLE_POST_DAY,
  GOOGLE_POST_REQUESTS_PER_MONTH,
  isoDay,
  monthRange,
  socialSlotsForMonth,
  type GooglePostCta,
  type SocialPillar,
  type SocialSlot,
  type SocialSourceRef,
  type SocialTemplate,
} from "@theralys/shared";
import type { DbExecutor } from "@/lib/social/data";
import { resolveSocialTheme } from "@/lib/social/render/theme";

/** Horizon des demandes et des préparations de mois (jours), comme le social. */
export const GOOGLE_HORIZON_DAYS = 120;

export type GoogleCalendarItem = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  topic: string;
  source: "calendar" | "request";
  status: "ready" | "published";
  template: SocialTemplate;
  pillar: SocialPillar;
  /** Hex résolu (couleur choisie ou rôle d'accent dans la palette du site) */
  accentColor: string;
  summary: string;
  cta: { type: GooglePostCta; url: string | null };
  altText: string;
  note?: string;
  slide: { title: string; body: string; hasImage: boolean };
  sourceRefs: SocialSourceRef[];
  /** ISO 8601 */
  downloadedAt: string | null;
  publishedAt: string | null;
};

export type GoogleMonthState = {
  /** Créneaux restants du mois (mardis strictement après `now`, UTC) */
  slots: SocialSlot[];
  /** Créneaux à pourvoir : les N premiers créneaux sans post, N = créneaux − posts du calendrier créés (archivés inclus) */
  freeSlots: SocialSlot[];
  calendarCount: number;
  requestCount: number;
  published: number;
  /** Posts visibles pas encore publiés */
  toPublish: number;
};

export type GoogleMonthData = { items: GoogleCalendarItem[]; state: GoogleMonthState };

export type GoogleMonthPostLite = {
  scheduledFor: string;
  source: "calendar" | "request";
  status: "ready" | "published" | "archived";
};

export type GoogleRequestUsage = { used: number; remaining: number; resetsOn: string };

type CalendarRow = Omit<GooglePost, "assets">;

function toCalendarItem(post: CalendarRow, accentColor: string): GoogleCalendarItem {
  const { content } = post;
  return {
    id: post.id,
    date: post.scheduledFor,
    topic: post.topic,
    source: post.source,
    status: post.status === "published" ? "published" : "ready",
    template: post.template as SocialTemplate,
    pillar: content.pillar,
    accentColor,
    summary: content.summary,
    cta: content.cta,
    altText: content.altText,
    ...(content.note ? { note: content.note } : {}),
    slide: { title: content.slide.title, body: content.slide.body, hasImage: Boolean(content.slide.imageUrl) },
    sourceRefs: content.sourceRefs,
    downloadedAt: post.downloadedAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}

/**
 * État du mois (fonction pure) : un créneau par mardi à venir ; les posts du
 * calendrier déjà créés (archivés inclus) comptent comme créneaux pourvus,
 * déplacer ou retirer un post ne libère donc rien.
 */
export function computeGoogleMonthState(input: {
  year: number;
  month: number;
  now: Date;
  posts: GoogleMonthPostLite[];
}): GoogleMonthState {
  const slots = socialSlotsForMonth({
    year: input.year,
    month: input.month,
    today: input.now,
    articles: [],
    postDays: [GOOGLE_POST_DAY],
  });
  const visible = input.posts.filter((p) => p.status !== "archived");
  const calendarAll = input.posts.filter((p) => p.source === "calendar").length;
  const missing = Math.max(0, slots.length - calendarAll);
  const occupied = new Set(visible.filter((p) => p.source === "calendar").map((p) => p.scheduledFor));
  const published = visible.filter((p) => p.status === "published").length;
  return {
    slots,
    freeSlots: slots.filter((slot) => !occupied.has(slot.date)).slice(0, missing),
    calendarCount: visible.filter((p) => p.source === "calendar").length,
    requestCount: visible.filter((p) => p.source === "request").length,
    published,
    toPublish: visible.length - published,
  };
}

/** Posts du mois (non archivés) et état du mois, en une lecture de `google_posts`. */
export async function getGoogleMonth(siteId: string, year: number, month: number, now: Date): Promise<GoogleMonthData> {
  const db = getDb();
  const { startIso, endIso } = monthRange(year, month);
  const [site, posts] = await Promise.all([
    db.query.sites.findFirst({ where: eq(sites.id, siteId), columns: { theme: true } }),
    db.query.googlePosts.findMany({
      where: and(eq(googlePosts.siteId, siteId), gte(googlePosts.scheduledFor, startIso), lt(googlePosts.scheduledFor, endIso)),
      columns: { assets: false },
      orderBy: [asc(googlePosts.scheduledFor), asc(googlePosts.createdAt)],
    }),
  ]);
  const state = computeGoogleMonthState({ year, month, now, posts });
  if (!site) return { items: [], state };
  const items = posts
    .filter((post) => post.status !== "archived")
    .map((post) => toCalendarItem(post, resolveSocialTheme(site.theme, post.accentColor, post.content.accentRole).accent));
  return { items, state };
}

/** État du mois seul (projection minimale), sous transaction (`db` = tx). */
export async function loadGoogleMonthState(
  db: DbExecutor,
  siteId: string,
  year: number,
  month: number,
  now: Date,
): Promise<GoogleMonthState> {
  const { startIso, endIso } = monthRange(year, month);
  const posts = await db.query.googlePosts.findMany({
    where: and(eq(googlePosts.siteId, siteId), gte(googlePosts.scheduledFor, startIso), lt(googlePosts.scheduledFor, endIso)),
    columns: { scheduledFor: true, source: true, status: true },
  });
  return computeGoogleMonthState({ year, month, now, posts });
}

/** Demandes « sur mesure » du mois civil UTC (tous statuts : archiver ne rembourse pas). */
export async function getGoogleRequestUsage(siteId: string, now: Date, db: DbExecutor = getDb()): Promise<GoogleRequestUsage> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [row] = await db
    .select({ used: sql<number>`count(*)`.mapWith(Number) })
    .from(googlePosts)
    .where(and(eq(googlePosts.siteId, siteId), eq(googlePosts.source, "request"), gte(googlePosts.createdAt, monthStart)));
  const used = row?.used ?? 0;
  return { used, remaining: Math.max(0, GOOGLE_POST_REQUESTS_PER_MONTH - used), resetsOn: isoDay(nextMonthStart) };
}

const RECENT_TOPICS_DAYS = 60;
const RECENT_TOPICS_MAX = 40;

/** Sujets déjà traités (posts Google depuis J-60, archivés inclus), ≤ 40, dédoublonnés. */
export async function recentGoogleTopics(siteId: string, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - RECENT_TOPICS_DAYS * 86_400_000);
  const posts = await getDb().query.googlePosts.findMany({
    where: and(eq(googlePosts.siteId, siteId), gte(googlePosts.scheduledFor, isoDay(since))),
    orderBy: [desc(googlePosts.scheduledFor)],
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
    for (const ref of post.content.sourceRefs) if (ref.kind !== "request") push(ref.label);
  }
  return topics;
}
