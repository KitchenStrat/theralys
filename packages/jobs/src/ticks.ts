/**
 * Ticks planifiés — idempotents, l'état vit en base (cahier des charges :
 * cron + Postgres en solution de repli d'Inngest/Trigger.dev ; le passage à
 * une file durable est transparent, chaque tick étant une fonction pure).
 *
 * - ensureEditorialCalendars : complète le calendrier de sujets (horizon 6 sem.)
 * - generateDueArticles      : J-7, rédige les articles (Claude/mock) + image
 * - publishDueArticles       : publication automatique à l'échéance
 * - syncGoogleData           : rafraîchit les stats Search Console (mock)
 * - syncGoogleReviews        : avis des fiches reliées (Places API, toutes
 *                              formules ; mock pour les démos seulement)
 * - syncGoogleProfiles       : fiche Google (studio) : instantané + audit
 *                              tous les 30 jours, tâche d'avis DataForSEO
 * - collectGoogleReviewTasks : tâches d'avis terminées → avis, audit, analyse IA
 * - runScheduledGoogleScans  : relevés de visibilité planifiés (14 jours)
 * - sendWeeklyContentDigests : lundi (Europe/Paris), e-mail « Vos contenus de
 *                              la semaine » (réseaux sociaux + fiche Google)
 * - sendMonthReminders       : le 25 (Europe/Paris), e-mail « Préparez votre
 *                              mois » si le mois suivant est vide
 *
 * `runAllTicks` enchaîne les ticks avec un try/catch par tick : un tick en
 * erreur est journalisé (`processed: 0`) et ne bloque pas les suivants. Les
 * ticks de la fiche Google (appels fournisseur longs) et les notifications
 * reçoivent une échéance (TICK_DEADLINE_MS après `now`) et n'entament plus
 * d'élément au-delà, pour rester sous la durée maximale de la route cron
 * (800 s). Les notifications sont idempotentes par `notification_log`
 * (site, kind, période) : un cron relancé n'envoie pas deux fois.
 */

import { and, eq, inArray, isNotNull, lte, ne } from "drizzle-orm";
import {
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  googleReviewTasks,
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
  createStockImageProvider,
  findStockOrGenerate,
  stockQueryFor,
  DEFAULT_VOICE,
  type BlogVoice,
} from "@theralys/ai";
import { readingTimeMinutes, slugify } from "@theralys/shared";
import { addDays, planEditorialTopics, startOfDayUtc } from "./editorial";
import { generateMockSearchStats } from "./google-mock";
import { createGooglePlacesProvider } from "@theralys/providers/google";
import { createLocalSearchProvider } from "@theralys/providers/dataforseo";
import { generateMockReviews } from "./reviews-mock";
import {
  collectGoogleReviewTasks,
  hasGoogleProfileAccess,
  runScheduledGoogleScans,
  syncGoogleProfiles,
} from "./google-profile";
import { sendMonthReminders, sendWeeklyContentDigests } from "./notifications";

const HORIZON_WEEKS = 6;
/** L'IA rédige chaque article 7 jours avant sa date de publication. */
const WRITE_AHEAD_DAYS = 7;
/** Heure de publication (UTC) des articles planifiés. */
const PUBLISH_HOUR_UTC = 7;

export type TickReport = { task: string; processed: number };

/** Options communes des ticks : `deadline` (facultative) arrête la boucle avant l'élément suivant une fois dépassée. */
export type TickOptions = { deadline?: Date };

