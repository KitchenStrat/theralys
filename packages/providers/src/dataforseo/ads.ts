/**
 * DataForSEO — Keywords Data « Google Ads » : idées de mots-clés (volume,
 * CPC, concurrence, enchères de haut de page, douze mois de saisonnalité) et
 * prévision de trafic (clics et coût du mois prochain pour une enchère et un
 * type de correspondance). Même socle que le fournisseur « recherche
 * locale » (`./client.ts` : auth Basic, délai, relance sur `/live`, coût =
 * somme des `tasks[].cost`) ; sans identifiants ou avec DATAFORSEO_MOCK=1,
 * le mock déterministe prend le relais (démos, tests, CI).
 *
 * Endpoints (une seule tâche par appel « live », 12 requêtes par minute par
 * compte : les appels sont séquentiels, jamais en parallèle) :
 * - POST /keywords_data/google_ads/keywords_for_keywords/live —
 *   { keywords (≤ 20), location_code, language_code, search_partners: false,
 *   sort_by: "search_volume" } → tasks[0].result[] items { keyword,
 *   search_volume, cpc (USD), competition LOW|MEDIUM|HIGH, competition_index
 *   0..100, low_top_of_page_bid, high_top_of_page_bid, monthly_searches[] }
 *   (valeurs null possibles, `keyword_annotations` ignoré). Le résultat peut
 *   compter des milliers d'items : tous sont conservés (la sélection revient
 *   à `selectAdsKeywords`), les items malformés sont écartés.
 * - POST /keywords_data/google_ads/ad_traffic_by_keywords/live — { keywords
 *   (≤ 1000), bid, match exact|phrase|broad, location_code, language_code,
 *   date_interval: "next_month" } → items { keyword, clicks, cost,
 *   average_cpc } (`impressions` et `ctr` toujours null).
 *
 * Coûts (USD) : ≈ 0,09 $ par appel « live » quel que soit le nombre de
 * mots-clés (DATAFORSEO_ADS_UNIT_COSTS). Une tâche refusée (statut ≠ 20000)
 * après facturation lève `DataForSeoError(message, costUsd)`.
 */

import {
  GOOGLE_ADS_MATCH_TYPES,
  normalizeAdsText,
  type GoogleAdsCompetition,
  type GoogleAdsForecastRow,
  type GoogleAdsKeywordData,
  type GoogleAdsMatchType,
} from "@theralys/shared";
import {
  DATAFORSEO_STATUS_OK,
  DataForSeoClient,
  DataForSeoError,
  hash31,
  numberOrNull,
  textOrNull,
  type DataForSeoClientOptions,
  type ProviderMode,
  type ProviderResult,
} from "./client";

// ─── Contrat ─────────────────────────────────────────────────────────────────

export type AdsKeywordIdeasInput = { seeds: string[]; locationCode: number; languageCode: string };

export type AdsTrafficInput = {
  keywords: string[];
  /** Enchère maximale (USD, unités de devise : 2.5 = 2,50 $) */
  bidUsd: number;
  match: GoogleAdsMatchType;
  locationCode: number;
  languageCode: string;
};

export interface AdsDataProvider {
  readonly mode: ProviderMode;
  /** POST /v3/keywords_data/google_ads/keywords_for_keywords/live — une tâche par appel, ≤ 20 graines, coût réel renvoyé */
  keywordIdeas(input: AdsKeywordIdeasInput): Promise<ProviderResult<GoogleAdsKeywordData[]>>;
  /** POST /v3/keywords_data/google_ads/ad_traffic_by_keywords/live — ≤ 1000 mots-clés, bid + match requis, date_interval next_month */
  adTraffic(input: AdsTrafficInput): Promise<ProviderResult<GoogleAdsForecastRow[]>>;
}

