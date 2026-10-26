/**
 * Fixtures « Fiche Google » du site de démo local, pour développer et
 * vérifier la section sans les services jobs (fournisseur et IA en mock) :
 * un audit (+ un audit plus ancien pour l'historique), 2 mots-clés, deux
 * relevés `done` pour le premier, des avis analysés (réponses proposées) dont
 * certains avec réponse du praticien, et 2 posts Google.
 *
 * Idempotent et limité au site de démo : rien n'est supprimé, chaque bloc est
 * sauté s'il existe déjà. Refuse un site client.
 *
 *   DATABASE_URL=… AI_MOCK=1 DATAFORSEO_MOCK=1 pnpm --filter @theralys/studio fixtures:google
 *   (GOOGLE_FIXTURES_SLUG pour un autre site de démo)
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import {
  getDb,
  googleKeywords,
  googlePosts,
  googleProfileAudits,
  googleRankScans,
  googleReviews,
  prospects,
  sites,
  type NewGooglePost,
} from "@theralys/db";
import { createGooglePostGenerator, createGoogleReviewsAnalyzer } from "@theralys/ai";
import { MockLocalSearchProvider, mockReviews } from "@theralys/providers/dataforseo";
import {
  GOOGLE_GRID,
  GOOGLE_POST_DAY,
  aggregateCompetitors,
  auditGoogleProfile,
  benchmarkFrom,
  findOwnListing,
  gridPoints,
  gridRadiusKm,
  socialSlotsForMonth,
  summarizeScan,
  type GoogleGridPoint,
  type GoogleGridRadius,
  type GoogleMapsListing,
} from "@theralys/shared";
import { siteUrl } from "../lib/data";
import { loadSocialBrief } from "../lib/social/brief";

const SLUG = process.env.GOOGLE_FIXTURES_SLUG ?? "claire-dupont-sophrologue-albi";
const MOCK_PLACE_ID = "mock-claire-dupont-albi";
const ALBI = { lat: 43.9289, lng: 2.1464 };
const FIXTURE_TAG = "fixture:google";
const KEYWORDS: { keyword: string; radius: GoogleGridRadius }[] = [
  { keyword: "sophrologue albi", radius: "ville" },
  { keyword: "gestion du stress albi", radius: "quartier" },
];
const POST_TOPICS = ["Préparer la rentrée en douceur", "Mieux dormir : trois gestes simples"];
const OWNER_REPLY = "Merci beaucoup pour votre retour, c'est un plaisir de vous accompagner. À bientôt au cabinet !";
const DAY_MS = 86_400_000;

function log(message: string) {
  console.log(`[fixtures:google] ${message}`);
}

async function main() {
  process.env.AI_MOCK ??= "1";
  process.env.DATAFORSEO_MOCK ??= "1";
  const db = getDb();
  const now = new Date();

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, SLUG) });
  if (!site) throw new Error(`Site « ${SLUG} » introuvable : lancez d'abord pnpm db:seed.`);
  if (site.type !== "demo") throw new Error(`Le site « ${SLUG} » n'est pas une démo : fixtures refusées.`);
  if (!site.prospectId) throw new Error("Site sans fiche praticien.");
  let prospect = (await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })) ?? null;
  if (!prospect) throw new Error("Fiche praticien introuvable.");
  if (!prospect.googlePlaceId) {
    await db
      .update(prospects)
      .set({ googlePlaceId: MOCK_PLACE_ID, googleBusinessName: `${prospect.firstName} ${prospect.lastName}`, googleAddress: "14 rue de la Berbie, 81000 Albi" })
      .where(eq(prospects.id, prospect.id));
    prospect = (await db.query.prospects.findFirst({ where: eq(prospects.id, prospect.id) })) ?? prospect;
    log("fiche Google mock reliée au prospect");
  }
  const placeId = prospect.googlePlaceId ?? MOCK_PLACE_ID;
  const title = prospect.googleBusinessName ?? `${prospect.firstName} ${prospect.lastName}`;
  const provider = new MockLocalSearchProvider({ placeId, cid: null, title });

  // ── Avis : complément mock (≥ 8), réponses du praticien, analyses ─────────
  const existing = await db.query.googleReviews.findMany({
    where: eq(googleReviews.siteId, site.id),
    orderBy: [asc(googleReviews.id)],
  });
  if (existing.length < 8) {
    const known = new Set(existing.map((r) => r.sourceReviewId).filter((id): id is string => id !== null));
    const extra = mockReviews(`fixture-${site.id}`, 12).filter((r) => !known.has(r.sourceReviewId));
    if (extra.length > 0) {
      await db.insert(googleReviews).values(
        extra.map((r) => ({
          siteId: site.id,
          sourceReviewId: r.sourceReviewId,
          authorName: r.authorName,
          authorPhotoUrl: r.authorPhotoUrl,
          rating: r.rating,
          text: r.text,
          reviewedAt: r.reviewedAt,
          source: "mock",
          ownerReply: r.ownerReply,
          ownerRepliedAt: r.ownerRepliedAt,
          reviewUrl: r.reviewUrl,
        })),
      );
      log(`${extra.length} avis mock ajoutés`);
    }
  }
  const reviews = await db.query.googleReviews.findMany({
    where: eq(googleReviews.siteId, site.id),
    orderBy: [asc(googleReviews.id)],
  });
  // Réponses du praticien sur un avis positif sur trois (parmi ceux sans réponse ni analyse)
  let replied = 0;
  reviews.forEach((review, index) => {
    if (review.ownerReply !== null || review.rating < 4 || index % 3 !== 0) return;
    replied += 1;
  });
  if (replied > 0 && reviews.every((r) => r.ownerReply === null)) {
    for (const [index, review] of reviews.entries()) {
      if (review.rating < 4 || index % 3 !== 0) continue;
      await db
        .update(googleReviews)
        .set({ ownerReply: OWNER_REPLY, ownerRepliedAt: new Date((review.reviewedAt ?? now).getTime() + 2 * DAY_MS) })
        .where(and(eq(googleReviews.id, review.id), eq(googleReviews.siteId, site.id)));
    }
    log(`${replied} réponses du praticien posées`);
  }
  // Dates manquantes (avis du seed) : étalées sur les derniers mois pour la récence
  const undated = reviews.filter((r) => r.reviewedAt === null);
  for (const [index, review] of undated.entries()) {
    await db
      .update(googleReviews)
      .set({ reviewedAt: new Date(now.getTime() - (9 + index * 19) * DAY_MS), source: review.source ?? "mock" })
      .where(and(eq(googleReviews.id, review.id), eq(googleReviews.siteId, site.id)));
  }
  const { brief, photosById, refsById } = await loadSocialBrief(site.id);
  const toAnalyze = (await db.query.googleReviews.findMany({ where: and(eq(googleReviews.siteId, site.id), isNull(googleReviews.analysis)) })).slice(0, 20);
  if (toAnalyze.length > 0) {
    const analyzer = createGoogleReviewsAnalyzer();
    const analyses = await analyzer.analyze({
      brief,
      reviews: toAnalyze.map((r) => ({ id: r.id, authorName: r.authorName, rating: r.rating, text: r.text, reviewedAt: r.reviewedAt, ownerReply: r.ownerReply })),
      now,
    });
    for (const [id, analysis] of Object.entries(analyses)) {
      await db.update(googleReviews).set({ analysis }).where(and(eq(googleReviews.id, id), eq(googleReviews.siteId, site.id)));
    }
    log(`${Object.keys(analyses).length} avis analysés (mock)`);
  }

  // ── Mots-clés ─────────────────────────────────────────────────────────────
  for (const [position, k] of KEYWORDS.entries()) {
    await db
      .insert(googleKeywords)
      .values({ siteId: site.id, keyword: k.keyword, radius: k.radius, position, active: true })
      .onConflictDoNothing({ target: [googleKeywords.siteId, googleKeywords.keyword] });
  }
  const keywords = await db.query.googleKeywords.findMany({
    where: eq(googleKeywords.siteId, site.id),
    orderBy: [asc(googleKeywords.position)],
  });
  log(`${keywords.length} mots-clés en base`);

  // ── Instantané de la fiche (mock) ─────────────────────────────────────────
  const snapshotResult = await provider.businessInfo({ placeId, cid: null, title, near: ALBI });
  const snapshot = snapshotResult.data;
  if (!snapshot) throw new Error("instantané mock introuvable");
  const center = snapshot.location ?? ALBI;

  // ── Relevés du premier mot-clé : un planifié (J-16) puis un manuel (J-2) ──
  const first = keywords.find((k) => k.keyword === KEYWORDS[0]!.keyword);
  let latestCompetitors: ReturnType<typeof aggregateCompetitors> = [];
  if (first) {
    const existingScans = await db.query.googleRankScans.findMany({ where: eq(googleRankScans.keywordId, first.id), columns: { id: true, competitors: true } });
    if (existingScans.length === 0) {
      const radiusKm = gridRadiusKm(first.radius as GoogleGridRadius);
      const points = gridPoints(center, radiusKm);
      const grid = { center, rows: GOOGLE_GRID.rows, cols: GOOGLE_GRID.cols, radius: first.radius as GoogleGridRadius, radiusKm, zoom: GOOGLE_GRID.zoom };
      for (const [index, trigger] of (["scheduled", "manual"] as const).entries()) {
        // Variante de la requête pour que les deux relevés diffèrent (hachage par mot-clé + point)
        const keyword = index === 0 ? `${first.keyword} ` : first.keyword;
        const listings = await provider.mapsSearch(points.map((point) => ({ keyword, point, zoom: GOOGLE_GRID.zoom, depth: 20 })));
        const own = { placeId, cid: snapshot.cid, title };
        const results: GoogleGridPoint[] = points.map((point, i) => {
          const list: GoogleMapsListing[] = listings.data[i] ?? [];
          const self = findOwnListing(list, own);
          return {
            ...point,
            rank: self?.rank ?? null,
            top: list.slice(0, 3).map((l) => ({ title: l.title, cid: l.cid, rating: l.rating, votes: l.votes })),
          };
        });
        const competitors = aggregateCompetitors(listings.data, own);
        latestCompetitors = competitors;
        const scannedAt = new Date(now.getTime() - (index === 0 ? 16 : 2) * DAY_MS);
        await db.insert(googleRankScans).values({
          siteId: site.id,
          keywordId: first.id,
          trigger,
          status: "done",
          grid,
          points: results,
          summary: summarizeScan(results),
          competitors,
          costUsd: 0,
          scannedAt,
        });
        await db.update(googleKeywords).set({ lastScannedAt: scannedAt }).where(eq(googleKeywords.id, first.id));
      }
      log(`2 relevés insérés pour « ${first.keyword} »`);
    } else {
      latestCompetitors = existingScans[existingScans.length - 1]?.competitors ?? [];
    }
  }

  // ── Audits : un ancien (J-45, sans benchmark, peu d'avis) et l'actuel ─────
  const audits = await db.query.googleProfileAudits.findMany({ where: eq(googleProfileAudits.siteId, site.id), columns: { id: true } });
  if (audits.length === 0) {
    const allReviews = await db.query.googleReviews.findMany({
      where: eq(googleReviews.siteId, site.id),
      columns: { rating: true, reviewedAt: true, ownerReply: true },
    });
    const siteInfo = { url: siteUrl(site), hasBookingUrl: Boolean(site.bookingUrl) };
    const oldNow = new Date(now.getTime() - 45 * DAY_MS);
    const oldAudit = auditGoogleProfile({
      snapshot: { ...snapshot, fetchedAt: oldNow.toISOString(), totalPhotos: 2, additionalCategories: [], attributes: [] },
      benchmark: null,
      reviews: allReviews.slice(0, 3).map((r) => ({ ...r, ownerReply: null })),
      reviewsHaveOwnerReplies: false,
      site: siteInfo,
      now: oldNow,
    });
    const audit = auditGoogleProfile({
      snapshot,
      benchmark: latestCompetitors.length > 0 ? benchmarkFrom(latestCompetitors) : null,
      reviews: allReviews,
      reviewsHaveOwnerReplies: true,
      site: siteInfo,
      now,
    });
    await db.insert(googleProfileAudits).values([
      { siteId: site.id, snapshot: oldAudit.benchmark ? snapshot : { ...snapshot, fetchedAt: oldNow.toISOString() }, audit: oldAudit, score: oldAudit.score, costUsd: 0, createdAt: oldNow },
      { siteId: site.id, snapshot, audit, score: audit.score, costUsd: 0, createdAt: new Date(now.getTime() - 60_000) },
    ]);
    await db
      .update(prospects)
      .set({ googleRating: snapshot.rating, googleReviewCount: snapshot.votes, googleAddress: snapshot.address ?? prospect.googleAddress })
      .where(eq(prospects.id, prospect.id));
    log(`2 audits insérés (scores ${oldAudit.score} → ${audit.score}, grade ${audit.grade})`);
  }

  // ── Posts Google : deux prochains mardis ──────────────────────────────────
  const fixturePosts = await db.query.googlePosts.findMany({ where: and(eq(googlePosts.siteId, site.id), eq(googlePosts.request, FIXTURE_TAG)), columns: { id: true } });
  if (fixturePosts.length === 0) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const slots = [
      ...socialSlotsForMonth({ year, month, today: now, articles: [], postDays: [GOOGLE_POST_DAY] }),
      ...socialSlotsForMonth({ year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1, today: now, articles: [], postDays: [GOOGLE_POST_DAY] }),
    ].slice(0, POST_TOPICS.length);
    const generator = createGooglePostGenerator();
    const links = { siteUrl: siteUrl(site), bookingUrl: site.bookingUrl };
    const rows: NewGooglePost[] = [];
    for (const [index, slot] of slots.entries()) {
      const post = await generator.generateRequest(
        brief,
        { topic: POST_TOPICS[index]!, accentHex: null, scheduledFor: slot.date, recentTopics: [], photosById, refsById },
        links,
      );
      rows.push({
        siteId: site.id,
        scheduledFor: post.scheduledFor,
        source: "calendar",
        status: "ready",
        topic: post.topic,
        request: FIXTURE_TAG,
        template: post.template,
        accentColor: null,
        content: { ...post.content, planDays: [GOOGLE_POST_DAY] },
      });
    }
    if (rows.length > 0) {
      await db.insert(googlePosts).values(rows);
      log(`${rows.length} posts Google insérés (${rows.map((r) => r.scheduledFor).join(", ")})`);
    }
  }

  log(`terminé pour ${SLUG} (${site.id})`);
}

main()
  .then(async () => {
    await globalThis.__theralysPool?.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[fixtures:google] échec :", err);
    await globalThis.__theralysPool?.end();
    process.exit(1);
  });
