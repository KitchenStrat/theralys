/**
 * Google Ads (studio) — services de données partagés entre le studio
 * (server actions) et les scripts : contexte du site (métier, ville,
 * spécialités, contact, suivi des conversions, fiche reliée et dernier audit,
 * benchmark, mots-clés suivis, pages d'atterrissage), analyse complète
 * (idées DataForSEO → sélection → prévision → diagnostic → plan IA),
 * régénération du plan avec instructions, quotas mensuels.
 *
 * Règles (même esprit que `google-profile.ts`) :
 * - quota et budget recomptés sous verrou consultatif par site dans la
 *   transaction courte qui insère la ligne `google_ads_analyses` (`running`)
 *   et la ligne `google_usage` kind `ads_keywords` au coût estimé
 *   (GOOGLE_ADS_ANALYSIS_COST_USD) ; ramenée au coût réel après les appels ;
 * - jamais de données factices sur un site client : le fournisseur mock ne
 *   sert que les démos (`no_provider` sinon) ;
 * - l'échec de la prévision est toléré (forecast null, coût conservé) ; l'échec
 *   du plan IA seul laisse l'analyse `done` (mots-clés, prévision et bilan
 *   conservés, plan null, message utilisateur dans `error`) : le praticien
 *   relance seulement le plan ; toute autre erreur passe la ligne en `error`
 *   avec le coût réel déjà facturé (`DataForSeoError.costUsd`, sinon
 *   l'estimation par prudence) ;
 * - la colonne `error` et les messages rendus sont des phrases en français
 *   destinées au praticien (`adsErrorMessage`) ; le détail technique part
 *   dans les journaux `[google-ads]` ;
 * - la régénération du plan (kind `ads_plan`, coût 0) est inscrite dans la
 *   même transaction que la mise à jour du plan, sous verrou par site, avec
 *   un marqueur en mémoire par site pour refuser un second clic simultané
 *   avant tout appel IA.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  DATAFORSEO_ADS_UNIT_COSTS,
  GOOGLE_ADS_ANALYSES_PER_MONTH,
  GOOGLE_ADS_ANALYSIS_COST_USD,
  GOOGLE_ADS_INSTRUCTIONS_MAX,
  GOOGLE_ADS_MATCH_TYPES,
  GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH,
  benchmarkFrom,
  buildAdsSeeds,
  cleanSocialInstructions,
  diagnoseGoogleAds,
  hasConversionLabels,
  isMockPlaceId,
  selectAdsKeywords,
  suggestBidUsd,
  summarizeForecast,
  usageMonthKey,
  type GoogleAdsDiagnostic,
  type GoogleAdsDiagnosticInput,
  type GoogleAdsForecast,
  type GoogleAdsKeyword,
  type GoogleAdsKeywordSet,
  type GoogleAdsLandingPage,
  type GoogleAdsMatchType,
  type GoogleAdsPlan,
  type GoogleAdsPlanInput,
  type PageSections,
} from "@theralys/shared";
import {
  googleAdsAnalyses,
  googleKeywords,
  googleProfileAudits,
  googleRankScans,
  googleUsage,
  hasGoogleAds,
  motifPagesAllowance,
  pages,
  prospects,
  sites,
  type Database,
  type GoogleProfileAudit,
  type Prospect,
  type Site,
} from "@theralys/db";
import { createGoogleAdsPlanner, resolveProfession } from "@theralys/ai";
import { DataForSeoError } from "@theralys/providers/dataforseo";
import { adsBidForRequest, createAdsDataProvider, type AdsDataProvider } from "@theralys/providers/dataforseo/ads";
import { loadGoogleBrief } from "./google-brief";
import { googleBudget, hasRealGoogleProvider, type DbExecutor } from "./google-profile";

/** Analyse `running` plus ancienne : le processus est mort, la ligne passe en erreur. */
export const GOOGLE_ADS_ANALYSIS_STALE_MINUTES = 15;
/** Mots-clés envoyés à la prévision (limite de l'endpoint). */
const FORECAST_KEYWORDS_MAX = 1000;
const ERROR_MESSAGE_MAX = 300;
const ADS_USAGE_KINDS = ["ads_keywords", "ads_plan"] as const;

