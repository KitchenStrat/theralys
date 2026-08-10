/**
 * Ticks planifiés — idempotents, l'état vit en base (cahier des charges :
 * cron + Postgres en solution de repli d'Inngest/Trigger.dev ; le passage à
 * une file durable est transparent, chaque tick étant une fonction pure).
 *
 * - ensureEditorialCalendars : complète le calendrier de sujets (horizon 6 sem.)
 * - generateDueArticles      : J-7, rédige les articles (Claude/mock) + image
 * - publishDueArticles       : publication automatique à l'échéance
 * - syncGoogleData           : rafraîchit les stats Search Console (mock)
 */

import { and, eq, inArray, lte } from "drizzle-orm";
import {
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  googleReviews,
  hasBlog,
  pages,
  prospects,
  searchQueryStats,
  sites,
  type Database,
  type Site,
} from "@theralys/db";
import {
  createArticleGenerator,
  createImageProvider,
  DEFAULT_VOICE,
  type BlogVoice,
} from "@theralys/ai";
import { readingTimeMinutes, slugify } from "@theralys/shared";
import { addDays, planEditorialTopics, startOfDayUtc } from "./editorial";
import { generateMockSearchStats } from "./google-mock";
import { generateMockReviews } from "./reviews-mock";

const HORIZON_WEEKS = 6;
/** L'IA rédige chaque article 7 jours avant sa date de publication. */
const WRITE_AHEAD_DAYS = 7;
/** Heure de publication (UTC) des articles planifiés. */
const PUBLISH_HOUR_UTC = 7;

export type TickReport = { task: string; processed: number };

/** Sites dont le blog est actif : formule avec blog + réglages existants. */
async function blogActiveSites(db: Database): Promise<Site[]> {
  const rows = await db
    .select({ site: sites })
    .from(sites)
    .innerJoin(blogSettings, eq(blogSettings.siteId, sites.id));
  return rows.map((r) => r.site).filter((s) => hasBlog(s.plan));
}

export async function ensureEditorialCalendars(now = new Date()): Promise<TickReport> {
  const db = getDb();
  let processed = 0;

  for (const site of await blogActiveSites(db)) {
    const motifs = await db.query.pages.findMany({
      where: and(eq(pages.siteId, site.id), eq(pages.type, "motif")),
      orderBy: (p, { asc }) => [asc(p.position)],
    });
    const prospect = site.prospectId
      ? await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : null;

    const [existing, existingArticles] = await Promise.all([
      db.query.editorialCalendarEntries.findMany({
        where: eq(editorialCalendarEntries.siteId, site.id),
      }),
      db.query.blogArticles.findMany({
        where: eq(blogArticles.siteId, site.id),
        columns: { title: true },
      }),
    ]);
    const existingDates = new Set(existing.map((e) => e.scheduledFor));
    const existingTopics = new Set([
      ...existing.map((e) => e.topic),
      ...existingArticles.map((a) => a.title),
    ]);

    const settings = await db.query.blogSettings.findFirst({
      where: eq(blogSettings.siteId, site.id),
    });

    const topics = planEditorialTopics({
      motifs: motifs.map((m) => ({ slug: m.slug, title: m.title })),
      themes: settings?.themes ?? undefined,
      city: prospect?.city ?? "votre ville",
      plan: site.plan,
      from: addDays(startOfDayUtc(now), 1),
      horizonWeeks: HORIZON_WEEKS,
      existingDates,
      existingTopics,
    });

    if (topics.length > 0) {
      await db.insert(editorialCalendarEntries).values(
        topics.map((t) => ({
          siteId: site.id,
          scheduledFor: t.scheduledFor,
          topic: t.topic,
          motifSlug: t.motifSlug,
        })),
      );
      processed += topics.length;
    }
  }
  return { task: "editorial-calendar", processed };
}

