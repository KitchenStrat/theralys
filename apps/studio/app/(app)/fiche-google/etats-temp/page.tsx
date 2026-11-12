// FICHIER TEMPORAIRE DE VÉRIFICATION (lot « fiche-google ») — À SUPPRIMER AVANT DE RENDRE LA MAIN.
// Rend la section avec des données retouchées en mémoire (aucune écriture en base) pour voir les états
// que les données locales n'atteignent pas : fiche non reliée, audit absent, mois à préparer, quotas épuisés…
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { clampIsoDay, parisDay, parseMonthParam, shiftIsoDay } from "@/lib/calendar";
import { getProspect, getSite } from "@/lib/data";
import { getGoogleProfileData, type GoogleProfileData } from "@/lib/google/data";
import { GOOGLE_HORIZON_DAYS } from "@/lib/google/posts";
import { summarizeReviews } from "@/lib/google/reviews";
import { swatchesFor } from "@/lib/social/render/theme";
import { GoogleClient } from "../google-client";
import { isGoogleTab, type GoogleTab } from "../tabs";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ etat?: string; onglet?: string; mois?: string }> };

export default async function StatesPreview({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const { etat = "non-reliee", onglet, mois } = await searchParams;
  const now = new Date();
  const calendar = parseMonthParam(mois, now);
  const tab: GoogleTab = isGoogleTab(onglet) ? onglet : "audit";
  const prospect = await getProspect(site);
  const real = await getGoogleProfileData(site, prospect, calendar, now);
  const todayIso = parisDay(now);
  const min = shiftIsoDay(todayIso, 1);
  const max = shiftIsoDay(todayIso, GOOGLE_HORIZON_DAYS);

  let data: GoogleProfileData = real;
  if (etat === "non-reliee") {
    data = {
      ...real,
      linked: null,
      latestAudit: null,
      history: [],
      keywords: [],
      reviews: [],
      reviewsTotal: 0,
      reviewsSummary: summarizeReviews([]),
      posts: { items: [], state: { ...real.posts.state, calendarCount: 0, requestCount: 0, published: 0, toPublish: 0, freeSlots: real.posts.state.slots } },
      searchVisibility: { connected: false, visibility: null },
    };
  } else if (etat === "sans-audit") {
    data = { ...real, latestAudit: null, history: [], keywords: real.keywords.map((k) => ({ ...k, scans: [], lastScannedAt: null })) };
  } else if (etat === "sans-mot-cle") {
    data = { ...real, keywords: [] };
  } else if (etat === "gsc") {
    data = {
      ...real,
      searchVisibility: {
        connected: true,
        visibility: {
          monthImpressions: 1284,
          changePct: 12,
          topQueries: [
            { query: "sophrologue albi", impressions: 412 },
            { query: "gestion du stress albi", impressions: 198 },
            { query: "sophrologie sommeil albi cabinet rue des lilas séance individuelle", impressions: 91 },
            { query: "claire dupont sophrologue", impressions: 77 },
          ],
          otherQueriesCount: 23,
        },
      },
    };
  } else if (etat === "quotas") {
    data = {
      ...real,
      scanUsage: { ...real.scanUsage, used: 10, remaining: 0 },
      postUsage: { ...real.postUsage, used: 10, remaining: 0 },
      replyRemaining: 0,
      regenRemaining: 0,
    };
  } else if (etat === "mois-a-preparer") {
    const slots = real.posts.state.slots.length > 0 ? real.posts.state.slots : [{ date: shiftIsoDay(todayIso, 5), kind: "cadence" as const }];
    data = { ...real, posts: { items: [], state: { slots, freeSlots: slots, calendarCount: 0, requestCount: 0, published: 0, toPublish: 0 } } };
  } else if (etat === "grade-d" && real.latestAudit) {
    const audit = real.latestAudit.audit;
    data = {
      ...real,
      latestAudit: {
        ...real.latestAudit,
        audit: {
          ...audit,
          score: 38,
          grade: "D",
          checks: audit.checks.map((c, i) => (i % 3 === 0 ? { ...c, status: "unknown" as const, points: 0, detail: "Information non disponible." } : c)),
        },
        snapshot: { ...real.latestAudit.snapshot, votes: 12, rating: 4.2, totalPhotos: null },
      },
      history: real.history.slice(0, 1),
      reviewsSummary: { ...real.reviewsSummary, unanalyzed: 3 },
    };
  } else if (etat === "parfait" && real.latestAudit) {
    const audit = real.latestAudit.audit;
    data = {
      ...real,
      latestAudit: {
        ...real.latestAudit,
        audit: { ...audit, score: 100, grade: "A", actions: [], checks: audit.checks.map((c) => ({ ...c, status: "ok" as const, points: c.maxPoints })) },
      },
    };
  }

  return (
    <GoogleClient
      initialTab={tab}
      siteName={site.name}
      data={data}
      calendar={calendar}
      todayIso={todayIso}
      requestDates={{ default: clampIsoDay(min, min, max), min, max }}
      swatches={swatchesFor(site.theme)}
    />
  );
}