/** Messages destinés au praticien (colonne `error`, retours des services) ; le détail technique part dans les journaux. */
export const ADS_ERROR_MESSAGES = {
  providerRefused: "Le fournisseur de données a refusé la requête : contactez Harmony.",
  providerFunds: "Le fournisseur de données a refusé la requête (solde insuffisant) : contactez Harmony.",
  providerBusy: "Le fournisseur de données est momentanément saturé : réessayez dans quelques minutes.",
  providerTimeout: "Le fournisseur de données n'a pas répondu, réessayez dans quelques minutes.",
  noSeed: "Aucune expression à analyser : renseignez le métier du praticien.",
  plan: "Le plan d'action n'a pas pu être généré : relancez la génération du plan.",
  interrupted: "Analyse interrompue avant la fin — relancez-la.",
  unknown: "L'analyse a échoué : réessayez dans un instant.",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdsAnalysisOutcome =
  | {
      status: "done";
      analysisId: string;
      costUsd: number;
      /** Présent quand mots-clés et bilan sont enregistrés mais que le plan IA a échoué (message utilisateur, aussi dans `error`) */
      planError?: string;
    }
  | { status: "skipped"; reason: "no_access" | "quota" | "budget" | "no_provider" | "busy" }
  | { status: "error"; analysisId: string | null; message: string };

export type AdsPlanOutcome =
  | { status: "done"; analysisId: string; remaining: number }
  | { status: "skipped"; reason: "no_access" | "quota" | "busy" | "no_analysis" }
  | { status: "error"; message: string };

export type GoogleAdsUsage = {
  analysesUsed: number;
  analysesRemaining: number;
  planRegenUsed: number;
  planRegenRemaining: number;
};

/** Données du site utiles au diagnostic et au plan (sans les lignes brutes : testable sans base). */
export type GoogleAdsContextData = {
  profession: string;
  city: string;
  /** Titres des pages de spécialité en ligne */
  specialties: string[];
  bookingUrl: string | null;
  /** Téléphone affiché par le site (section Contact de l'accueil) */
  phone: string | null;
  tracking: { googleAdsId: string | null; hasConversionLabels: boolean };
  profile: GoogleAdsDiagnosticInput["profile"];
  benchmark: GoogleAdsDiagnosticInput["benchmark"];
  /** Mots-clés suivis actifs (Fiche Google) */
  trackedKeywords: string[];
  /** Accueil « / » puis spécialités « /<slug> » */
  landingPages: GoogleAdsLandingPage[];
  /** Pages de spécialité en ligne */
  motifPages: number;
};

export type GoogleAdsContext = GoogleAdsContextData & { site: Site; prospect: Prospect | null };

// ─── Logique pure (testée sans base) ─────────────────────────────────────────

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Message technique borné, pour les journaux seulement. */
function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").trim().slice(0, ERROR_MESSAGE_MAX) || "erreur inconnue";
}

/** Étape connue de l'appelant : fournisseur de données ou planificateur IA. */
export type AdsErrorStage = "provider" | "plan";

/** Erreur du planificateur (zod, Anthropic, garde-fous de `completeStructured`) reconnue sans indication d'étape. */
function looksLikePlanError(name: string, message: string): boolean {
  if (/DataForSEO/.test(message)) return false;
  if (name === "ZodError" || /^(?:API|Anthropic|RateLimit|Authentication|Permission|NotFound|BadRequest|InternalServer|Overloaded|UnprocessableEntity)/.test(name)) return true;
  return /garde-fous du modèle|Réponse tronquée|marketing éthique|Échec de génération|anthropic|JSON/i.test(message);
}

/**
 * Message en français destiné au praticien pour une erreur d'analyse ; le
 * détail technique (endpoint, statut fournisseur, erreur zod ou Anthropic
 * en anglais) n'est jamais montré, seulement journalisé par l'appelant.
 * Catégories : refus du fournisseur (solde insuffisant 40201 distingué),
 * saturation (40202), délai ou réseau, aucune graine, plan IA, inconnu.
 * `stage` fixe la catégorie quand l'appelant connaît l'étape.
 */
export function adsErrorMessage(err: unknown, stage?: AdsErrorStage): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const name = err instanceof Error ? err.name : "";
  if (message === ADS_ERROR_MESSAGES.noSeed) return message;
  if (stage === "plan" || (stage === undefined && looksLikePlanError(name, message))) return ADS_ERROR_MESSAGES.plan;
  const provider = err instanceof DataForSeoError || /^DataForSEO /.test(message);
  if (provider && /\b40201\b|insufficient funds/i.test(message)) return ADS_ERROR_MESSAGES.providerFunds;
  if (provider && /\b40202\b|rate limit/i.test(message)) return ADS_ERROR_MESSAGES.providerBusy;
  if (name === "AbortError" || /délai dépassé|timed? ?out|réseau|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|annulé| 5\d\d:/i.test(message)) {
    return ADS_ERROR_MESSAGES.providerTimeout;
  }
  if (provider) return ADS_ERROR_MESSAGES.providerRefused;
  return ADS_ERROR_MESSAGES.unknown;
}