export const ADS_KEYWORD_IDEAS_ENDPOINT = "/keywords_data/google_ads/keywords_for_keywords/live";
export const ADS_TRAFFIC_ENDPOINT = "/keywords_data/google_ads/ad_traffic_by_keywords/live";
/** Graines par appel « keywords for keywords » (limite DataForSEO). */
export const ADS_SEEDS_PER_REQUEST = 20;
/** Mots-clés par appel « ad traffic by keywords » (limite DataForSEO). */
export const ADS_TRAFFIC_KEYWORDS_PER_REQUEST = 1000;
/** Longueur maximale d'un mot-clé accepté par Google Ads (caractères). */
const KEYWORD_MAX_LENGTH = 80;
/**
 * Bornes de l'enchère envoyée (USD). L'exemple de la documentation envoie
 * 999 : au-delà, la prévision n'augmente plus ; en deçà d'un centime, aucun clic.
 */
const BID_MIN_USD = 0.01;
const BID_MAX_USD = 999;

// ─── Formes des réponses DataForSEO (sous-ensemble exploité) ─────────────────

export type DfsAdsKeywordItem = {
  keyword?: string | null;
  search_volume?: number | null;
  cpc?: number | null;
  competition?: string | null;
  competition_index?: number | null;
  low_top_of_page_bid?: number | null;
  high_top_of_page_bid?: number | null;
  monthly_searches?: ({ year?: number | null; month?: number | null; search_volume?: number | null } | null)[] | null;
  /** Concepts Google (ignorés) */
  keyword_annotations?: unknown;
};

export type DfsAdTrafficItem = {
  keyword?: string | null;
  clicks?: number | null;
  cost?: number | null;
  average_cpc?: number | null;
  /** Obsolètes : toujours null */
  impressions?: number | null;
  ctr?: number | null;
};

// ─── Normalisation ───────────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nonNegativeOrNull(value: unknown): number | null {
  const n = numberOrNull(value);
  return n !== null && n >= 0 ? n : null;
}

function competitionOrNull(value: unknown): GoogleAdsCompetition | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return upper === "LOW" || upper === "MEDIUM" || upper === "HIGH" ? upper : null;
}

/** Entrées mensuelles valides (année, mois 1..12, volume ≥ 0), ordre du fournisseur. */
function monthlySearches(value: unknown): GoogleAdsKeywordData["monthly"] {
  if (!Array.isArray(value)) return [];
  const out: GoogleAdsKeywordData["monthly"] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { year?: unknown; month?: unknown; search_volume?: unknown };
    const year = numberOrNull(e.year);
    const month = numberOrNull(e.month);
    const volume = nonNegativeOrNull(e.search_volume);
    if (year === null || month === null || volume === null) continue;
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    out.push({ year: Math.trunc(year), month, searchVolume: Math.round(volume) });
  }
  return out;
}

/**
 * Item « keywords_for_keywords » → idée normalisée (devise USD) ; null si
 * l'item n'est pas un objet ou n'a pas de mot-clé. Les valeurs absentes ou
 * hors format restent null (jamais inventées) ; l'indice de concurrence est
 * borné 0..100.
 */
export function keywordIdeaFromItem(item: unknown): GoogleAdsKeywordData | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as DfsAdsKeywordItem;
  const keyword = textOrNull(raw.keyword);
  if (!keyword) return null;
  const volume = nonNegativeOrNull(raw.search_volume);
  const index = numberOrNull(raw.competition_index);
  return {
    keyword: keyword.replace(/\s+/g, " "),
    searchVolume: volume === null ? null : Math.round(volume),
    cpcUsd: nonNegativeOrNull(raw.cpc),
    competition: competitionOrNull(raw.competition),
    competitionIndex: index === null ? null : Math.round(clamp(index, 0, 100)),
    lowTopBidUsd: nonNegativeOrNull(raw.low_top_of_page_bid),
    highTopBidUsd: nonNegativeOrNull(raw.high_top_of_page_bid),
    monthly: monthlySearches(raw.monthly_searches),
  };
}

