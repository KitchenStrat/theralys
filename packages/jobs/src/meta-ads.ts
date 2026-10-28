/**
 * Meta Ads (studio) — services de données partagés entre le studio (server
 * actions) et les scripts : contexte du site (graine métier / ville /
 * département / termes, pages d'atterrissage, entrée du diagnostic, brief et
 * photos), analyse complète (veille de la bibliothèque publicitaire Meta →
 * sélection par zone → synthèse IA → diagnostic déterministe → créas, plan
 * vidéo et plan de campagne), régénération avec instructions, quotas mensuels.
 *
 * Règles (même esprit que `google-ads.ts`) :
 * - quota recompté sous verrou consultatif `<siteId>:meta-ads` dans la
 *   transaction courte qui insère la ligne `meta_ads_analyses` (`running`) et
 *   la ligne `google_usage` kind `meta_analysis` (coût 0, `requests` = appels
 *   à la bibliothèque, mis à jour après la veille) ; les analyses `running`
 *   périmées (> META_ADS_ANALYSIS_STALE_MINUTES) sont closes avant le quota ;
 * - jamais de données simulées sur un site client : le mock ne sert que les
 *   démos ; sans jeton, la veille est indisponible (`provider: "none"`) et
 *   l'analyse continue (diagnostic, créas, plans) ;
 * - l'échec de la veille est toléré (`market: null`, `provider: "none"`,
 *   message utilisateur dans `error`) ; l'échec d'une génération laisse
 *   l'analyse `done` avec le champ manquant à null et un message dans
 *   `error` : `regenerateMetaAds` complète ;
 * - messages rendus et colonne `error` en français pour le praticien
 *   (`metaErrorMessage`), détail technique dans les journaux `[meta-ads]` ;
 * - la régénération (kind `meta_regen`, coût 0) est inscrite dans la même
 *   transaction que la mise à jour, sous verrou `<siteId>:meta-ads-regen`,
 *   avec un marqueur en mémoire par site contre un second clic simultané ;
 *   `assets` est remis à vide (les rendus Blob précédents sont rendus dans
 *   `removedRenderUrls` pour que le studio les supprime).
 */

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  EMPTY_SOCIAL_ASSETS,
  META_ADS_ANALYSES_PER_MONTH,
  META_ADS_INSTRUCTIONS_MAX,
  META_ADS_REGENERATIONS_PER_MONTH,
  META_LIBRARY_MAX_CALLS,
  META_LIBRARY_PAGE_LIMIT,
  META_LIBRARY_TERMS_MAX,
  META_MARKET_SAMPLE_FOR_AI,
  buildMetaSeed,
  cleanSocialInstructions,
  diagnoseMetaAds,
  isMockPlaceId,
  selectMarketAds,
  usageMonthKey,
  type MetaAdRecord,
  type MetaAdsCreativeSet,
  type MetaAdsDiagnostic,
  type MetaAdsDiagnosticInput,
  type MetaAdsGenerationInput,
  type MetaAdsLandingPage,
  type MetaAdsMarket,
  type MetaAdsPlan,
  type MetaAdsSeed,
  type MetaAdsVideoPlan,
  type MetaMarketInsights,
  type PageSections,
  type SocialPostAssets,
  type SocialSiteBrief,
} from "@theralys/shared";
import {
  googleProfileAudits,
  googleRankScans,
  googleUsage,
  hasMetaAds,
  metaAdsAnalyses,
  pages,
  prospects,
  sites,
  type Database,
  type GoogleProfileAudit,
  type MetaAdsAnalysis,
  type Prospect,
  type Site,
} from "@theralys/db";
import { createMetaAdsPlanner, resolveProfession, type MetaAdsPlanner } from "@theralys/ai";
import { MetaAdLibraryError, createAdLibraryProvider, isMetaTokenError, type AdLibraryProvider, type MockLocality } from "@theralys/providers/meta";
import { landingPagesFrom, onlineMotifPages, phoneFromSections } from "./google-ads";
import { loadGoogleBrief } from "./google-brief";
import { hasRealGoogleProvider, type DbExecutor } from "./google-profile";

/** Analyse `running` plus ancienne : le processus est mort, la ligne passe en erreur. */
export const META_ADS_ANALYSIS_STALE_MINUTES = 15;
/** Pages suivies par terme (`maxPages` de `searchAds`). */
export const META_MARKET_PAGES_PER_TERM = 2;
const ERROR_MESSAGE_MAX = 300;
const META_USAGE_KINDS = ["meta_analysis", "meta_regen"] as const;