/**
 * Fin d'analyse : mots-clés, prévision et bilan sont acquis ; si le plan IA
 * a échoué, l'analyse reste `done` (données conservées, plan null) avec un
 * message utilisateur dans `error`, et le praticien relance seulement le plan.
 */
export function adsAnalysisCompletion(plan: GoogleAdsPlan | null, planError: unknown = null): { status: "done"; plan: GoogleAdsPlan | null; error: string | null } {
  if (plan) return { status: "done", plan, error: null };
  return { status: "done", plan: null, error: adsErrorMessage(planError, "plan") };
}

/** Régénérations du plan en cours dans ce processus (par site) : second clic refusé sans appel IA, en plus du verrou consultatif en base (autres instances). */
const planRegenerationsInFlight = new Set<string>();

/** Pose le marqueur « régénération en cours » du site ; false s'il est déjà posé (à libérer avec `endAdsPlanRegeneration`). */
export function beginAdsPlanRegeneration(siteId: string): boolean {
  if (planRegenerationsInFlight.has(siteId)) return false;
  planRegenerationsInFlight.add(siteId);
  return true;
}

export function endAdsPlanRegeneration(siteId: string): void {
  planRegenerationsInFlight.delete(siteId);
}

export function isAdsPlanRegenerationInFlight(siteId: string): boolean {
  return planRegenerationsInFlight.has(siteId);
}

/** Accès à la section Google Ads : démos et formules dotées de `googleAds`. */
export function hasGoogleAdsAccess(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasGoogleAds(site.plan);
}

/** Le fournisseur mock ne sert que les démos (jamais de données factices sur un site client). */
export function adsProviderAllowed(mode: AdsDataProvider["mode"], siteType: Site["type"]): boolean {
  return mode === "dataforseo" || siteType === "demo";
}

/**
 * Téléphone affiché par le site : `phone` de la section « contact » de la
 * page d'accueil (même lecture que `apps/sites/app/[site]/layout.tsx`, section
 * masquée comprise : le numéro reste dans l'en-tête et le pied de page).
 */
export function phoneFromSections(sections: PageSections | null | undefined): string | null {
  const contact = sections?.find((s) => s.type === "contact");
  const phone = contact?.type === "contact" ? contact.phone?.trim() : undefined;
  return phone || null;
}

type MotifPageRow = { slug: string; title: string; sections: PageSections; position: number };

/**
 * Pages de spécialité en ligne, même règle que le site public
 * (`getMotifPages`) : ordre de `position`, pages désactivées ou sans section
 * retirées, et pour un site client au plus le nombre permis par la formule.
 */
export function onlineMotifPages<T extends MotifPageRow>(rows: T[], site: Pick<Site, "type" | "plan" | "theme">): T[] {
  const disabled = new Set(site.theme.disabledMotifs ?? []);
  const enabled = [...rows].sort((a, b) => a.position - b.position).filter((p) => !disabled.has(p.slug) && p.sections.length > 0);
  return site.type === "demo" ? enabled : enabled.slice(0, motifPagesAllowance(site.plan));
}

/** Pages d'atterrissage possibles : accueil puis spécialités. */
export function landingPagesFrom(motifs: { slug: string; title: string }[]): GoogleAdsLandingPage[] {
  return [
    { path: "/", title: "Accueil", kind: "home" },
    ...motifs.map((m): GoogleAdsLandingPage => ({ path: `/${m.slug}`, title: m.title, kind: "motif" })),
  ];
}

/**
 * Fiche reliée (comme `linkedProfileOf` du studio : identifiant factice
 * ignoré dès qu'un fournisseur réel existe) et dernier audit : note et avis
 * de l'instantané, sinon de la fiche praticien ; horaires, photos et score
 * de l'audit. Tout est inconnu (null) sans fiche reliée.
 */
export function profileFrom(
  prospect: Pick<Prospect, "googlePlaceId" | "googleRating" | "googleReviewCount"> | null,
  audit: Pick<GoogleProfileAudit, "snapshot" | "audit"> | null,
  realProviders: boolean,
): GoogleAdsDiagnosticInput["profile"] {
  const placeId = prospect?.googlePlaceId ?? null;
  const linked = placeId !== null && !(realProviders && isMockPlaceId(placeId));
  if (!linked) return { linked: false, claimed: null, rating: null, votes: null, hasHours: null, photos: null, auditScore: null };
  const snapshot = audit?.snapshot ?? null;
  return {
    linked: true,
    claimed: snapshot?.isClaimed ?? null,
    rating: snapshot?.rating ?? prospect?.googleRating ?? null,
    votes: snapshot?.votes ?? prospect?.googleReviewCount ?? null,
    hasHours: snapshot?.hasHours ?? null,
    photos: snapshot?.totalPhotos ?? null,
    auditScore: audit?.audit.score ?? null,
  };
}