export async function generateDueArticles(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const generator = createArticleGenerator();
  const imageProvider = createImageProvider();
  const deadline = addDays(startOfDayUtc(now), WRITE_AHEAD_DAYS).toISOString().slice(0, 10);
  let processed = 0;

  for (const site of await blogActiveSites(db)) {
    const settings = await db.query.blogSettings.findFirst({
      where: eq(blogSettings.siteId, site.id),
    });
    const voice: BlogVoice = settings
      ? {
          designation: settings.voiceDesignation,
          accord: settings.voiceAccord,
          reader: settings.voiceReader,
          tone: settings.voiceTone,
        }
      : DEFAULT_VOICE;

    const prospect = site.prospectId
      ? await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : null;

    const due = await db.query.editorialCalendarEntries.findMany({
      where: and(
        eq(editorialCalendarEntries.siteId, site.id),
        eq(editorialCalendarEntries.status, "planned"),
        lte(editorialCalendarEntries.scheduledFor, deadline),
      ),
    });

    for (const entry of due) {
      const motifPage = entry.motifSlug
        ? await db.query.pages.findFirst({
            where: and(
              eq(pages.siteId, site.id),
              eq(pages.type, "motif"),
              eq(pages.slug, entry.motifSlug),
            ),
          })
        : null;

      const article = await generator.generateArticle(
        {
          topic: entry.topic,
          motifSlug: entry.motifSlug,
          motifTitle: motifPage?.title ?? null,
          profession: prospect?.profession ?? "praticien bien-être",
          city: prospect?.city ?? "votre ville",
          firstName: prospect?.firstName ?? "votre praticien",
        },
        voice,
      );

      const image = await imageProvider.generate({
        subject: article.title,
        themeColor: undefined,
      });

      const publishAt = new Date(`${entry.scheduledFor}T00:00:00Z`);
      publishAt.setUTCHours(PUBLISH_HOUR_UTC);

      const slug = await availableArticleSlug(db, site.id, article.slug || slugify(article.title));
      const [inserted] = await db
        .insert(blogArticles)
        .values({
          siteId: site.id,
          title: article.title,
          slug,
          excerpt: article.excerpt,
          content: article.content,
          imageUrl: image.url,
          imageAiGenerated: image.aiGenerated,
          // Publication automatique → planifié ; manuelle → brouillon à valider
          status: settings?.publicationMode === "manual" ? "draft" : "scheduled",
          aiGenerated: true,
          motifSlug: entry.motifSlug,
          publishAt,
          readingTimeMin: readingTimeMinutes(article.content),
        })
        .returning();

      await db
        .update(editorialCalendarEntries)
        .set({ status: "generated", articleId: inserted!.id })
        .where(eq(editorialCalendarEntries.id, entry.id));
      processed++;
    }
  }
  return { task: "generate-articles", processed };
}

export async function publishDueArticles(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const due = await db.query.blogArticles.findMany({
    where: and(eq(blogArticles.status, "scheduled"), lte(blogArticles.publishAt, now)),
  });
  if (due.length > 0) {
    await db
      .update(blogArticles)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(
        inArray(
          blogArticles.id,
          due.map((a) => a.id),
        ),
      );
  }
  return { task: "publish-articles", processed: due.length };
}

/** Sync Search Console — mock réaliste tant que l'OAuth Google réel n'est pas branché. */
export async function syncGoogleData(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const connections = await db.query.googleConnections.findMany({
    where: eq(googleConnections.status, "connected"),
  });
  let processed = 0;

  for (const connection of connections) {
    const site = await db.query.sites.findFirst({ where: eq(sites.id, connection.siteId) });
    if (!site) continue;
    const prospect = site.prospectId
      ? await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : null;

    // Données décalées de 2-3 jours, comme la vraie Search Console
    const stats = generateMockSearchStats({
      siteId: site.id,
      profession: prospect?.profession ?? "praticien",
      city: prospect?.city ?? "",
      days: 90,
      until: addDays(startOfDayUtc(now), -3),
    });

    await db.delete(searchQueryStats).where(eq(searchQueryStats.siteId, site.id));
    for (let i = 0; i < stats.length; i += 500) {
      await db.insert(searchQueryStats).values(stats.slice(i, i + 500));
    }
    processed += stats.length;
  }
  return { task: "sync-google", processed };
}

/**
 * Synchronisation des avis Google (toutes formules) : upsert par
 * sourceReviewId — jamais de doublon, les nouveaux avis apparaissent sur le
 * site public à la prochaine visite.
 */
export async function syncGoogleReviews(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const connections = await db.query.googleConnections.findMany({
    where: eq(googleConnections.status, "connected"),
  });
  let processed = 0;

  for (const connection of connections) {
    const site = await db.query.sites.findFirst({ where: eq(sites.id, connection.siteId) });
    if (!site) continue;
    const prospect = site.prospectId
      ? await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : null;

    const incoming = generateMockReviews({
      siteId: site.id,
      firstName: prospect?.firstName ?? "votre praticien",
      city: prospect?.city ?? "",
      now,
    });

    const existing = await db.query.googleReviews.findMany({
      where: eq(googleReviews.siteId, site.id),
      columns: { sourceReviewId: true },
    });
    const known = new Set(existing.map((r) => r.sourceReviewId).filter(Boolean));

    const fresh = incoming.filter((r) => !known.has(r.sourceReviewId));
    if (fresh.length > 0) {
      await db.insert(googleReviews).values(
        fresh.map((r) => ({
          siteId: site.id,
          sourceReviewId: r.sourceReviewId,
          authorName: r.authorName,
          rating: r.rating,
          text: r.text,
          reviewedAt: r.reviewedAt,
          syncedAt: now,
        })),
      );
      processed += fresh.length;
    }
  }
  return { task: "sync-google-reviews", processed };
}

export async function runAllTicks(now = new Date()): Promise<TickReport[]> {
  return [
    await ensureEditorialCalendars(now),
    await generateDueArticles(now),
    await publishDueArticles(now),
    await syncGoogleData(now),
    await syncGoogleReviews(now),
  ];
}

async function availableArticleSlug(db: Database, siteId: string, base: string): Promise<string> {
  const rows = await db.query.blogArticles.findMany({
    where: eq(blogArticles.siteId, siteId),
    columns: { slug: true },
  });
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}