/** Messages destinés au praticien (colonne `error`, retours des services) ; le détail technique part dans les journaux. */
export const META_ERROR_MESSAGES = {
  token: "Le jeton Meta est invalide ou expiré : contactez Harmony.",
  transient: "La bibliothèque Meta n'a pas répondu, réessayez dans quelques minutes.",
  marketRefused: "La bibliothèque Meta a refusé la requête : contactez Harmony.",
  generation: "Les annonces n'ont pas pu être générées : relancez la génération.",
  interrupted: "Analyse interrompue avant la fin — relancez-la.",
  unknown: "L'analyse a échoué : réessayez dans un instant.",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type MetaAnalysisOutcome =
  | {
      status: "done";
      analysisId: string;
      /** Veille enregistrée (fournisseur disponible et appels aboutis) */
      marketAvailable: boolean;
      /** Présent quand créas, plan vidéo ou plan manquent (message utilisateur, aussi dans `error`) */
      generationError?: string;
    }
  | { status: "skipped"; reason: "no_access" | "quota" | "busy" }
  | { status: "error"; analysisId: string | null; message: string };

export type MetaRegenOutcome =
  | {
      status: "done";
      analysisId: string;
      remaining: number;
      /** URL Blob des rendus précédents, à supprimer par le studio (`assets` remis à vide) */
      removedRenderUrls?: string[];
    }
  | { status: "skipped"; reason: "no_access" | "quota" | "busy" | "no_analysis" }
  | { status: "error"; message: string };

export type MetaAdsUsage = {
  analysesUsed: number;
  analysesRemaining: number;
  regenUsed: number;
  regenRemaining: number;
};

export type MetaAdsContext = {
  site: Site;
  prospect: Prospect | null;
  seed: MetaAdsSeed;
  /** Accueil « / » puis spécialités « /<slug> » */
  landingPages: MetaAdsLandingPage[];
  /** Entrée du diagnostic sans la veille (ajoutée après les appels) */
  diagnosticInput: Omit<MetaAdsDiagnosticInput, "market">;
  /** id photo → URL (jamais transmis au modèle) */
  photosById: Record<string, string>;
  /** Brief du site transmis au planificateur (même brief que les posts sociaux) */
  brief: SocialSiteBrief;
};

/** Partie du contexte nécessaire à l'exécution (testable sans base). */
export type MetaAdsContextData = Pick<MetaAdsContext, "seed" | "landingPages" | "diagnosticInput" | "brief">;

// ─── Logique pure (testée sans base) ─────────────────────────────────────────

/** Message technique borné, pour les journaux seulement. */
function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").trim().slice(0, ERROR_MESSAGE_MAX) || "erreur inconnue";
}

/** Erreur du planificateur (zod, Anthropic, garde-fous de `completeStructured`) reconnue sans indication d'étape. */
function looksLikeGenerationError(name: string, message: string): boolean {
  if (name === "ZodError" || /^(?:API|Anthropic|RateLimit|Authentication|Permission|NotFound|BadRequest|InternalServer|Overloaded|UnprocessableEntity)/.test(name)) return true;
  return /garde-fous du modèle|Réponse tronquée|marketing éthique|Échec de génération|Planificateur Meta Ads|anthropic|JSON/i.test(message);
}

function looksTransient(name: string, message: string): boolean {
  return name === "AbortError" || /délai dépassé|timed? ?out|réseau|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|annulé| 5\d\d\b|\b429\b/i.test(message);
}

/**
 * Message en français destiné au praticien ; le détail technique (URL,
 * code Graph, erreur zod ou Anthropic en anglais) n'est jamais montré,
 * seulement journalisé par l'appelant. Jeton invalide ou expiré (code 190)
 * → contacter Harmony ; erreur transitoire (limites, 429, 5xx, délai, réseau)
 * → réessayer ; autre refus de la bibliothèque → contacter Harmony ;
 * génération → relancer la génération. `stage` fixe la catégorie quand
 * l'appelant connaît l'étape.
 */
export function metaErrorMessage(err: unknown, stage?: "market" | "generation"): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const name = err instanceof Error ? err.name : "";
  if (isMetaTokenError(err)) return META_ERROR_MESSAGES.token;
  if (err instanceof MetaAdLibraryError) return err.transient ? META_ERROR_MESSAGES.transient : META_ERROR_MESSAGES.marketRefused;
  if (stage === "generation") return META_ERROR_MESSAGES.generation;
  if (stage === "market") return looksTransient(name, message) ? META_ERROR_MESSAGES.transient : META_ERROR_MESSAGES.marketRefused;
  if (looksLikeGenerationError(name, message)) return META_ERROR_MESSAGES.generation;
  if (looksTransient(name, message)) return META_ERROR_MESSAGES.transient;
  return META_ERROR_MESSAGES.unknown;
}

/** Message de la colonne `error` qui décrit la veille (conservé par la régénération, qui ne touche pas à la veille). */
export function isMetaMarketMessage(text: string | null | undefined): boolean {
  return text === META_ERROR_MESSAGES.token || text === META_ERROR_MESSAGES.transient || text === META_ERROR_MESSAGES.marketRefused;
}