/** Entrée du diagnostic déterministe à partir du contexte et des résultats de l'analyse. */
export function diagnosticInputFrom(
  ctx: GoogleAdsContextData,
  keywords: GoogleAdsKeywordSet | null,
  forecast: GoogleAdsForecast | null,
): GoogleAdsDiagnosticInput {
  return {
    profession: ctx.profession,
    city: ctx.city,
    hasBookingUrl: Boolean(ctx.bookingUrl),
    hasPhone: Boolean(ctx.phone),
    hasAdsTag: Boolean(ctx.tracking.googleAdsId),
    hasConversionLabels: ctx.tracking.hasConversionLabels,
    motifPages: ctx.motifPages,
    profile: ctx.profile,
    benchmark: ctx.benchmark,
    keywords,
    forecast,
  };
}

/** Correspondance la plus fréquente (égalité : ordre de GOOGLE_ADS_MATCH_TYPES, « phrase » par défaut). */
export function dominantMatch(keywords: Pick<GoogleAdsKeyword, "match">[]): GoogleAdsMatchType {
  const counts = new Map<GoogleAdsMatchType, number>();
  for (const k of keywords) counts.set(k.match, (counts.get(k.match) ?? 0) + 1);
  let best: GoogleAdsMatchType = "phrase";
  let bestCount = 0;
  for (const match of GOOGLE_ADS_MATCH_TYPES) {
    const count = counts.get(match) ?? 0;
    if (count > bestCount) {
      best = match;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Mots-clés envoyés à la prévision : le cœur de cible (sinon tous les mots-clés
 * retenus), textes dédoublonnés, ≤ 1000 ; un seul type de correspondance par
 * appel : le plus fréquent parmi eux.
 */
export function forecastTargets(set: GoogleAdsKeywordSet): { keywords: string[]; match: GoogleAdsMatchType } {
  const core = set.keywords.filter((k) => k.core);
  const pool = core.length > 0 ? core : set.keywords;
  return { keywords: [...new Set(pool.map((k) => k.keyword))].slice(0, FORECAST_KEYWORDS_MAX), match: dominantMatch(pool) };
}

/** Coût à inscrire après un appel en échec : celui que le fournisseur connaît, 0 en mock, sinon l'estimation par prudence. */
export function adsCostOnError(err: unknown, estimated: number, mode: AdsDataProvider["mode"]): number {
  if (err instanceof DataForSeoError) return err.costUsd;
  return mode === "mock" ? 0 : estimated;
}

/**
 * Instructions du praticien nettoyées (≤ GOOGLE_ADS_INSTRUCTIONS_MAX), sans
 * balise ni chevron (« <b>le soir</b> » → « le soir » : elles sont stockées,
 * réaffichées et reprises dans les conseils du plan), undefined si vides.
 */
export function cleanAdsInstructions(text: string | null | undefined): string | undefined {
  const clean = cleanSocialInstructions(text)
    .replace(/<\/?[a-zA-Z][^<>\n]{0,120}>/g, " ")
    .replace(/[<>]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
    .slice(0, GOOGLE_ADS_INSTRUCTIONS_MAX)
    .trim();
  return clean === "" ? undefined : clean;
}

/** Compteurs du mois (lignes `google_usage` par kind) → usage et restes. */
export function adsUsageFromCounts(counts: { kind: string; total: number }[]): GoogleAdsUsage {
  const of = (kind: string) => counts.filter((c) => c.kind === kind).reduce((sum, c) => sum + Number(c.total), 0);
  const analysesUsed = of("ads_keywords");
  const planRegenUsed = of("ads_plan");
  return {
    analysesUsed,
    analysesRemaining: Math.max(0, GOOGLE_ADS_ANALYSES_PER_MONTH - analysesUsed),
    planRegenUsed,
    planRegenRemaining: Math.max(0, GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH - planRegenUsed),
  };
}

/** Décision de lancement ; `staleIds` : analyses `running` périmées à passer en erreur, quelle que soit la décision. */
export type AdsStartDecision = { kind: "busy" | "quota" | "budget" | "ok"; staleIds: string[] };

/**
 * Décision de lancement sous verrou : verrou refusé ou analyse `running`
 * récente → busy ; quota mensuel atteint → quota ; budget restant insuffisant
 * pour le coût estimé → budget. Les analyses `running` périmées (dernière
 * mise à jour `updatedAt` plus vieille que GOOGLE_ADS_ANALYSIS_STALE_MINUTES)
 * sont listées dans `staleIds` dès que le verrou est acquis, même si le quota
 * ou le budget refusent : l'appelant les clôt avant de rendre la décision.
 */
export function decideAdsStart(input: {
  locked: boolean;
  running: { id: string; updatedAt: Date }[];
  analysesUsed: number;
  budgetRemainingUsd: number;
  now: Date;
  estimatedCostUsd?: number;
}): AdsStartDecision {
  if (!input.locked) return { kind: "busy", staleIds: [] };
  const stale = input.running.filter((a) => input.now.getTime() - a.updatedAt.getTime() > GOOGLE_ADS_ANALYSIS_STALE_MINUTES * 60_000);
  const staleIds = stale.map((a) => a.id);
  if (input.running.length > stale.length) return { kind: "busy", staleIds };
  if (input.analysesUsed >= GOOGLE_ADS_ANALYSES_PER_MONTH) return { kind: "quota", staleIds };
  if (input.budgetRemainingUsd < (input.estimatedCostUsd ?? GOOGLE_ADS_ANALYSIS_COST_USD)) return { kind: "budget", staleIds };
  return { kind: "ok", staleIds };
}

// ─── Lectures ────────────────────────────────────────────────────────────────

async function adsUsageCounts(db: DbExecutor, siteId: string, now: Date): Promise<{ kind: string; total: number }[]> {
  return db
    .select({ kind: googleUsage.kind, total: sql<number>`count(*)`.mapWith(Number) })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), inArray(googleUsage.kind, [...ADS_USAGE_KINDS])))
    .groupBy(googleUsage.kind);
}

/** Analyses (`ads_keywords`) et régénérations du plan (`ads_plan`) du mois, et restes. */
export async function getGoogleAdsUsage(db: DbExecutor, siteId: string, now = new Date()): Promise<GoogleAdsUsage> {
  return adsUsageFromCounts(await adsUsageCounts(db, siteId, now));
}

/**
 * Contexte Google Ads d'un site : métier et ville du prospect (sinon le nom
 * du site), spécialités = titres des pages de spécialité en ligne, lien de
 * réservation, téléphone affiché, suivi (AW-… et libellés de conversion),
 * fiche reliée + dernier audit, benchmark du dernier relevé terminé,
 * mots-clés suivis actifs, pages d'atterrissage. Lève si le site n'existe pas.
 */
export async function loadGoogleAdsContext(db: Database, siteId: string, env: NodeJS.ProcessEnv = process.env): Promise<GoogleAdsContext> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site introuvable : ${siteId}`);
  const [prospect, sitePages, audit, scan, keywords] = await Promise.all([
    site.prospectId ? db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) }) : Promise.resolve(undefined),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, siteId), inArray(pages.type, ["home", "motif"])),
      columns: { type: true, slug: true, title: true, sections: true, position: true },
    }),
    db.query.googleProfileAudits.findFirst({
      where: eq(googleProfileAudits.siteId, siteId),
      orderBy: [desc(googleProfileAudits.createdAt)],
      columns: { snapshot: true, audit: true },
    }),
    db.query.googleRankScans.findFirst({
      where: and(eq(googleRankScans.siteId, siteId), eq(googleRankScans.status, "done")),
      orderBy: [desc(googleRankScans.scannedAt)],
      columns: { competitors: true },
    }),
    db.query.googleKeywords.findMany({
      where: and(eq(googleKeywords.siteId, siteId), eq(googleKeywords.active, true)),
      orderBy: [asc(googleKeywords.position)],
      columns: { keyword: true },
    }),
  ]);
  const home = sitePages.find((p) => p.type === "home");
  const motifs = onlineMotifPages(sitePages.filter((p) => p.type === "motif"), site);
  const competitors = scan?.competitors ?? [];
  const bench = competitors.length > 0 ? benchmarkFrom(competitors) : null;
  const tracking = site.theme.tracking;
  return {
    site,
    prospect: prospect ?? null,
    profession: prospect?.profession.trim() || resolveProfession(site.name).practitionerLabel.feminin,
    city: prospect?.city.trim() ?? "",
    specialties: motifs.map((m) => m.title),
    bookingUrl: site.bookingUrl,
    phone: phoneFromSections(home?.sections),
    tracking: {
      googleAdsId: tracking?.googleAdsId?.trim() || null,
      hasConversionLabels: hasConversionLabels(tracking?.googleAdsConversions),
    },
    profile: profileFrom(prospect ?? null, audit ?? null, hasRealGoogleProvider(env)),
    benchmark: bench ? { medianRating: bench.medianRating, medianVotes: bench.medianVotes } : null,
    trackedKeywords: keywords.map((k) => k.keyword),
    landingPages: landingPagesFrom(motifs),
    motifPages: motifs.length,
  };
}

// ─── Analyse complète ────────────────────────────────────────────────────────

type AdsStart = AdsStartDecision | { kind: "started"; analysisId: string; usageId: string };

/**
 * Analyse Google Ads d'un site : accès → transaction courte sous verrou
 * `<siteId>:google-ads` (quota `ads_keywords` du mois, budget mensuel, ligne
 * `google_ads_analyses` running + ligne `google_usage` au coût estimé) → hors
 * transaction : idées de mots-clés → `selectAdsKeywords` (mots-clés suivis
 * conservés) → `suggestBidUsd` → prévision sur le cœur (échec toléré) →
 * `diagnoseGoogleAds` → plan IA (`createGoogleAdsPlanner`, brief du site) →
 * ligne `done` avec le coût réel. Toute erreur → ligne `error`, coût réel
 * conservé dans `google_usage`.
 */
export async function runGoogleAdsAnalysis(
  db: Database,
  siteId: string,
  opts: { instructions?: string; now?: Date; env?: NodeJS.ProcessEnv } = {},
): Promise<AdsAnalysisOutcome> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  let ctx: GoogleAdsContext;
  try {
    ctx = await loadGoogleAdsContext(db, siteId, env);
  } catch (err) {
    console.error(`[google-ads] contexte du site ${siteId} indisponible :`, err);
    return { status: "error", analysisId: null, message: adsErrorMessage(err) };
  }
  const { site } = ctx;
  if (!hasGoogleAdsAccess(site)) return { status: "skipped", reason: "no_access" };
  const provider = createAdsDataProvider(env);
  if (!adsProviderAllowed(provider.mode, site.type)) return { status: "skipped", reason: "no_provider" };
  const seed = buildAdsSeeds({ profession: ctx.profession, city: ctx.city, specialties: ctx.specialties });
  if (seed.keywords.length === 0) {
    return { status: "error", analysisId: null, message: ADS_ERROR_MESSAGES.noSeed };
  }
  const instructions = cleanAdsInstructions(opts.instructions);
  const planner = createGoogleAdsPlanner(env);

  // Transaction courte sous verrou consultatif : une seule analyse à la fois par site, quota et budget recomptés et réservés
  const started = await db.transaction(async (tx): Promise<AdsStart> => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`${siteId}:google-ads`})) as locked`);
    const running = await tx.query.googleAdsAnalyses.findMany({
      where: and(eq(googleAdsAnalyses.siteId, siteId), eq(googleAdsAnalyses.status, "running")),
      columns: { id: true, updatedAt: true },
    });
    const usage = await getGoogleAdsUsage(tx, siteId, now);
    const budget = await googleBudget(tx, site, now);
    const decision = decideAdsStart({
      locked: lock.rows[0]?.locked === true,
      running,
      analysesUsed: usage.analysesUsed,
      budgetRemainingUsd: budget.remainingUsd,
      now,
    });
    // Les analyses périmées sont closes dès le verrou acquis, même si quota ou budget refusent le lancement
    if (decision.staleIds.length > 0) {
      await tx
        .update(googleAdsAnalyses)
        .set({ status: "error", error: ADS_ERROR_MESSAGES.interrupted, updatedAt: now })
        .where(inArray(googleAdsAnalyses.id, decision.staleIds));
    }
    if (decision.kind !== "ok") return decision;
    const [analysis] = await tx
      .insert(googleAdsAnalyses)
      .values({
        siteId,
        status: "running",
        seed,
        provider: provider.mode,
        generator: planner.mode,
        instructions: instructions ?? null,
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: googleAdsAnalyses.id });
    const [usageRow] = await tx
      .insert(googleUsage)
      .values({ siteId, month: usageMonthKey(now), kind: "ads_keywords", costUsd: GOOGLE_ADS_ANALYSIS_COST_USD, requests: 2 })
      .returning({ id: googleUsage.id });
    return { kind: "started", analysisId: analysis!.id, usageId: usageRow!.id };
  });
  if (started.kind === "busy") return { status: "skipped", reason: "busy" };
  if (started.kind === "quota") return { status: "skipped", reason: "quota" };
  if (started.kind === "budget") return { status: "skipped", reason: "budget" };
  if (started.kind !== "started") return { status: "error", analysisId: null, message: "Lancement impossible" };
  const { analysisId, usageId } = started;

  let spentUsd = 0;
  let requests = 0;
  /** Coût estimé de l'appel en cours (inscrit par prudence si le fournisseur ne connaît pas le coût réel d'un échec) */
  let pendingEstimate = 0;
  let keywordSet: GoogleAdsKeywordSet | null = null;
  let forecast: GoogleAdsForecast | null = null;
  let diagnostic: GoogleAdsDiagnostic | null = null;
  const settleUsage = () => db.update(googleUsage).set({ costUsd: round6(spentUsd), requests }).where(eq(googleUsage.id, usageId));

  try {
    // 1. Idées de mots-clés (un appel, ≤ 20 graines)
    requests = 1;
    pendingEstimate = DATAFORSEO_ADS_UNIT_COSTS.keywordIdeasLive;
    const ideas = await provider.keywordIdeas({ seeds: seed.keywords, locationCode: seed.locationCode, languageCode: seed.languageCode });
    spentUsd += ideas.costUsd;
    pendingEstimate = 0;
    keywordSet = selectAdsKeywords(ideas.data, seed, { source: provider.mode, fetchedAt: now, tracked: ctx.trackedKeywords });

    // 2. Prévision de trafic sur le cœur de cible (échec toléré : le diagnostic se fonde alors sur les CPC).
    //    L'endpoint attend une enchère entière : c'est l'entier réellement envoyé qui est stocké dans forecast.bidUsd.
    if (keywordSet.keywords.length > 0) {
      const targets = forecastTargets(keywordSet);
      const bidUsd = adsBidForRequest(suggestBidUsd(keywordSet.keywords));
      requests = 2;
      pendingEstimate = DATAFORSEO_ADS_UNIT_COSTS.adTrafficLive;
      try {
        const traffic = await provider.adTraffic({
          keywords: targets.keywords,
          bidUsd,
          match: targets.match,
          locationCode: seed.locationCode,
          languageCode: seed.languageCode,
        });
        spentUsd += traffic.costUsd;
        forecast = summarizeForecast(traffic.data, { source: provider.mode, fetchedAt: now, bidUsd, match: targets.match, locationCode: seed.locationCode });
      } catch (err) {
        spentUsd += adsCostOnError(err, DATAFORSEO_ADS_UNIT_COSTS.adTrafficLive, provider.mode);
        console.warn(`[google-ads] prévision indisponible pour ${site.slug} :`, err);
      }
      pendingEstimate = 0;
    }
    // Coût réel inscrit dès les appels terminés (le plan IA ne coûte rien ici)
    await settleUsage();

    // 3. Diagnostic déterministe puis plan d'action IA (échec toléré : l'analyse reste `done`, plan null, à relancer)
    diagnostic = diagnoseGoogleAds(diagnosticInputFrom(ctx, keywordSet, forecast), now);
    let plan: GoogleAdsPlan | null = null;
    let planError: unknown = null;
    try {
      const { brief } = await loadGoogleBrief(db, siteId, now);
      const planInput: GoogleAdsPlanInput = {
        diagnostic,
        keywords: keywordSet,
        forecast,
        landingPages: ctx.landingPages,
        trackedKeywords: ctx.trackedKeywords,
        ...(instructions ? { instructions } : {}),
      };
      plan = await planner.plan(brief, planInput);
    } catch (err) {
      planError = err;
      console.error(`[google-ads] analyse ${analysisId} (${site.slug}) : plan d'action non généré :`, err);
    }
    const completion = adsAnalysisCompletion(plan, planError);

    await db
      .update(googleAdsAnalyses)
      .set({
        status: completion.status,
        keywords: keywordSet,
        forecast,
        diagnostic,
        plan: completion.plan,
        provider: provider.mode,
        generator: planner.mode,
        costUsd: round6(spentUsd),
        instructions: instructions ?? null,
        error: completion.error,
        updatedAt: new Date(),
      })
      .where(eq(googleAdsAnalyses.id, analysisId));
    console.info(
      `[google-ads] analyse ${analysisId} (${site.slug}) : ${keywordSet.keywords.length} mots-clés sur ${keywordSet.rawCount} idées, ${forecast ? `${forecast.totalClicks} clics prévus` : "sans prévision"}, verdict ${diagnostic.verdict}, ${completion.plan ? "plan généré" : "plan à relancer"}, coût ${round6(spentUsd)} $`,
    );
    return { status: "done", analysisId, costUsd: round6(spentUsd), ...(completion.error ? { planError: completion.error } : {}) };
  } catch (err) {
    const message = adsErrorMessage(err, "provider");
    spentUsd += adsCostOnError(err, pendingEstimate, provider.mode);
    console.error(`[google-ads] analyse ${analysisId} (${site.slug}) en échec :`, err);
    try {
      await settleUsage();
      await db
        .update(googleAdsAnalyses)
        .set({ status: "error", error: message, keywords: keywordSet, forecast, diagnostic, costUsd: round6(spentUsd), updatedAt: new Date() })
        .where(eq(googleAdsAnalyses.id, analysisId));
    } catch (dbErr) {
      console.error(`[google-ads] analyse ${analysisId} : état d'erreur non enregistré :`, errorMessage(dbErr));
    }
    return { status: "error", analysisId, message };
  }
}