/** Item « ad_traffic_by_keywords » → ligne de prévision ; null sans mot-clé. `impressions`/`ctr` ignorés. */
export function forecastRowFromItem(item: unknown): GoogleAdsForecastRow | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as DfsAdTrafficItem;
  const keyword = textOrNull(raw.keyword);
  if (!keyword) return null;
  return {
    keyword: keyword.replace(/\s+/g, " "),
    clicks: nonNegativeOrNull(raw.clicks),
    costUsd: nonNegativeOrNull(raw.cost),
    averageCpcUsd: nonNegativeOrNull(raw.average_cpc),
  };
}

/**
 * Mots-clés prêts pour l'API : espaces repliés, vides et trop longs écartés,
 * dédoublonnés sans tenir compte de la casse (Google Ads met en minuscules),
 * au plus `max`.
 */
export function cleanAdsKeywords(keywords: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim();
    if (text === "" || text.length > KEYWORD_MAX_LENGTH) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Enchère envoyée à `ad_traffic_by_keywords`. La documentation DataForSEO
 * déclare `bid` comme un flottant — « the maximum custom bid … it stands for
 * the price you are willing to pay for an ad » — avec `999.00` en exemple, et
 * rend `average_cpc` et `cost` « (USD) » : la valeur est donc en **unités de
 * devise** (2.5 = 2,50 $), pas en micro-unités comme `max_cpc_bid_micros` de
 * l'API Google Ads (999 micro-dollars vaudraient 0,001 $ et ne donneraient
 * aucun clic). Aucune conversion : l'enchère USD de `suggestBidUsd` est
 * transmise telle quelle, arrondie au centime et bornée.
 */
export function adsBidForRequest(bidUsd: number): number {
  const value = Number.isFinite(bidUsd) ? bidUsd : BID_MIN_USD;
  return round2(clamp(value, BID_MIN_USD, BID_MAX_USD));
}

function isMatchType(value: unknown): value is GoogleAdsMatchType {
  return typeof value === "string" && (GOOGLE_ADS_MATCH_TYPES as readonly string[]).includes(value);
}

// ─── Mock déterministe ───────────────────────────────────────────────────────

/** Famille d'une requête pour le mock : fixe la fourchette de volume (recherches/mois). */
export type MockAdsKind = "profession" | "metier_ville" | "specialite" | "intention" | "informationnel" | "faible";

const MOCK_VOLUME_RANGES: Record<MockAdsKind, [number, number]> = {
  profession: [2000, 20000],
  metier_ville: [50, 400],
  specialite: [20, 200],
  intention: [10, 80],
  informationnel: [100, 1500],
  faible: [0, 8],
};

/** Requêtes informationnelles, de formation ou d'emploi (écartées par la sélection, certaines proposées en négatif). */
const MOCK_INFO_WORDS = ["formation", "devenir", "salaire", "definition", "c est quoi", "bienfaits", "efficace", "remboursement", "emploi", "wikipedia"];
/** Marqueurs d'intention (rendez-vous, réputation, tarif, proximité). */
const MOCK_INTENT_WORDS = ["rendez vous", "rdv", "avis", "tarif", "prix", "meilleur", "cabinet", "pres de chez moi", "urgence", "consultation", "seance", "proche", "centre ville"];
/** Requêtes de niche à volume quasi nul (écartées par le volume minimal). */
const MOCK_LOW_WORDS = ["dimanche", "nuit"];
/** Requête rendue sans aucune donnée (volume, CPC, concurrence null) : exerce la tolérance aux null. */
const MOCK_NULL_WORD = "horaires";
const MOCK_CTR = 0.03;
const MOCK_CLICKS_MAX = 300;
const MOCK_MATCH_FACTOR: Record<GoogleAdsMatchType, number> = { exact: 1, phrase: 1.35, broad: 1.9 };

function includesPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

function wordCount(normalized: string): number {
  return normalized === "" ? 0 : normalized.split(" ").length;
}