/** Accès à la section Meta Ads : démos et formules dotées de `metaAds`. */
export function hasMetaAdsAccess(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasMetaAds(site.plan);
}

/**
 * Fournisseur de la veille : mock réservé aux démos (jamais de données
 * simulées sur un site client) ; client sans jeton → null (veille
 * indisponible). `opts` (localité, `now`) paramètre le mock.
 */
export function marketProviderFor(env: NodeJS.ProcessEnv, siteType: Site["type"], opts: { now?: Date; locality?: MockLocality } = {}): AdLibraryProvider | null {
  const provider = createAdLibraryProvider(env, opts);
  if (!provider) return null;
  if (provider.mode === "mock" && siteType !== "demo") return null;
  return provider;
}

/** Localité du mock d'après la graine (ville, département, région). */
export function localityOf(seed: Pick<MetaAdsSeed, "city" | "department" | "region">): MockLocality {
  return { city: seed.city, department: seed.department?.name ?? null, region: seed.region };
}

/** Adresse affichée par le site : `address` de la section « contact » de l'accueil (masquée comprise). */
export function addressFromSections(sections: PageSections | null | undefined): string | null {
  const contact = sections?.find((s) => s.type === "contact");
  const address = contact?.type === "contact" ? contact.address?.replace(/\s+/g, " ").trim() : undefined;
  return address || null;
}

/**
 * Fiche reliée (comme `linkedProfileOf` du studio : identifiant factice
 * ignoré dès qu'un fournisseur réel existe) ; note et avis de l'instantané du
 * dernier audit, sinon de la fiche praticien. Tout est inconnu sans fiche.
 */
export function metaProfileFrom(
  prospect: Pick<Prospect, "googlePlaceId" | "googleRating" | "googleReviewCount"> | null,
  audit: Pick<GoogleProfileAudit, "snapshot"> | null,
  realProviders: boolean,
): MetaAdsDiagnosticInput["profile"] {
  const placeId = prospect?.googlePlaceId ?? null;
  const linked = placeId !== null && !(realProviders && isMockPlaceId(placeId));
  if (!linked) return { linked: false, rating: null, votes: null };
  const snapshot = audit?.snapshot ?? null;
  return { linked: true, rating: snapshot?.rating ?? prospect?.googleRating ?? null, votes: snapshot?.votes ?? prospect?.googleReviewCount ?? null };
}

/** Entrée du diagnostic déterministe : contexte + lecture de la veille (zone, comptes, annonces). */
export function metaDiagnosticInputFrom(input: Omit<MetaAdsDiagnosticInput, "market">, market: MetaAdsMarket | null): MetaAdsDiagnosticInput {
  return { ...input, market: market ? { scopeUsed: market.scopeUsed, counts: market.counts, ads: market.ads } : null };
}

/**
 * Instructions du praticien nettoyées (≤ META_ADS_INSTRUCTIONS_MAX), sans
 * balise ni chevron, undefined si vides.
 */