// ─── Régénération du plan ────────────────────────────────────────────────────

/**
 * Nouveau plan d'action (avec instructions) sur la dernière analyse `done`
 * du site ayant mots-clés et bilan — plan existant ou non (une analyse dont
 * seul le plan IA a échoué est ainsi réparée, et son `error` effacé) :
 * marqueur « régénération en cours » par site dans ce processus (second clic
 * refusé sans appel IA), verrou `<siteId>:google-ads-plan`, quota
 * GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH vérifié avant l'appel IA puis
 * recompté dans la transaction qui inscrit `google_usage` kind `ads_plan`
 * (coût 0) et enregistre le plan.
 */
export async function regenerateGoogleAdsPlan(
  db: Database,
  siteId: string,
  opts: { instructions?: string; now?: Date; env?: NodeJS.ProcessEnv },
): Promise<AdsPlanOutcome> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return { status: "error", message: "Site introuvable" };
  if (!hasGoogleAdsAccess(site)) return { status: "skipped", reason: "no_access" };
  if (!beginAdsPlanRegeneration(siteId)) return { status: "skipped", reason: "busy" };
  try {
    const analysis = await db.query.googleAdsAnalyses.findFirst({
      where: and(
        eq(googleAdsAnalyses.siteId, siteId),
        eq(googleAdsAnalyses.status, "done"),
        isNotNull(googleAdsAnalyses.keywords),
        isNotNull(googleAdsAnalyses.diagnostic),
      ),
      orderBy: [desc(googleAdsAnalyses.createdAt)],
    });
    if (!analysis || !analysis.keywords || !analysis.diagnostic) return { status: "skipped", reason: "no_analysis" };
    const { keywords, diagnostic, forecast } = analysis;

    // Transaction courte : verrou consultatif (génération déjà lancée ailleurs ?) et quota (message immédiat)
    const initial = await db.transaction(async (tx) => {
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`${siteId}:google-ads-plan`})) as locked`);
      if (lock.rows[0]?.locked !== true) return null;
      return getGoogleAdsUsage(tx, siteId, now);
    });
    if (initial === null) return { status: "skipped", reason: "busy" };
    if (initial.planRegenRemaining <= 0) return { status: "skipped", reason: "quota" };

    try {
      const instructions = cleanAdsInstructions(opts.instructions);
      const [ctx, { brief }] = await Promise.all([loadGoogleAdsContext(db, siteId, env), loadGoogleBrief(db, siteId, now)]);
      const planner = createGoogleAdsPlanner(env);
      const plan = await planner.plan(brief, {
        diagnostic,
        keywords,
        forecast,
        landingPages: ctx.landingPages,
        trackedKeywords: ctx.trackedKeywords,
        ...(instructions ? { instructions } : {}),
      });
      // Transaction courte sous verrou par site : quota recompté, génération inscrite et plan enregistré ensemble
      const used = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:google-ads-plan`}))`);
        const usage = await getGoogleAdsUsage(tx, siteId, now);
        if (usage.planRegenRemaining <= 0) return null;
        await tx.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind: "ads_plan", costUsd: 0, requests: 1 });
        await tx
          .update(googleAdsAnalyses)
          .set({ plan, generator: planner.mode, instructions: instructions ?? null, error: null, updatedAt: new Date() })
          .where(eq(googleAdsAnalyses.id, analysis.id));
        return usage.planRegenUsed;
      });
      if (used === null) return { status: "skipped", reason: "quota" };
      console.info(`[google-ads] plan régénéré pour ${site.slug} (analyse ${analysis.id}, ${planner.mode})`);
      return { status: "done", analysisId: analysis.id, remaining: Math.max(0, GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH - used - 1) };
    } catch (err) {
      console.error(`[google-ads] régénération du plan impossible pour ${site.slug} :`, err);
      return { status: "error", message: adsErrorMessage(err, "plan") };
    }
  } finally {
    endAdsPlanRegeneration(siteId);
  }
}
