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
 *   périmées (> META_ADS_ANALYSIS_STALE_MINUTES sur `updatedAt`) sont closes
 *   avant le quota et leur usage `meta_analysis` est remboursé (ligne
 *   `google_usage` du site, même `kind`, `created_at` à ± 5 s de celui de
 *   l'analyse, supprimée) ; pendant l'analyse, `updatedAt` bat après la
 *   veille et entre chaque génération ; la ligne ne passe en `done` que si
 *   elle est encore `running` (sinon elle a été close pour péremption :
 *   journal, rien d'écrit) ;
 * - jamais de données simulées sur un site client : le mock ne sert que les
 *   démos ; un client avec jeton interroge la vraie bibliothèque même sous
 *   META_ADS_MOCK ; sans fournisseur, la veille est indisponible
 *   (`provider: "none"`) et l'analyse continue (diagnostic, créas, plans) ;
 * - l'échec de la veille est toléré : `provider` garde le mode du
 *   fournisseur (`meta` | `mock`), `market: null` seulement si AUCUN terme
 *   n'a abouti (un terme en échec laisse une veille partielle,
 *   `truncated: true`) et le message utilisateur va dans `error` ; l'échec
 *   d'une génération laisse l'analyse `done` avec le champ manquant à null et
 *   un message dans `error` : `regenerateMetaAds` complète ; dans `error`,
 *   le message de génération (à relancer) prime sur celui de la veille ;
 * - messages rendus et colonne `error` en français pour le praticien
 *   (`metaErrorMessage`), détail technique dans les journaux `[meta-ads]` ;
 * - la régénération (kind `meta_regen`, coût 0) est inscrite dans la même
 *   transaction que la mise à jour, sous verrou `<siteId>:meta-ads-regen`,
 *   avec un marqueur en mémoire par site contre un second clic simultané ;
 *   refusée (`busy`) tant qu'une analyse `running` non périmée existe ou si
 *   l'analyse visée n'est plus la dernière `done` du site au moment d'écrire
 *   (quota non consommé) ; le diagnostic est recalculé avec le contexte
 *   courant (Pixel, bandeau, liens) sur la veille conservée ; `assets` est
 *   remis à vide — les chemins Blob des rendus sont déterministes et écrasés
 *   en place, `removedRenderUrls` est donc toujours vide.
 */

import { and, between, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
import { MetaAdLibraryError, createAdLibraryProvider, isMetaTokenError, type AdLibraryProvider, type AdLibrarySearchResult, type MockLocality } from "@theralys/providers/meta";
import { landingPagesFrom, onlineMotifPages, phoneFromSections } from "./google-ads";
import { loadGoogleBrief } from "./google-brief";
import { hasRealGoogleProvider, type DbExecutor } from "./google-profile";

/** Analyse `running` plus ancienne : le processus est mort, la ligne passe en erreur. */
export const META_ADS_ANALYSIS_STALE_MINUTES = 15;
/** Pages suivies par terme (`maxPages` de `searchAds`). */
export const META_MARKET_PAGES_PER_TERM = 2;
/** Tolérance entre `created_at` d'une analyse périmée et celui de son usage `meta_analysis` à rembourser (ms). */
export const META_USAGE_REFUND_TOLERANCE_MS = 5_000;
const ERROR_MESSAGE_MAX = 300;
const META_USAGE_KINDS = ["meta_analysis", "meta_regen"] as const;

/** Messages destinés au praticien (colonne `error`, retours des services) ; le détail technique part dans les journaux. */
export const META_ERROR_MESSAGES = {
  token: "Le jeton Meta est invalide ou expiré : contactez Harmony.",
  transient: "La bibliothèque Meta n'a pas répondu, réessayez dans quelques minutes.",
  marketRefused: "La bibliothèque Meta a refusé la requête : contactez Harmony.",
  /** Veille absente d'une analyse dont le fournisseur existait (message de veille perdu derrière un message de génération) */
  marketMissing: "La veille de la bibliothèque Meta n'a pas abouti : relancez une analyse pour l'obtenir.",
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
      /**
       * Toujours vide : les chemins Blob des rendus sont déterministes
       * (analyse, créa, format) et écrasés en place au prochain rendu ;
       * `assets` est remis à vide, rien n'est à supprimer. Conservé pour la
       * compatibilité du studio.
       */
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

/** Partie du contexte nécessaire à l'exécution (testable sans base) ; `photosById` renseigne `photoUrl` des créas quand il est fourni. */
export type MetaAdsContextData = Pick<MetaAdsContext, "seed" | "landingPages" | "diagnosticInput" | "brief"> & Partial<Pick<MetaAdsContext, "photosById">>;

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
  return text === META_ERROR_MESSAGES.token || text === META_ERROR_MESSAGES.transient || text === META_ERROR_MESSAGES.marketRefused || text === META_ERROR_MESSAGES.marketMissing;
}

/** Accès à la section Meta Ads : démos et formules dotées de `metaAds`. */
export function hasMetaAdsAccess(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasMetaAds(site.plan);
}

/**
 * Fournisseur de la veille : mock réservé aux démos (jamais de données
 * simulées sur un site client) ; pour un site client, le fournisseur réel
 * dès qu'un jeton existe, même sous META_ADS_MOCK ; client sans jeton → null
 * (veille indisponible). `opts` (localité, `now`) paramètre le mock.
 */
export function marketProviderFor(env: NodeJS.ProcessEnv, siteType: Site["type"], opts: { now?: Date; locality?: MockLocality } = {}): AdLibraryProvider | null {
  if (siteType !== "demo") {
    const token = env.META_AD_LIBRARY_TOKEN?.trim();
    return token ? createAdLibraryProvider({ ...env, META_ADS_MOCK: "" }, opts) : null;
  }
  return createAdLibraryProvider(env, opts);
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

/** Entrée du diagnostic déterministe : contexte + lecture de la veille (zone, comptes, signaux forts par zone, annonces). */
export function metaDiagnosticInputFrom(input: Omit<MetaAdsDiagnosticInput, "market">, market: MetaAdsMarket | null): MetaAdsDiagnosticInput {
  return { ...input, market: market ? { scopeUsed: market.scopeUsed, counts: market.counts, ...(market.strongCounts ? { strongCounts: market.strongCounts } : {}), ads: market.ads } : null };
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

/** Analyse `running` telle que lue pour décider d'un lancement. */
export type MetaRunningRow = { id: string; updatedAt: Date; createdAt?: Date | null };

/** Analyse `running` périmée : `updatedAt` plus vieux que META_ADS_ANALYSIS_STALE_MINUTES (le processus est mort). */
export function isMetaAnalysisStale(row: Pick<MetaRunningRow, "updatedAt">, now: Date): boolean {
  return now.getTime() - row.updatedAt.getTime() > META_ADS_ANALYSIS_STALE_MINUTES * 60_000;
}

/** Une analyse `running` encore vivante existe (une autre génération est en cours). */
export function hasFreshMetaRunning(running: readonly Pick<MetaRunningRow, "updatedAt">[], now: Date): boolean {
  return running.some((row) => !isMetaAnalysisStale(row, now));
}

/**
 * Décision de lancement ; `staleIds` : analyses `running` périmées à passer
 * en erreur, quelle que soit la décision ; `stale` : les mêmes avec leur
 * `createdAt`, pour rembourser l'usage inscrit avec elles.
 */
export type MetaStartDecision = { kind: "busy" | "quota" | "ok"; staleIds: string[]; stale: { id: string; createdAt: Date | null }[] };

/**
 * Décision de lancement sous verrou : verrou refusé ou analyse `running`
 * récente → busy ; quota mensuel atteint → quota. Les analyses `running`
 * périmées (`updatedAt` plus vieux que META_ADS_ANALYSIS_STALE_MINUTES) sont
 * listées dans `staleIds` / `stale` dès que le verrou est acquis, même si le
 * quota refuse : l'appelant les clôt (et rembourse leur usage) avant de
 * rendre la décision.
 */
export function decideMetaStart(input: { locked: boolean; running: MetaRunningRow[]; analysesUsed: number; now: Date }): MetaStartDecision {
  if (!input.locked) return { kind: "busy", staleIds: [], stale: [] };
  const staleRows = input.running.filter((a) => isMetaAnalysisStale(a, input.now));
  const staleIds = staleRows.map((a) => a.id);
  const stale = staleRows.map((a) => ({ id: a.id, createdAt: a.createdAt ?? null }));
  if (input.running.length > staleRows.length) return { kind: "busy", staleIds, stale };
  if (input.analysesUsed >= META_ADS_ANALYSES_PER_MONTH) return { kind: "quota", staleIds, stale };
  return { kind: "ok", staleIds, stale };
}

/**
 * Fenêtre de `created_at` dans laquelle retrouver l'usage `meta_analysis`
 * inscrit avec une analyse (même transaction, même `now`) : ± tolérance
 * autour du `createdAt` de l'analyse.
 */
export function usageRefundWindow(createdAt: Date, toleranceMs = META_USAGE_REFUND_TOLERANCE_MS): { from: Date; to: Date } {
  return { from: new Date(createdAt.getTime() - toleranceMs), to: new Date(createdAt.getTime() + toleranceMs) };
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
  /** Termes effectivement interrogés (recherche aboutie) */
  terms: string[];
  calls: number;
  /** Budget épuisé avant la fin, pages non suivies, ou terme(s) en échec */
  truncated: boolean;
  /** Première erreur rencontrée sur un terme (la veille est partielle), null si tout a abouti */
  error: unknown;
  /** Termes dont la recherche a échoué ou a été abandonnée après une erreur bloquante */
  failedTerms: string[];
};

/**
 * Erreur de la bibliothèque qui condamne les termes suivants : code Graph
 * connu (jeton 190, limites de débit 4 / 17 / 32 / 613, paramètre 100…).
 * Un incident sans code (réseau, 5xx, délai, réponse illisible) n'empêche
 * pas d'essayer le terme suivant.
 */
export function isMetaMarketBlocking(err: unknown): boolean {
  return err instanceof MetaAdLibraryError && err.code !== null;
}

/**
 * Veille : un `searchAds` par terme, séquentiel, `maxPages` borné par le
 * budget restant ; arrêt dès que le budget d'appels est consommé.
 * `progress.calls` est mis à jour après chaque appel pour que l'appelant
 * connaisse les appels effectués même si une recherche échoue. Un terme en
 * échec n'efface pas la veille : les annonces déjà obtenues sont gardées,
 * `truncated` passe à true et l'erreur est rendue dans `error` ; après une
 * erreur bloquante (`isMetaMarketBlocking`), les termes restants sont
 * abandonnés. Lève seulement si AUCUNE recherche n'a abouti.
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
  const failedTerms: string[] = [];
  let truncated = false;
  let error: unknown = null;
  const queries = seed.searchTerms.slice(0, META_LIBRARY_TERMS_MAX);
  for (const [index, term] of queries.entries()) {
    const remaining = budget - progress.calls;
    if (remaining <= 0) {
      truncated = index < queries.length;
      break;
    }
    let result: AdLibrarySearchResult;
    try {
      result = await provider.searchAds({ term, country: seed.country, activeStatus: "ALL", limit: META_LIBRARY_PAGE_LIMIT, maxPages: Math.min(pagesPerTerm, remaining) });
    } catch (err) {
      error ??= err;
      truncated = true;
      if (isMetaMarketBlocking(err)) {
        failedTerms.push(...queries.slice(index));
        break;
      }
      failedTerms.push(term);
      continue;
    }
    progress.calls += result.calls;
    terms.push(term);
    if (result.truncated) truncated = true;
    for (const ad of result.ads) {
      records.push(ad);
      const matched = (matchedTerms[ad.id] ??= []);
      if (!matched.includes(term)) matched.push(term);
    }
  }
  if (error !== null && terms.length === 0) throw error;
  return { records, matchedTerms, terms, calls: progress.calls, truncated, error, failedTerms };
}

/** Veille enregistrée : annonces classées par zone (`selectMarketAds`), comptes et signaux forts par zone, sans synthèse. */
export function buildMetaMarket(
  collection: Pick<MarketCollection, "records" | "matchedTerms" | "terms" | "calls" | "truncated">,
  seed: Pick<MetaAdsSeed, "city" | "department" | "region" | "country">,
  source: "meta" | "mock",
  now: Date,
): MetaAdsMarket {
  const { ads, scopeUsed, counts, strongCounts } = selectMarketAds(collection.records, seed, now, { matchedTerms: collection.matchedTerms });
  return {
    version: 1,
    source,
    fetchedAt: now.toISOString(),
    country: seed.country,
    terms: collection.terms,
    scopeUsed,
    counts,
    strongCounts,
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

/** URL Blob des rendus d'une analyse (lecture seule : les chemins sont déterministes et écrasés en place, rien n'est à supprimer). */
export function renderUrlsOf(assets: SocialPostAssets | null | undefined): string[] {
  return Object.values(assets?.renders ?? {})
    .map((r) => r.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
}

/** Message de la colonne `error` en fin d'analyse : la génération (à relancer) prime sur la veille. */
export function metaAnalysisError(result: Pick<MetaAnalysisResult, "marketError" | "generationError">): string | null {
  return result.generationError ?? result.marketError ?? null;
}

/**
 * Message de la colonne `error` après une régénération : le message de
 * génération s'il y en a un, sinon le message de veille conservé, sinon —
 * veille absente alors qu'un fournisseur existait (son message a été écrasé
 * par celui d'une génération) — un message de veille recalculé ; null quand
 * la veille est présente ou qu'aucun fournisseur n'existait.
 */
export function metaRegenerationError(analysis: Pick<MetaAdsAnalysis, "market" | "provider" | "error">, generationError: string | null = null): string | null {
  if (generationError) return generationError;
  if (isMetaMarketMessage(analysis.error)) return analysis.error ?? null;
  if (analysis.market === null && analysis.provider !== "none") return META_ERROR_MESSAGES.marketMissing;
  return null;
}

/** `photoUrl` de chaque créa résolu depuis `photosById` (id → URL) ; null sans photo ou photo inconnue. */
export function withCreativePhotoUrls(set: MetaAdsCreativeSet, photosById: Readonly<Record<string, string>>): MetaAdsCreativeSet {
  return { ...set, creatives: set.creatives.map((c) => ({ ...c, photoUrl: c.photoId ? (photosById[c.photoId] ?? null) : null })) };
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

export type MetaGenerationOptions = {
  /** Battement enregistré entre chaque génération (`updatedAt` de l'analyse) ; ses erreurs sont ignorées */
  heartbeat?: () => Promise<void>;
  /** id photo → URL : renseigne `photoUrl` des créas (jamais transmis au modèle) */
  photosById?: Readonly<Record<string, string>>;
};

/**
 * Trois générations tolérantes à l'échec : créas, plan vidéo, puis plan de
 * campagne (qui reçoit ce qui a abouti). Chaque échec est journalisé ; le
 * premier est rendu dans `error`. Un battement (`opts.heartbeat`) est
 * enregistré entre les générations ; `opts.photosById` renseigne `photoUrl`.
 */
export async function generateMetaAds(planner: MetaAdsPlanner, brief: SocialSiteBrief, input: MetaAdsGenerationInput, label: string, opts: MetaGenerationOptions = {}): Promise<MetaGeneration> {
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
  const beat = async () => {
    if (!opts.heartbeat) return;
    try {
      await opts.heartbeat();
    } catch (err) {
      console.warn(`[meta-ads] ${label} : battement non enregistré :`, errorMessage(err));
    }
  };
  creatives = await attempt("créas", () => planner.createCreatives(brief, input));
  if (creatives && opts.photosById) creatives = withCreativePhotoUrls(creatives, opts.photosById);
  await beat();
  videoPlan = await attempt("plan vidéo", () => planner.createVideoPlan(brief, input));
  await beat();
  plan = await attempt("plan de campagne", () => planner.createPlan(brief, { ...input, creatives, videoPlan }));
  return { creatives, videoPlan, plan, error };
}

export type MetaAnalysisResult = {
  market: MetaAdsMarket | null;
  /** Mode du fournisseur (`none` seulement sans fournisseur : une veille en échec garde `meta` ou `mock`) */
  providerMode: "meta" | "mock" | "none";
  /** Message utilisateur quand la veille a échoué, en tout (`market` null) ou en partie (`market.truncated`) */
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
 * null seulement si aucun terme n'a abouti, `provider` = mode du
 * fournisseur, message utilisateur), synthèse IA sur l'échantillon (échec
 * toléré : `insights: null`), diagnostic déterministe, puis créas, plan vidéo
 * et plan (échecs tolérés). Ne lève pas, sauf erreur de programmation ;
 * `progress.calls` suit les appels même en cas d'échec ; `deps.heartbeat`
 * est appelé après la veille et entre les générations.
 */
export async function executeMetaAnalysis(
  ctx: MetaAdsContextData,
  deps: { provider: AdLibraryProvider | null; planner: MetaAdsPlanner; instructions?: string; now: Date; label?: string; progress?: { calls: number }; heartbeat?: () => Promise<void> },
): Promise<MetaAnalysisResult> {
  const { provider, planner, now } = deps;
  const label = deps.label ?? "analyse";
  const progress = deps.progress ?? { calls: 0 };
  let market: MetaAdsMarket | null = null;
  const providerMode: MetaAnalysisResult["providerMode"] = provider?.mode ?? "none";
  let marketError: string | null = null;

  if (provider) {
    try {
      const collection = await collectMarketAds(provider, ctx.seed, { progress });
      if (collection.error !== null) {
        marketError = metaErrorMessage(collection.error, "market");
        console.error(`[meta-ads] ${label} : veille partielle (termes en échec : ${collection.failedTerms.join(", ")}) après ${progress.calls} appel(s) :`, collection.error);
      }
      market = buildMetaMarket(collection, ctx.seed, provider.mode, now);
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
      marketError = metaErrorMessage(err, "market");
      console.error(`[meta-ads] ${label} : veille indisponible (${providerMode}) après ${progress.calls} appel(s) :`, err);
    }
    if (deps.heartbeat) {
      try {
        await deps.heartbeat();
      } catch (err) {
        console.warn(`[meta-ads] ${label} : battement non enregistré :`, errorMessage(err));
      }
    }
  }

  const diagnostic = diagnoseMetaAds(metaDiagnosticInputFrom(ctx.diagnosticInput, market), now);
  const input: MetaAdsGenerationInput = {
    diagnostic,
    market,
    landingPages: ctx.landingPages,
    ...(deps.instructions ? { instructions: deps.instructions } : {}),
  };
  const generated = await generateMetaAds(planner, ctx.brief, input, label, {
    ...(deps.heartbeat ? { heartbeat: deps.heartbeat } : {}),
    ...(ctx.photosById ? { photosById: ctx.photosById } : {}),
  });
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
 * `<siteId>:meta-ads` (analyses périmées closes et leur usage remboursé,
 * quota `meta_analysis` du mois, ligne `meta_ads_analyses` running + ligne
 * `google_usage` au même `createdAt`) → hors transaction :
 * `executeMetaAnalysis` (veille, synthèse, diagnostic, créas, plan vidéo,
 * plan, avec un battement `updatedAt` entre les étapes) → ligne `done` avec
 * les appels réels (`calls`, et `requests` de l'usage), seulement si la
 * ligne est encore `running` (sinon close pour péremption : journal, rien
 * d'écrit, résultat `error` « interrompue »). Toute erreur inattendue → ligne
 * `error`.
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
      columns: { id: true, updatedAt: true, createdAt: true },
    });
    // Les analyses périmées sont closes dès le verrou acquis (et leur usage remboursé), même si le quota refuse le lancement
    const decision = decideMetaStart({ locked: lock.rows[0]?.locked === true, running, analysesUsed: 0, now });
    if (decision.staleIds.length > 0) {
      await tx
        .update(metaAdsAnalyses)
        .set({ status: "error", error: META_ERROR_MESSAGES.interrupted, updatedAt: now })
        .where(and(inArray(metaAdsAnalyses.id, decision.staleIds), eq(metaAdsAnalyses.status, "running")));
      for (const stale of decision.stale) {
        if (!stale.createdAt) continue;
        const { from, to } = usageRefundWindow(stale.createdAt);
        await tx.delete(googleUsage).where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.kind, "meta_analysis"), between(googleUsage.createdAt, from, to)));
      }
      console.info(`[meta-ads] ${siteId} : ${decision.staleIds.length} analyse(s) périmée(s) close(s), usage remboursé`);
    }
    if (decision.kind === "busy") return decision;
    // Quota recompté après le remboursement
    const usage = await getMetaAdsUsage(tx, siteId, now);
    if (usage.analysesUsed >= META_ADS_ANALYSES_PER_MONTH) return { ...decision, kind: "quota" };
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
    // Même `createdAt` que l'analyse : c'est la clé du remboursement (`usageRefundWindow`) si elle est close pour péremption
    const [usageRow] = await tx
      .insert(googleUsage)
      .values({ siteId, month: usageMonthKey(now), kind: "meta_analysis", costUsd: 0, requests: 0, createdAt: now })
      .returning({ id: googleUsage.id });
    return { kind: "started", analysisId: analysis!.id, usageId: usageRow!.id };
  });
  if (started.kind === "busy") return { status: "skipped", reason: "busy" };
  if (started.kind === "quota") return { status: "skipped", reason: "quota" };
  if (started.kind !== "started") return { status: "error", analysisId: null, message: "Lancement impossible" };
  const { analysisId, usageId } = started;

  const progress = { calls: 0 };
  const label = `analyse ${analysisId} (${site.slug})`;
  const settleUsage = (tx: DbExecutor) => tx.update(googleUsage).set({ requests: progress.calls }).where(eq(googleUsage.id, usageId));
  const stillRunning = and(eq(metaAdsAnalyses.id, analysisId), eq(metaAdsAnalyses.status, "running"));
  // Battement : `updatedAt` avance tant que l'analyse vit, pour qu'un autre lancement ne la croie pas périmée
  const heartbeat = async () => {
    await db.update(metaAdsAnalyses).set({ updatedAt: new Date() }).where(stillRunning);
  };

  try {
    const result = await executeMetaAnalysis(ctx, { provider, planner, ...(instructions ? { instructions } : {}), now, label, progress, heartbeat });
    const error = metaAnalysisError(result);
    // Transaction finale : appels réels inscrits et ligne close ensemble, seulement si elle est encore `running`
    const closed = await db.transaction(async (tx) => {
      await settleUsage(tx);
      const rows = await tx
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
        .where(stillRunning)
        .returning({ id: metaAdsAnalyses.id });
      return rows.length > 0;
    });
    if (!closed) {
      console.warn(`[meta-ads] ${label} : terminée après avoir été close pour péremption, résultat non enregistré`);
      return { status: "error", analysisId, message: META_ERROR_MESSAGES.interrupted };
    }
    console.info(
      `[meta-ads] ${label} : ${result.market ? `${result.market.ads.length} annonces (zone ${result.market.scopeUsed}, ${result.calls} appel(s), ${result.providerMode})` : `veille indisponible (${result.providerMode})`}, verdict ${result.diagnostic.verdict}, ${result.creatives ? `${result.creatives.creatives.length} créas` : "créas à relancer"}, ${result.videoPlan ? `${result.videoPlan.videos.length} vidéos` : "plan vidéo à relancer"}, ${result.plan ? "plan généré" : "plan à relancer"}`,
    );
    return { status: "done", analysisId, marketAvailable: result.market !== null, ...(result.generationError ? { generationError: result.generationError } : {}) };
  } catch (err) {
    const message = metaErrorMessage(err);
    console.error(`[meta-ads] ${label} en échec :`, err);
    try {
      await settleUsage(db);
      await db
        .update(metaAdsAnalyses)
        .set({ status: "error", error: message, calls: progress.calls, updatedAt: new Date() })
        .where(stillRunning);
    } catch (dbErr) {
      console.error(`[meta-ads] ${label} : état d'erreur non enregistré :`, errorMessage(dbErr));
    }
    return { status: "error", analysisId, message };
  }
}

// ─── Régénération ────────────────────────────────────────────────────────────

/** Analyses `running` du site, telles que lues pour décider d'une régénération. */
async function runningMetaAnalyses(tx: DbExecutor, siteId: string): Promise<Pick<MetaRunningRow, "id" | "updatedAt">[]> {
  return tx.query.metaAdsAnalyses.findMany({
    where: and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "running")),
    columns: { id: true, updatedAt: true },
  });
}