export function cleanMetaInstructions(text: string | null | undefined): string | undefined {
  const clean = cleanSocialInstructions(text)
    .replace(/<\/?[a-zA-Z][^<>\n]{0,120}>/g, " ")
    .replace(/[<>]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
    .slice(0, META_ADS_INSTRUCTIONS_MAX)
    .trim();
  return clean === "" ? undefined : clean;
}

/** Compteurs du mois (lignes `google_usage` par kind) → usage et restes. */
export function usageFromCounts(counts: { kind: string; total: number }[]): MetaAdsUsage {
  const of = (kind: string) => counts.filter((c) => c.kind === kind).reduce((sum, c) => sum + Number(c.total), 0);
  const analysesUsed = of("meta_analysis");
  const regenUsed = of("meta_regen");
  return {
    analysesUsed,
    analysesRemaining: Math.max(0, META_ADS_ANALYSES_PER_MONTH - analysesUsed),
    regenUsed,
    regenRemaining: Math.max(0, META_ADS_REGENERATIONS_PER_MONTH - regenUsed),
  };
}

/** Décision de lancement ; `staleIds` : analyses `running` périmées à passer en erreur, quelle que soit la décision. */
export type MetaStartDecision = { kind: "busy" | "quota" | "ok"; staleIds: string[] };

/**
 * Décision de lancement sous verrou : verrou refusé ou analyse `running`
 * récente → busy ; quota mensuel atteint → quota. Les analyses `running`
 * périmées (`updatedAt` plus vieux que META_ADS_ANALYSIS_STALE_MINUTES) sont
 * listées dans `staleIds` dès que le verrou est acquis, même si le quota
 * refuse : l'appelant les clôt avant de rendre la décision.
 */
export function decideMetaStart(input: { locked: boolean; running: { id: string; updatedAt: Date }[]; analysesUsed: number; now: Date }): MetaStartDecision {
  if (!input.locked) return { kind: "busy", staleIds: [] };
  const stale = input.running.filter((a) => input.now.getTime() - a.updatedAt.getTime() > META_ADS_ANALYSIS_STALE_MINUTES * 60_000);
  const staleIds = stale.map((a) => a.id);
  if (input.running.length > stale.length) return { kind: "busy", staleIds };
  if (input.analysesUsed >= META_ADS_ANALYSES_PER_MONTH) return { kind: "quota", staleIds };
  return { kind: "ok", staleIds };
}

/**
 * Plan des recherches : chaque terme (≤ META_LIBRARY_TERMS_MAX) reçoit au plus
 * `pagesPerTerm` pages tant que le budget d'appels (`META_LIBRARY_MAX_CALLS`)
 * le permet ; les termes suivants sont abandonnés une fois le budget réservé.
 */
export function marketQueryPlan(terms: string[], budget = META_LIBRARY_MAX_CALLS, pagesPerTerm = META_MARKET_PAGES_PER_TERM): { term: string; maxPages: number }[] {
  const plan: { term: string; maxPages: number }[] = [];
  let reserved = 0;
  for (const term of terms.slice(0, META_LIBRARY_TERMS_MAX)) {
    const remaining = budget - reserved;
    if (remaining <= 0) break;
    const maxPages = Math.min(pagesPerTerm, remaining);
    plan.push({ term, maxPages });
    reserved += maxPages;
  }
  return plan;
}

export type MarketCollection = {
  records: MetaAdRecord[];
  /** id d'annonce → termes qui l'ont remontée */
  matchedTerms: Record<string, string[]>;
  /** Termes effectivement interrogés */
  terms: string[];
  calls: number;
  /** Budget épuisé avant la fin, ou pages non suivies */
  truncated: boolean;
};

/**
 * Veille : un `searchAds` par terme, séquentiel, `maxPages` borné par le
 * budget restant ; arrêt dès que le budget d'appels est consommé.
 * `progress.calls` est mis à jour après chaque appel pour que l'appelant
 * connaisse les appels effectués même si une recherche échoue.
 */
export async function collectMarketAds(
  provider: AdLibraryProvider,
  seed: Pick<MetaAdsSeed, "searchTerms" | "country">,
  opts: { budget?: number; pagesPerTerm?: number; progress?: { calls: number } } = {},
): Promise<MarketCollection> {
  const budget = opts.budget ?? META_LIBRARY_MAX_CALLS;
  const pagesPerTerm = opts.pagesPerTerm ?? META_MARKET_PAGES_PER_TERM;
  const progress = opts.progress ?? { calls: 0 };
  const records: MetaAdRecord[] = [];
  const matchedTerms: Record<string, string[]> = {};
  const terms: string[] = [];
  let truncated = false;
  const queries = seed.searchTerms.slice(0, META_LIBRARY_TERMS_MAX);
  for (const [index, term] of queries.entries()) {
    const remaining = budget - progress.calls;
    if (remaining <= 0) {
      truncated = index < queries.length;
      break;
    }
    const result = await provider.searchAds({ term, country: seed.country, activeStatus: "ALL", limit: META_LIBRARY_PAGE_LIMIT, maxPages: Math.min(pagesPerTerm, remaining) });
    progress.calls += result.calls;
    terms.push(term);
    if (result.truncated) truncated = true;
    for (const ad of result.ads) {
      records.push(ad);
      const matched = (matchedTerms[ad.id] ??= []);
      if (!matched.includes(term)) matched.push(term);
    }
  }
  return { records, matchedTerms, terms, calls: progress.calls, truncated };
}

/** Veille enregistrée : annonces classées par zone (`selectMarketAds`), sans synthèse. */
export function buildMetaMarket(collection: MarketCollection, seed: Pick<MetaAdsSeed, "city" | "department" | "region" | "country">, source: "meta" | "mock", now: Date): MetaAdsMarket {
  const { ads, scopeUsed, counts } = selectMarketAds(collection.records, seed, now, { matchedTerms: collection.matchedTerms });
  return {
    version: 1,
    source,
    fetchedAt: now.toISOString(),
    country: seed.country,
    terms: collection.terms,
    scopeUsed,
    counts,
    ads,
    calls: collection.calls,
    truncated: collection.truncated,
    insights: null,
  };
}

/** Veille transmise à l'IA : les META_MARKET_SAMPLE_FOR_AI annonces les mieux notées. */
export function marketSampleForAi(market: MetaAdsMarket, max = META_MARKET_SAMPLE_FOR_AI): MetaAdsMarket {
  const ads = [...market.ads].sort((a, b) => b.score - a.score || a.pageName.localeCompare(b.pageName, "fr")).slice(0, max);
  return { ...market, ads };
}

/** URL Blob des rendus d'une analyse (à supprimer quand `assets` est remis à vide). */
export function renderUrlsOf(assets: SocialPostAssets | null | undefined): string[] {
  return Object.values(assets?.renders ?? {})
    .map((r) => r.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
}

/** Message de la colonne `error` en fin d'analyse : la génération (à relancer) prime sur la veille. */
export function metaAnalysisError(result: Pick<MetaAnalysisResult, "marketError" | "generationError">): string | null {
  return result.generationError ?? result.marketError ?? null;
}

/** Régénérations en cours dans ce processus (par site) : second clic refusé sans appel IA, en plus du verrou consultatif en base. */
const regenerationsInFlight = new Set<string>();

/** Pose le marqueur « régénération en cours » du site ; false s'il est déjà posé (à libérer avec `endMetaRegeneration`). */
export function beginMetaRegeneration(siteId: string): boolean {
  if (regenerationsInFlight.has(siteId)) return false;
  regenerationsInFlight.add(siteId);
  return true;
}

export function endMetaRegeneration(siteId: string): void {
  regenerationsInFlight.delete(siteId);
}

export function isMetaRegenerationInFlight(siteId: string): boolean {
  return regenerationsInFlight.has(siteId);
}

// ─── Exécution (sans base) ───────────────────────────────────────────────────

export type MetaGeneration = {
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  /** Première erreur rencontrée (créas, plan vidéo ou plan) */
  error: unknown;
};

/**
 * Trois générations tolérantes à l'échec : créas, plan vidéo, puis plan de
 * campagne (qui reçoit ce qui a abouti). Chaque échec est journalisé ; le
 * premier est rendu dans `error`.
 */
export async function generateMetaAds(planner: MetaAdsPlanner, brief: SocialSiteBrief, input: MetaAdsGenerationInput, label: string): Promise<MetaGeneration> {
  let creatives: MetaAdsCreativeSet | null = null;
  let videoPlan: MetaAdsVideoPlan | null = null;
  let plan: MetaAdsPlan | null = null;
  let error: unknown = null;
  const attempt = async <T>(what: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      error ??= err;
      console.error(`[meta-ads] ${label} : ${what} non généré :`, err);
      return null;
    }
  };
  creatives = await attempt("créas", () => planner.createCreatives(brief, input));
  videoPlan = await attempt("plan vidéo", () => planner.createVideoPlan(brief, input));
  plan = await attempt("plan de campagne", () => planner.createPlan(brief, { ...input, creatives, videoPlan }));
  return { creatives, videoPlan, plan, error };
}

export type MetaAnalysisResult = {
  market: MetaAdsMarket | null;
  providerMode: "meta" | "mock" | "none";
  /** Message utilisateur quand la veille a échoué (fournisseur présent) */
  marketError: string | null;
  calls: number;
  diagnostic: MetaAdsDiagnostic;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  /** Message utilisateur quand une génération a échoué */
  generationError: string | null;
};

/**
 * Déroulé hors transaction : veille si fournisseur (échec toléré : market
 * null, `provider: "none"`, message utilisateur), synthèse IA sur
 * l'échantillon (échec toléré : `insights: null`), diagnostic déterministe,
 * puis créas, plan vidéo et plan (échecs tolérés). Ne lève pas, sauf erreur
 * de programmation ; `progress.calls` suit les appels même en cas d'échec.
 */
export async function executeMetaAnalysis(
  ctx: MetaAdsContextData,
  deps: { provider: AdLibraryProvider | null; planner: MetaAdsPlanner; instructions?: string; now: Date; label?: string; progress?: { calls: number } },
): Promise<MetaAnalysisResult> {
  const { provider, planner, now } = deps;
  const label = deps.label ?? "analyse";
  const progress = deps.progress ?? { calls: 0 };
  let market: MetaAdsMarket | null = null;
  let providerMode: MetaAnalysisResult["providerMode"] = "none";
  let marketError: string | null = null;

  if (provider) {
    try {
      const collection = await collectMarketAds(provider, ctx.seed, { progress });
      market = buildMetaMarket(collection, ctx.seed, provider.mode, now);
      providerMode = provider.mode;
      let insights: MetaMarketInsights | null = null;
      if (market.ads.length > 0) {
        try {
          insights = await planner.analyzeMarket(ctx.brief, marketSampleForAi(market));
        } catch (err) {
          console.error(`[meta-ads] ${label} : synthèse de la veille non générée :`, err);
        }
      }
      market = { ...market, insights };
    } catch (err) {
      market = null;
      providerMode = "none";
      marketError = metaErrorMessage(err, "market");
      console.error(`[meta-ads] ${label} : veille indisponible après ${progress.calls} appel(s) :`, err);
    }
  }

  const diagnostic = diagnoseMetaAds(metaDiagnosticInputFrom(ctx.diagnosticInput, market), now);
  const input: MetaAdsGenerationInput = {
    diagnostic,
    market,
    landingPages: ctx.landingPages,
    ...(deps.instructions ? { instructions: deps.instructions } : {}),
  };
  const generated = await generateMetaAds(planner, ctx.brief, input, label);
  return {
    market,
    providerMode,
    marketError,
    calls: progress.calls,
    diagnostic,
    creatives: generated.creatives,
    videoPlan: generated.videoPlan,
    plan: generated.plan,
    generationError: generated.error === null ? null : metaErrorMessage(generated.error, "generation"),
  };
}

// ─── Lectures ────────────────────────────────────────────────────────────────

async function usageCounts(db: DbExecutor, siteId: string, now: Date): Promise<{ kind: string; total: number }[]> {
  return db
    .select({ kind: googleUsage.kind, total: sql<number>`count(*)`.mapWith(Number) })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), inArray(googleUsage.kind, [...META_USAGE_KINDS])))
    .groupBy(googleUsage.kind);
}