/** Famille d'une requête d'après ses marqueurs puis son nombre de mots (1 : métier seul, 2 : métier + ville, 3+ : spécialité). */
export function mockAdsKind(keyword: string): MockAdsKind {
  const n = normalizeAdsText(keyword);
  if (MOCK_LOW_WORDS.some((w) => includesPhrase(n, w))) return "faible";
  if (MOCK_INFO_WORDS.some((w) => includesPhrase(n, w))) return "informationnel";
  if (MOCK_INTENT_WORDS.some((w) => includesPhrase(n, w))) return "intention";
  const count = wordCount(n);
  if (count <= 1) return "profession";
  if (count === 2) return "metier_ville";
  return "specialite";
}

/** Douze mois pleins précédant `now` (ordre chronologique), comme `monthly_searches`. */
function lastTwelveMonths(now: Date): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

/**
 * Idée mock d'un mot-clé : volume dans la fourchette de sa famille, CPC
 * 0,80–3,50 $, concurrence cohérente avec son indice, enchères de haut de
 * page autour du CPC, saisonnalité sinusoïdale sur douze mois. Déterministe
 * (`hash31` du texte normalisé) ; une requête contenant « horaires » n'a
 * aucune donnée (null partout).
 */
export function mockKeywordIdea(keyword: string, now: Date): GoogleAdsKeywordData {
  const text = keyword.replace(/\s+/g, " ").trim().toLowerCase();
  const normalized = normalizeAdsText(text);
  if (includesPhrase(normalized, MOCK_NULL_WORD)) {
    return { keyword: text, searchVolume: null, cpcUsd: null, competition: null, competitionIndex: null, lowTopBidUsd: null, highTopBidUsd: null, monthly: [] };
  }
  const h = hash31(`ads:${normalized}`);
  const [lo, hi] = MOCK_VOLUME_RANGES[mockAdsKind(text)];
  const raw = lo + (h % (hi - lo + 1));
  const volume = raw >= 100 ? Math.round(raw / 10) * 10 : raw;
  const cpc = round2(0.8 + ((h >>> 8) % 271) / 100);
  const index = (h >>> 16) % 101;
  const phase = h % 12;
  return {
    keyword: text,
    searchVolume: volume,
    cpcUsd: cpc,
    competition: index >= 67 ? "HIGH" : index >= 34 ? "MEDIUM" : "LOW",
    competitionIndex: index,
    lowTopBidUsd: round2(cpc * 0.55),
    highTopBidUsd: round2(cpc * 1.7),
    monthly: lastTwelveMonths(now).map((m, i) => ({
      ...m,
      searchVolume: Math.max(0, Math.round(volume * (1 + 0.25 * Math.sin((2 * Math.PI * (i + phase)) / 12)))),
    })),
  };
}

/** Terme principal (le métier seul) et ville d'après les graines de `buildAdsSeeds` (« métier ville » d'abord, métier seul ensuite). */
function mainAndCity(seeds: string[]): { main: string; city: string } {
  const first = seeds[0] ?? "";
  const prefixes = seeds.filter((s) => s !== first && first.startsWith(`${s} `)).sort((a, b) => a.length - b.length);
  const main = prefixes[0] ?? [...seeds].sort((a, b) => a.length - b.length)[0] ?? first;
  const city = first.startsWith(`${main} `) ? first.slice(main.length + 1).trim() : "";
  return { main, city };
}

/**
 * Idées dérivées des graines : variantes d'intention (cabinet, près de chez
 * moi, avis, tarif, rendez-vous, séance…), croisements spécialité × métier,
 * puis quelques requêtes informationnelles, de formation, hors sujet ou à
 * volume nul pour exercer la sélection et les négatifs.
 */