/** Dernière analyse `done` du site ayant un diagnostic (celle que la régénération vise). */
async function latestDoneMetaAnalysis(tx: DbExecutor, siteId: string): Promise<MetaAdsAnalysis | undefined> {
  return tx.query.metaAdsAnalyses.findFirst({
    where: and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done"), isNotNull(metaAdsAnalyses.diagnostic)),
    orderBy: [desc(metaAdsAnalyses.createdAt)],
  });
}

/**
 * Nouvelles créas, nouveau plan vidéo et nouveau plan (avec instructions) sur
 * la dernière analyse `done` du site ayant un diagnostic — veille conservée,
 * diagnostic recalculé avec le contexte courant (Pixel enregistré depuis,
 * bandeau, liens, photos…) pour que le plan passe en conversions dès que le
 * Pixel est là, champs manquants complétés, `error` de génération effacé
 * (`metaRegenerationError` : un message décrivant la veille est gardé ou
 * recalculé) : marqueur « régénération en cours » par site dans ce processus,
 * verrou `<siteId>:meta-ads-regen`, `busy` tant qu'une analyse `running` non
 * périmée existe, quota META_ADS_REGENERATIONS_PER_MONTH vérifié avant les
 * appels IA puis recompté dans la transaction qui inscrit `google_usage` kind
 * `meta_regen` (coût 0) et enregistre le résultat — après avoir vérifié que
 * l'analyse visée est toujours la dernière `done` du site (sinon `busy`, quota
 * non consommé) ; `assets` remis à vide, `removedRenderUrls` toujours vide
 * (chemins Blob déterministes, écrasés en place au prochain rendu).
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
    const analysis = await latestDoneMetaAnalysis(db, siteId);
    if (!analysis || !analysis.diagnostic) return { status: "skipped", reason: "no_analysis" };
    const { market } = analysis;

    // Transaction courte : verrou consultatif (génération déjà lancée ailleurs ?), analyse en cours (busy) et quota (message immédiat)
    const initial = await db.transaction(async (tx) => {
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`${siteId}:meta-ads-regen`})) as locked`);
      if (lock.rows[0]?.locked !== true) return null;
      if (hasFreshMetaRunning(await runningMetaAnalyses(tx, siteId), now)) return null;
      return getMetaAdsUsage(tx, siteId, now);
    });
    if (initial === null) return { status: "skipped", reason: "busy" };
    if (initial.regenRemaining <= 0) return { status: "skipped", reason: "quota" };

    try {
      const instructions = cleanMetaInstructions(opts.instructions);
      const ctx = await loadMetaAdsContext(db, siteId, env);
      const planner = createMetaAdsPlanner(env);
      const label = `régénération ${analysis.id} (${site.slug})`;
      // Diagnostic recalculé sur le contexte courant, veille conservée : un Pixel posé depuis l'analyse fait passer le plan en conversions
      const diagnostic = diagnoseMetaAds(metaDiagnosticInputFrom(ctx.diagnosticInput, market), now);
      const generated = await generateMetaAds(planner, ctx.brief, { diagnostic, market, landingPages: ctx.landingPages, ...(instructions ? { instructions } : {}) }, label, {
        photosById: ctx.photosById,
      });
      if (!generated.creatives || !generated.videoPlan || !generated.plan) throw generated.error ?? new Error("génération incomplète");
      // Transaction courte sous verrou par site : analyse toujours la dernière `done` et aucune analyse en cours, quota recompté,
      // génération inscrite et résultat enregistré ensemble
      const written = await db.transaction(async (tx): Promise<number | "busy" | "quota"> => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:meta-ads-regen`}))`);
        const latest = await latestDoneMetaAnalysis(tx, siteId);
        if (latest?.id !== analysis.id) return "busy";
        if (hasFreshMetaRunning(await runningMetaAnalyses(tx, siteId), now)) return "busy";
        const usage = await getMetaAdsUsage(tx, siteId, now);
        if (usage.regenRemaining <= 0) return "quota";
        await tx.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind: "meta_regen", costUsd: 0, requests: 1 });
        await tx
          .update(metaAdsAnalyses)
          .set({
            diagnostic,
            creatives: generated.creatives,
            videoPlan: generated.videoPlan,
            plan: generated.plan,
            assets: { ...EMPTY_SOCIAL_ASSETS, renders: {} },
            generator: planner.mode,
            instructions: instructions ?? null,
            error: metaRegenerationError(analysis),
            updatedAt: new Date(),
          })
          .where(eq(metaAdsAnalyses.id, analysis.id));
        return usage.regenUsed;
      });
      if (written === "busy") {
        console.info(`[meta-ads] ${label} : analyse remplacée ou relancée pendant la génération, résultat non enregistré`);
        return { status: "skipped", reason: "busy" };
      }
      if (written === "quota") return { status: "skipped", reason: "quota" };
      console.info(`[meta-ads] ${label} : créas, plan vidéo et plan régénérés (${planner.mode}), diagnostic recalculé (${diagnostic.verdict})`);
      return { status: "done", analysisId: analysis.id, remaining: Math.max(0, META_ADS_REGENERATIONS_PER_MONTH - written - 1), removedRenderUrls: [] };
    } catch (err) {
      console.error(`[meta-ads] régénération impossible pour ${site.slug} :`, err);
      return { status: "error", message: metaErrorMessage(err, "generation") };
    }
  } finally {
    endMetaRegeneration(siteId);
  }
}