/** Analyses (`meta_analysis`) et régénérations (`meta_regen`) du mois, et restes. */
export async function getMetaAdsUsage(db: DbExecutor, siteId: string, now = new Date()): Promise<MetaAdsUsage> {
  return usageFromCounts(await usageCounts(db, siteId, now));
}

/**
 * Contexte Meta Ads d'un site : métier et ville du prospect (sinon le nom du
 * site), adresse (`prospect.googleAddress`, sinon section Contact de
 * l'accueil), spécialités = titres des pages de spécialité en ligne,
 * concurrents = titres des `competitors` du dernier relevé terminé (≤ 6),
 * pages d'atterrissage, RDV / téléphone, Pixel et bandeau
 * (`site.theme.tracking`), Facebook / Instagram (`site.theme.social`),
 * photos et brief (`loadGoogleBrief`), fiche reliée + dernier audit. Lève si
 * le site n'existe pas.
 */
export async function loadMetaAdsContext(db: Database, siteId: string, env: NodeJS.ProcessEnv = process.env): Promise<MetaAdsContext> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site introuvable : ${siteId}`);
  const [prospect, sitePages, audit, scan, briefResult] = await Promise.all([
    site.prospectId ? db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) }) : Promise.resolve(undefined),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, siteId), inArray(pages.type, ["home", "motif"])),
      columns: { type: true, slug: true, title: true, sections: true, position: true },
    }),
    db.query.googleProfileAudits.findFirst({
      where: eq(googleProfileAudits.siteId, siteId),
      orderBy: [desc(googleProfileAudits.createdAt)],
      columns: { snapshot: true },
    }),
    db.query.googleRankScans.findFirst({
      where: and(eq(googleRankScans.siteId, siteId), eq(googleRankScans.status, "done")),
      orderBy: [desc(googleRankScans.scannedAt)],
      columns: { competitors: true },
    }),
    loadGoogleBrief(db, siteId),
  ]);
  const home = sitePages.find((p) => p.type === "home");
  const motifs = onlineMotifPages(sitePages.filter((p) => p.type === "motif"), site);
  const profession = prospect?.profession.trim() || resolveProfession(site.name).practitionerLabel.feminin;
  const city = prospect?.city.trim() ?? "";
  const address = prospect?.googleAddress?.trim() || addressFromSections(home?.sections);
  const competitorNames = (scan?.competitors ?? []).map((c) => c.title.trim()).filter(Boolean).slice(0, 6);
  const seed = buildMetaSeed({ profession, city, address, specialties: motifs.map((m) => m.title), competitorNames });
  const tracking = site.theme.tracking;
  const social = site.theme.social;
  return {
    site,
    prospect: prospect ?? null,
    seed,
    landingPages: landingPagesFrom(motifs).map((p): MetaAdsLandingPage => ({ path: p.path, title: p.title, kind: p.kind })),
    diagnosticInput: {
      profession,
      city,
      hasBookingUrl: Boolean(site.bookingUrl),
      hasPhone: Boolean(phoneFromSections(home?.sections)),
      hasPixel: Boolean(tracking?.metaPixelId?.trim()),
      cookieBanner: tracking?.cookieBanner !== false,
      photosCount: briefResult.brief.photos.length,
      facebookUrl: social?.facebook?.trim() || null,
      instagramUrl: social?.instagram?.trim() || null,
      motifPages: motifs.length,
      profile: metaProfileFrom(prospect ?? null, audit ?? null, hasRealGoogleProvider(env)),
    },
    photosById: briefResult.photosById,
    brief: briefResult.brief,
  };
}

// ─── Analyse complète ────────────────────────────────────────────────────────

type MetaStart = MetaStartDecision | { kind: "started"; analysisId: string; usageId: string };

/**
 * Analyse Meta Ads d'un site : accès → transaction courte sous verrou
 * `<siteId>:meta-ads` (analyses périmées closes, quota `meta_analysis` du
 * mois, ligne `meta_ads_analyses` running + ligne `google_usage`) → hors
 * transaction : `executeMetaAnalysis` (veille, synthèse, diagnostic, créas,
 * plan vidéo, plan) → ligne `done` avec les appels réels (`calls`, et
 * `requests` de l'usage). Toute erreur inattendue → ligne `error`.
 */
export async function runMetaAdsAnalysis(
  db: Database,
  siteId: string,
  opts: { instructions?: string; now?: Date; env?: NodeJS.ProcessEnv } = {},
): Promise<MetaAnalysisOutcome> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  let ctx: MetaAdsContext;
  try {
    ctx = await loadMetaAdsContext(db, siteId, env);
  } catch (err) {
    console.error(`[meta-ads] contexte du site ${siteId} indisponible :`, err);
    return { status: "error", analysisId: null, message: metaErrorMessage(err) };
  }
  const { site, seed } = ctx;
  if (!hasMetaAdsAccess(site)) return { status: "skipped", reason: "no_access" };
  const provider = marketProviderFor(env, site.type, { now, locality: localityOf(seed) });
  const planner = createMetaAdsPlanner(env);
  const instructions = cleanMetaInstructions(opts.instructions);

  // Transaction courte sous verrou consultatif : une seule analyse à la fois par site, quota recompté et réservé
  const started = await db.transaction(async (tx): Promise<MetaStart> => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`${siteId}:meta-ads`})) as locked`);
    const running = await tx.query.metaAdsAnalyses.findMany({
      where: and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "running")),
      columns: { id: true, updatedAt: true },
    });
    const usage = await getMetaAdsUsage(tx, siteId, now);
    const decision = decideMetaStart({ locked: lock.rows[0]?.locked === true, running, analysesUsed: usage.analysesUsed, now });
    // Les analyses périmées sont closes dès le verrou acquis, même si le quota refuse le lancement
    if (decision.staleIds.length > 0) {
      await tx
        .update(metaAdsAnalyses)
        .set({ status: "error", error: META_ERROR_MESSAGES.interrupted, updatedAt: now })
        .where(inArray(metaAdsAnalyses.id, decision.staleIds));
    }
    if (decision.kind !== "ok") return decision;
    const [analysis] = await tx
      .insert(metaAdsAnalyses)
      .values({
        siteId,
        status: "running",
        seed,
        provider: provider?.mode ?? "none",
        generator: planner.mode,
        instructions: instructions ?? null,
        calls: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: metaAdsAnalyses.id });
    const [usageRow] = await tx
      .insert(googleUsage)
      .values({ siteId, month: usageMonthKey(now), kind: "meta_analysis", costUsd: 0, requests: 0 })
      .returning({ id: googleUsage.id });
    return { kind: "started", analysisId: analysis!.id, usageId: usageRow!.id };
  });
  if (started.kind === "busy") return { status: "skipped", reason: "busy" };
  if (started.kind === "quota") return { status: "skipped", reason: "quota" };
  if (started.kind !== "started") return { status: "error", analysisId: null, message: "Lancement impossible" };
  const { analysisId, usageId } = started;

  const progress = { calls: 0 };
  const label = `analyse ${analysisId} (${site.slug})`;
  const settleUsage = () => db.update(googleUsage).set({ requests: progress.calls }).where(eq(googleUsage.id, usageId));

  try {
    const result = await executeMetaAnalysis(ctx, { provider, planner, ...(instructions ? { instructions } : {}), now, label, progress });
    await settleUsage();
    const error = metaAnalysisError(result);
    await db
      .update(metaAdsAnalyses)
      .set({
        status: "done",
        market: result.market,
        diagnostic: result.diagnostic,
        creatives: result.creatives,
        videoPlan: result.videoPlan,
        plan: result.plan,
        provider: result.providerMode,
        generator: planner.mode,
        calls: result.calls,
        instructions: instructions ?? null,
        error,
        updatedAt: new Date(),
      })
      .where(eq(metaAdsAnalyses.id, analysisId));
    console.info(
      `[meta-ads] ${label} : ${result.market ? `${result.market.ads.length} annonces (zone ${result.market.scopeUsed}, ${result.calls} appel(s), ${result.providerMode})` : `veille indisponible (${result.providerMode})`}, verdict ${result.diagnostic.verdict}, ${result.creatives ? `${result.creatives.creatives.length} créas` : "créas à relancer"}, ${result.videoPlan ? `${result.videoPlan.videos.length} vidéos` : "plan vidéo à relancer"}, ${result.plan ? "plan généré" : "plan à relancer"}`,
    );
    return { status: "done", analysisId, marketAvailable: result.market !== null, ...(result.generationError ? { generationError: result.generationError } : {}) };
  } catch (err) {
    const message = metaErrorMessage(err);
    console.error(`[meta-ads] ${label} en échec :`, err);
    try {
      await settleUsage();
      await db
        .update(metaAdsAnalyses)
        .set({ status: "error", error: message, calls: progress.calls, updatedAt: new Date() })
        .where(eq(metaAdsAnalyses.id, analysisId));
    } catch (dbErr) {
      console.error(`[meta-ads] ${label} : état d'erreur non enregistré :`, errorMessage(dbErr));
    }
    return { status: "error", analysisId, message };
  }
}