/** Durée allouée aux ticks d'un passage (ms) : 660 s, sous les 800 s de la route cron, marge pour l'élément en cours. */
export const TICK_DEADLINE_MS = 660_000;

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
  const stock = createStockImageProvider();
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

      // Photo de banque d'images adaptée au sujet ; repli IA si indisponible
      const image = await findStockOrGenerate(stock, imageProvider, {
        query: article.imageQuery ?? stockQueryFor(entry.topic, prospect?.profession ?? undefined),
        subject: article.title,
        seed: article.slug || article.title,
        width: 1024,
        height: 576,
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
          imageUrl: image?.url ?? null,
          imageAiGenerated: image?.aiGenerated ?? false,
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
 * Synchronisation des avis Google (toutes formules) des sites dont la fiche
 * est reliée (`prospects.googlePlaceId`) : Places API (New) renvoie les 5
 * avis les plus pertinents, upsert par sourceReviewId (jamais de doublon ni
 * de suppression globale), note et nombre d'avis du prospect mis à jour. Les
 * sites éligibles à la section Fiche Google sont ignorés quand DataForSEO est
 * configuré : leurs avis arrivent par les tâches (`collectGoogleReviewTasks`).
 * Sans aucun fournisseur réel, des avis factices ne sont générés que pour les
 * démos (jamais sur un site client).
 */
export async function syncGoogleReviews(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const places = createGooglePlacesProvider();
  const local = createLocalSearchProvider();
  const rows = await db
    .select({ site: sites, prospect: prospects })
    .from(sites)
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(and(isNotNull(prospects.googlePlaceId), ne(sites.status, "archived")));
  let processed = 0;

  for (const { site, prospect } of rows) {
    const placeId = prospect.googlePlaceId;
    if (!placeId) continue;
    // Fiche Google (studio) + DataForSEO réel : avis complets via les tâches, pas Places
    if (local.mode === "dataforseo" && hasGoogleProfileAccess(site)) continue;

    if (places.mode === "google") {
      try {
        const details = await places.fetchDetails(placeId);
        processed += await upsertPlacesReviews(db, site.id, details.reviews, now);
        if (details.rating !== null) {
          await db
            .update(prospects)
            .set({
              googleRating: details.rating,
              googleReviewCount: details.reviewCount,
              ...(details.photoUrl ? { googlePhotoUrl: details.photoUrl } : {}),
            })
            .where(eq(prospects.id, prospect.id));
        }
      } catch (err) {
        console.warn(`[sync-reviews] fiche Google indisponible pour ${site.slug} :`, err);
      }
      continue;
    }

    // Aucun fournisseur réel : avis factices pour les démos uniquement, et
    // seulement tant qu'aucune tâche d'avis (mock) de la fiche Google n'a abouti
    if (site.type !== "demo") continue;
    const fed = await db.query.googleReviewTasks.findFirst({
      where: and(eq(googleReviewTasks.siteId, site.id), eq(googleReviewTasks.status, "done")),
      columns: { id: true },
    });
    if (fed) continue;
    const incoming = generateMockReviews({
      siteId: site.id,
      firstName: prospect.firstName,
      city: prospect.city,
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
          authorPhotoUrl: r.authorPhotoUrl,
          rating: r.rating,
          text: r.text,
          reviewedAt: r.reviewedAt,
          source: "mock",
          syncedAt: now,
        })),
      );
      processed += fresh.length;
    }
  }
  return { task: "sync-google-reviews", processed };
}

/** Avis Places → google_reviews : mise à jour des avis connus (par sourceReviewId), insertion des nouveaux. Renvoie le nombre d'avis traités. */
async function upsertPlacesReviews(
  db: Database,
  siteId: string,
  reviews: { sourceReviewId: string | null; authorName: string; authorPhotoUrl: string | null; rating: number; text: string; reviewedAt: Date | null }[],
  now: Date,
): Promise<number> {
  const withId = reviews.filter((r): r is typeof r & { sourceReviewId: string } => r.sourceReviewId !== null);
  if (withId.length === 0) return 0;
  const existing = await db.query.googleReviews.findMany({
    where: and(
      eq(googleReviews.siteId, siteId),
      inArray(
        googleReviews.sourceReviewId,
        withId.map((r) => r.sourceReviewId),
      ),
    ),
    columns: { id: true, sourceReviewId: true },
  });
  const known = new Map(existing.map((r) => [r.sourceReviewId, r.id]));
  const fresh: (typeof googleReviews.$inferInsert)[] = [];
  for (const r of withId) {
    const values = {
      authorName: r.authorName,
      authorPhotoUrl: r.authorPhotoUrl,
      rating: r.rating,
      text: r.text,
      reviewedAt: r.reviewedAt,
      source: "places",
      syncedAt: now,
    };
    const id = known.get(r.sourceReviewId);
    if (id) await db.update(googleReviews).set(values).where(eq(googleReviews.id, id));
    else fresh.push({ siteId, sourceReviewId: r.sourceReviewId, ...values });
  }
  if (fresh.length > 0) await db.insert(googleReviews).values(fresh);
  return withId.length;
}

const ALL_TICKS: { task: string; run: (now: Date, opts: TickOptions) => Promise<TickReport> }[] = [
  { task: "editorial-calendar", run: ensureEditorialCalendars },
  { task: "generate-articles", run: generateDueArticles },
  { task: "publish-articles", run: publishDueArticles },
  { task: "sync-google", run: syncGoogleData },
  { task: "sync-google-reviews", run: syncGoogleReviews },
  { task: "sync-google-profiles", run: syncGoogleProfiles },
  { task: "collect-google-reviews", run: collectGoogleReviewTasks },
  { task: "scheduled-google-scans", run: runScheduledGoogleScans },
  { task: "weekly-content-digests", run: sendWeeklyContentDigests },
  { task: "month-reminders", run: sendMonthReminders },
];

/**
 * Tous les ticks, dans l'ordre ; un tick en erreur est journalisé et ne
 * bloque pas les suivants. L'échéance commune (`now` + TICK_DEADLINE_MS) est
 * transmise à chaque tick ; seuls ceux de la fiche Google et des
 * notifications la lisent.
 */
export async function runAllTicks(now = new Date()): Promise<TickReport[]> {
  const reports: TickReport[] = [];
  const opts: TickOptions = { deadline: new Date(now.getTime() + TICK_DEADLINE_MS) };
  for (const { task, run } of ALL_TICKS) {
    try {
      reports.push(await run(now, opts));
    } catch (err) {
      console.error(`[ticks] ${task} en échec :`, err);
      reports.push({ task, processed: 0 });
    }
  }
  return reports;
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
