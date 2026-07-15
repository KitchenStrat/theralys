import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import {
  analyticsEvents,
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  onboardingTasks,
  pages,
  prospects,
  searchQueryStats,
  sites,
  type Site,
} from "@theralys/db";
import { summarizePeriod, type PeriodStats } from "@theralys/analytics";

export type Period = "7j" | "30j" | "6m";

export function periodRange(period: Period, now = new Date()): { from: Date; to: Date } {
  const days = period === "7j" ? 7 : period === "30j" ? 30 : 182;
  const to = now;
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to };
}

export async function getSite(siteId: string): Promise<Site> {
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error("Site introuvable");
  return site;
}

export async function getProspect(site: Site) {
  if (!site.prospectId) return null;
  const db = getDb();
  return (
    (await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })) ?? null
  );
}

/** Statistiques du dashboard (tracking maison) sur la période + la précédente. */
export async function getDashboardStats(siteId: string, period: Period): Promise<PeriodStats> {
  const db = getDb();
  const { from, to } = periodRange(period);
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const events = await db.query.analyticsEvents.findMany({
    where: and(eq(analyticsEvents.siteId, siteId), gte(analyticsEvents.occurredAt, prevFrom)),
    columns: { type: true, visitorId: true, occurredAt: true },
  });
  return summarizePeriod(events, from, to);
}

export async function getOnboarding(siteId: string) {
  const db = getDb();
  return db.query.onboardingTasks.findMany({
    where: eq(onboardingTasks.siteId, siteId),
    orderBy: [asc(onboardingTasks.position)],
  });
}

export async function getGoogleConnection(siteId: string) {
  const db = getDb();
  return (
    (await db.query.googleConnections.findFirst({
      where: eq(googleConnections.siteId, siteId),
    })) ?? null
  );
}

export type GoogleVisibility = {
  monthImpressions: number;
  changePct: number | null;
  topQueries: { query: string; impressions: number }[];
  otherQueriesCount: number;
};

/** « Ce mois-ci, N personnes ont vu votre cabinet sur Google — +X % » + requêtes. */
export async function getGoogleVisibility(siteId: string): Promise<GoogleVisibility | null> {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  // Comparaison à durée égale : mois en cours vs le même nombre de jours
  // écoulés le mois dernier (les données GSC arrivent avec 2-3 jours de retard)
  const elapsedDays = Math.max(1, Math.floor((now.getTime() - monthStart.getTime()) / 86_400_000));
  const prevWindowEnd = new Date(prevMonthStart.getTime() + elapsedDays * 86_400_000);

  const monthStartIso = monthStart.toISOString().slice(0, 10);
  const prevMonthStartIso = prevMonthStart.toISOString().slice(0, 10);
  const prevWindowEndIso = prevWindowEnd.toISOString().slice(0, 10);

  const [current, previousTotal] = await Promise.all([
    db
      .select({
        query: searchQueryStats.query,
        impressions: sql<number>`sum(${searchQueryStats.impressions})`.mapWith(Number),
      })
      .from(searchQueryStats)
      .where(and(eq(searchQueryStats.siteId, siteId), gte(searchQueryStats.day, monthStartIso)))
      .groupBy(searchQueryStats.query),
    db
      .select({
        impressions: sql<number>`coalesce(sum(${searchQueryStats.impressions}), 0)`.mapWith(Number),
      })
      .from(searchQueryStats)
      .where(
        and(
          eq(searchQueryStats.siteId, siteId),
          gte(searchQueryStats.day, prevMonthStartIso),
          sql`${searchQueryStats.day} < ${prevWindowEndIso}`,
        ),
      ),
  ]);

  if (current.length === 0) return null;

  const monthImpressions = current.reduce((sum, r) => sum + r.impressions, 0);
  const prevImpressions = previousTotal[0]?.impressions ?? 0;

  const sorted = [...current].sort((a, b) => b.impressions - a.impressions);
  return {
    monthImpressions,
    changePct:
      prevImpressions > 0
        ? Math.round(((monthImpressions - prevImpressions) / prevImpressions) * 100)
        : null,
    topQueries: sorted.slice(0, 4).map(({ query, impressions }) => ({ query, impressions })),
    otherQueriesCount: Math.max(0, sorted.length - 4),
  };
}

// ─── Publications ─────────────────────────────────────────────────────────────

export type CalendarItem = {
  /** ISO yyyy-mm-dd */
  date: string;
  kind: "article" | "planned";
  articleId?: string;
  entryId?: string;
  title: string;
  status: "published" | "draft" | "scheduled" | "withdrawn" | "planned";
  aiGenerated: boolean;
  motifTitle?: string;
  readingTimeMin?: number;
  imageUrl?: string | null;
};

export async function getMonthItems(siteId: string, year: number, month: number) {
  const db = getDb();
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const [articles, entries, motifPages] = await Promise.all([
    db.query.blogArticles.findMany({
      where: eq(blogArticles.siteId, siteId),
      orderBy: [desc(blogArticles.publishAt)],
    }),
    db.query.editorialCalendarEntries.findMany({
      where: and(
        eq(editorialCalendarEntries.siteId, siteId),
        eq(editorialCalendarEntries.status, "planned"),
      ),
    }),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, siteId), eq(pages.type, "motif")),
      columns: { slug: true, title: true },
    }),
  ]);
  const motifTitles = new Map(motifPages.map((p) => [p.slug, p.title]));

  const items: CalendarItem[] = [];
  for (const article of articles) {
    const anchor = article.publishAt ?? article.publishedAt ?? article.createdAt;
    if (anchor < monthStart || anchor >= monthEnd) continue;
    items.push({
      date: anchor.toISOString().slice(0, 10),
      kind: "article",
      articleId: article.id,
      title: article.title,
      status: article.status,
      aiGenerated: article.aiGenerated,
      motifTitle: article.motifSlug ? motifTitles.get(article.motifSlug) : undefined,
      readingTimeMin: article.readingTimeMin,
      imageUrl: article.imageUrl,
    });
  }
  for (const entry of entries) {
    const day = new Date(`${entry.scheduledFor}T00:00:00Z`);
    if (day < monthStart || day >= monthEnd) continue;
    items.push({
      date: entry.scheduledFor,
      kind: "planned",
      entryId: entry.id,
      title: entry.topic,
      status: "planned",
      aiGenerated: true,
      motifTitle: entry.motifSlug ? motifTitles.get(entry.motifSlug) : undefined,
    });
  }
  return items;
}

export async function getBlogSettings(siteId: string) {
  const db = getDb();
  return (
    (await db.query.blogSettings.findFirst({ where: eq(blogSettings.siteId, siteId) })) ?? null
  );
}

export async function getArticle(siteId: string, articleId: string) {
  const db = getDb();
  const article = await db.query.blogArticles.findFirst({
    where: and(eq(blogArticles.id, articleId), eq(blogArticles.siteId, siteId)),
  });
  return article ?? null;
}

// ─── Éditeur ──────────────────────────────────────────────────────────────────

export async function getEditablePages(siteId: string) {
  const db = getDb();
  return db.query.pages.findMany({
    where: eq(pages.siteId, siteId),
    orderBy: [asc(pages.position)],
  });
}

export function siteUrl(site: Site): string {
  if (site.domain) return `https://${site.domain}`;
  const base = process.env.SITES_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${site.slug}`;
}