// ─── Régénération ────────────────────────────────────────────────────────────

/**
 * Nouvelles créas, nouveau plan vidéo et nouveau plan (avec instructions) sur
 * la dernière analyse `done` du site ayant un diagnostic — veille et
 * diagnostic conservés, champs manquants complétés, `error` de génération
 * effacé (un message décrivant la veille est gardé) : marqueur
 * « régénération en cours » par site dans ce processus, verrou
 * `<siteId>:meta-ads-regen`, quota META_ADS_REGENERATIONS_PER_MONTH vérifié
 * avant les appels IA puis recompté dans la transaction qui inscrit
 * `google_usage` kind `meta_regen` (coût 0) et enregistre le résultat ;
 * `assets` remis à vide (URL des rendus précédents rendues au studio).
 */
export async function regenerateMetaAds(
  db: Database,
  siteId: string,
  opts: { instructions?: string; now?: Date; env?: NodeJS.ProcessEnv },
): Promise<MetaRegenOutcome> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return { status: "error", message: "Site introuvable" };
  if (!hasMetaAdsAccess(site)) return { status: "skipped", reason: "no_access" };
  if (!beginMetaRegeneration(siteId)) return { status: "skipped", reason: "busy" };
  try {
    const analysis: MetaAdsAnalysis | undefined = await db.query.metaAdsAnalyses.findFirst({
      where: and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done"), isNotNull(metaAdsAnalyses.diagnostic)),
      orderBy: [desc(metaAdsAnalyses.createdAt)],
    });
    if (!analysis || !analysis.diagnostic) return { status: "skipped", reason: "no_analysis" };
    const { diagnostic, market } = analysis;

    // Transaction courte : verrou consultatif (génération déjà lancée ailleurs ?) et quota (message immédiat)
    const initial = await db.transaction(async (tx) => {
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`${siteId}:meta-ads-regen`})) as locked`);
      if (lock.rows[0]?.locked !== true) return null;
      return getMetaAdsUsage(tx, siteId, now);
    });
    if (initial === null) return { status: "skipped", reason: "busy" };
    if (initial.regenRemaining <= 0) return { status: "skipped", reason: "quota" };

    try {
      const instructions = cleanMetaInstructions(opts.instructions);
      const ctx = await loadMetaAdsContext(db, siteId, env);
      const planner = createMetaAdsPlanner(env);
      const label = `régénération ${analysis.id} (${site.slug})`;
      const generated = await generateMetaAds(planner, ctx.brief, { diagnostic, market, landingPages: ctx.landingPages, ...(instructions ? { instructions } : {}) }, label);
      if (!generated.creatives || !generated.videoPlan || !generated.plan) throw generated.error ?? new Error("génération incomplète");
      const removedRenderUrls = renderUrlsOf(analysis.assets);
      // Transaction courte sous verrou par site : quota recompté, génération inscrite et résultat enregistré ensemble
      const used = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:meta-ads-regen`}))`);
        const usage = await getMetaAdsUsage(tx, siteId, now);
        if (usage.regenRemaining <= 0) return null;
        await tx.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind: "meta_regen", costUsd: 0, requests: 1 });
        await tx
          .update(metaAdsAnalyses)
          .set({
            creatives: generated.creatives,
            videoPlan: generated.videoPlan,
            plan: generated.plan,
            assets: { ...EMPTY_SOCIAL_ASSETS, renders: {} },
            generator: planner.mode,
            instructions: instructions ?? null,
            error: analysis.market === null && isMetaMarketMessage(analysis.error) ? analysis.error : null,
            updatedAt: new Date(),
          })
          .where(eq(metaAdsAnalyses.id, analysis.id));
        return usage.regenUsed;
      });
      if (used === null) return { status: "skipped", reason: "quota" };
      console.info(`[meta-ads] ${label} : créas, plan vidéo et plan régénérés (${planner.mode})`);
      return { status: "done", analysisId: analysis.id, remaining: Math.max(0, META_ADS_REGENERATIONS_PER_MONTH - used - 1), removedRenderUrls };
    } catch (err) {
      console.error(`[meta-ads] régénération impossible pour ${site.slug} :`, err);
      return { status: "error", message: metaErrorMessage(err, "generation") };
    }
  } finally {
    endMetaRegeneration(siteId);
  }
}