export function mockAdsIdeaTexts(seeds: string[]): string[] {
  const { main, city } = mainAndCity(seeds);
  const mainNorm = normalizeAdsText(main);
  const specialties = seeds.filter((s) => s !== main && !includesPhrase(normalizeAdsText(s), mainNorm) && (city === "" || !normalizeAdsText(s).endsWith(` ${normalizeAdsText(city)}`)));
  const texts: string[] = [...seeds];
  texts.push(`${main} près de chez moi`, `cabinet ${main}`, `${main} avis`, `${main} tarif`, `${main} prix`, `${main} rendez-vous`, `séance ${main}`, `consultation ${main}`, `${main} urgence`);
  if (city) {
    texts.push(`${main} ${city} rdv`, `${main} ${city} prix`, `${main} ${city} centre ville`, `${main} proche ${city}`, `séance ${main} ${city}`, `${main} ${city} dimanche`, `${main} ${city} horaires`);
  }
  for (const specialty of specialties.slice(0, 4)) texts.push(`${specialty} ${main}`, `${main} ${specialty}`);
  texts.push(`formation ${main}`, `devenir ${main}`, `${main} salaire`, `${main} définition`, `${main} c'est quoi`, `bienfaits ${main}`, `${main} efficace`, `${main} remboursement mutuelle`, `${main} emploi`);
  texts.push(...(city ? [`psychologue ${city}`, `kiné ${city}`, `naturopathe ${city} avis`] : ["psychologue", "kiné"]));
  const seen = new Set<string>();
  return texts.filter((t) => {
    const key = normalizeAdsText(t);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fournisseur Google Ads factice : volumes et CPC plausibles selon
 * l'intention, déterministes par graine (`hash31`), coût 0. Les mois de la
 * saisonnalité suivent `now` (douze mois pleins avant l'appel).
 */
export class MockAdsDataProvider implements AdsDataProvider {
  readonly mode = "mock" as const;
  private readonly now: Date | undefined;

  constructor(options: { now?: Date } = {}) {
    this.now = options.now;
  }

  async keywordIdeas(input: AdsKeywordIdeasInput): Promise<ProviderResult<GoogleAdsKeywordData[]>> {
    const now = this.now ?? new Date();
    const seeds = cleanAdsKeywords(input.seeds, ADS_SEEDS_PER_REQUEST).map((s) => s.toLowerCase());
    if (seeds.length === 0) return { data: [], costUsd: 0, mode: "mock" };
    const data = mockAdsIdeaTexts(seeds)
      .map((text) => mockKeywordIdea(text, now))
      .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1) || a.keyword.localeCompare(b.keyword, "fr"));
    return { data, costUsd: 0, mode: "mock" };
  }

  /** Clics ≈ volume × 3 % (× correspondance, réduits si l'enchère est sous le CPC), bornés ; coût = clics × CPC moyen. */
  async adTraffic(input: AdsTrafficInput): Promise<ProviderResult<GoogleAdsForecastRow[]>> {
    const now = this.now ?? new Date();
    const keywords = cleanAdsKeywords(input.keywords, ADS_TRAFFIC_KEYWORDS_PER_REQUEST).map((k) => k.toLowerCase());
    const bid = adsBidForRequest(input.bidUsd);
    const matchFactor = MOCK_MATCH_FACTOR[isMatchType(input.match) ? input.match : "phrase"];
    const data = keywords.map((keyword): GoogleAdsForecastRow => {
      const idea = mockKeywordIdea(keyword, now);
      if (idea.searchVolume === null || idea.cpcUsd === null) {
        return { keyword: idea.keyword, clicks: null, costUsd: null, averageCpcUsd: null };
      }
      const bidFactor = clamp(bid / idea.cpcUsd, 0.25, 1);
      const clicks = Math.round(clamp(idea.searchVolume * MOCK_CTR * matchFactor * bidFactor, 0, MOCK_CLICKS_MAX) * 10) / 10;
      const averageCpcUsd = round2(Math.min(idea.cpcUsd, bid));
      return { keyword: idea.keyword, clicks, costUsd: round2(clicks * averageCpcUsd), averageCpcUsd };
    });
    return { data, costUsd: 0, mode: "mock" };
  }
}

// ─── Implémentation réelle ───────────────────────────────────────────────────

/**
 * Fournisseur Google Ads DataForSEO réel : une tâche par appel « live »,
 * appels séquentiels (limite de 12 requêtes par minute). Une tâche refusée
 * lève `DataForSeoError` avec le coût renvoyé par la réponse ; une erreur
 * HTTP ou réseau (après la relance du client) lève une `Error` ordinaire
 * (coût inconnu : à l'appelant d'inscrire l'estimation par prudence).
 */
export class DataForSeoAdsProvider extends DataForSeoClient implements AdsDataProvider {
  readonly mode = "dataforseo" as const;

  constructor(login: string, password: string, fetchImpl: typeof fetch = fetch, options: DataForSeoClientOptions = {}) {
    super(login, password, fetchImpl, options);
  }

  async keywordIdeas(input: AdsKeywordIdeasInput): Promise<ProviderResult<GoogleAdsKeywordData[]>> {
    const seeds = cleanAdsKeywords(input.seeds, ADS_SEEDS_PER_REQUEST);
    if (seeds.length === 0) return { data: [], costUsd: 0, mode: "dataforseo" };
    const { tasks, cost } = await this.request<DfsAdsKeywordItem>(ADS_KEYWORD_IDEAS_ENDPOINT, {
      method: "POST",
      body: [
        {
          keywords: seeds,
          location_code: input.locationCode,
          language_code: input.languageCode,
          search_partners: false,
          sort_by: "search_volume",
        },
      ],
    });
    const task = tasks[0];
    if (!task || task.status_code !== DATAFORSEO_STATUS_OK) {
      throw new DataForSeoError(this.taskError(ADS_KEYWORD_IDEAS_ENDPOINT, task).message, cost);
    }
    const items: unknown[] = Array.isArray(task.result) ? task.result : [];
    const data = items.map(keywordIdeaFromItem).filter((idea): idea is GoogleAdsKeywordData => idea !== null);
    return { data, costUsd: cost, mode: "dataforseo" };
  }

  async adTraffic(input: AdsTrafficInput): Promise<ProviderResult<GoogleAdsForecastRow[]>> {
    const keywords = cleanAdsKeywords(input.keywords, ADS_TRAFFIC_KEYWORDS_PER_REQUEST);
    if (keywords.length === 0) return { data: [], costUsd: 0, mode: "dataforseo" };
    if (!isMatchType(input.match)) throw new Error(`DataForSEO ${ADS_TRAFFIC_ENDPOINT}: type de correspondance invalide`);
    const { tasks, cost } = await this.request<DfsAdTrafficItem>(ADS_TRAFFIC_ENDPOINT, {
      method: "POST",
      body: [
        {
          keywords,
          // Unités de devise (USD), voir adsBidForRequest
          bid: adsBidForRequest(input.bidUsd),
          match: input.match,
          location_code: input.locationCode,
          language_code: input.languageCode,
          date_interval: "next_month",
        },
      ],
    });
    const task = tasks[0];
    if (!task || task.status_code !== DATAFORSEO_STATUS_OK) {
      throw new DataForSeoError(this.taskError(ADS_TRAFFIC_ENDPOINT, task).message, cost);
    }
    const items: unknown[] = Array.isArray(task.result) ? task.result : [];
    const data = items.map(forecastRowFromItem).filter((row): row is GoogleAdsForecastRow => row !== null);
    return { data, costUsd: cost, mode: "dataforseo" };
  }
}

/** DATAFORSEO_MOCK=1 ou identifiants absents → mock ; sinon le fournisseur réel. */
export function createAdsDataProvider(env: NodeJS.ProcessEnv = process.env): AdsDataProvider {
  const mock = env.DATAFORSEO_MOCK === "1" || env.DATAFORSEO_MOCK === "true";
  if (!mock && env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    return new DataForSeoAdsProvider(env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD);
  }
  return new MockAdsDataProvider();
}
