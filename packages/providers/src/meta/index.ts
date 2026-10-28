/**
 * Bibliothèque publicitaire Meta (Ad Library API, Graph) : recherche des
 * annonces publiques diffusées en France contenant un terme — textes, page
 * annonceur, dates de diffusion, plateformes, portée européenne, ciblage
 * déclaré (âges, genre, zones). Jamais d'image : la veille du studio ne
 * conserve que les textes et le lien public de l'annonce.
 *
 * Appel réel : `GET https://graph.facebook.com/<version>/ads_archive` avec
 * `access_token`, `ad_type=ALL`, `ad_reached_countries=["FR"]`,
 * `search_terms`, `search_type=KEYWORD_UNORDERED`, `ad_active_status`,
 * `limit` (≤ 100) et `fields` (META_ADS_ARCHIVE_FIELDS) ; pages suivantes par
 * `paging.next` jusqu'à `maxPages`. Erreurs Graph `{ error: { message, code,
 * error_subcode } }` : code 190 → jeton invalide ou expiré (non transitoire) ;
 * codes 4 / 17 / 32 / 613 (limites de débit) et HTTP 429 / 5xx, délai (30 s)
 * ou réseau → transitoires, une relance après 2 s. Le jeton n'apparaît jamais
 * dans un message d'erreur ni un journal (`redactMetaToken`).
 *
 * Sans jeton et sans META_ADS_MOCK, aucun fournisseur (`null`) : la veille est
 * indisponible. Le mock déterministe (`hash31`) sert les démos et les tests.
 */

import {
  META_AD_LIBRARY_COUNTRY,
  META_GRAPH_VERSION_DEFAULT,
  META_LIBRARY_PAGE_LIMIT,
  metaLibraryUrl,
  normalizeAdsText,
  type MetaAdLocation,
  type MetaAdRecord,
} from "@theralys/shared";
import { describeError, hash31, numberOrNull, textOrNull } from "../dataforseo/client";

// ─── Contrat ─────────────────────────────────────────────────────────────────

export type AdLibrarySearchInput = {
  term: string;
  /** Code pays ISO (META_AD_LIBRARY_COUNTRY) */
  country: string;
  activeStatus: "ALL" | "ACTIVE";
  /** Annonces par page (≤ META_LIBRARY_PAGE_LIMIT) */
  limit?: number;
  /** Pages suivies au plus (défaut 1) */
  maxPages?: number;
};

export type AdLibrarySearchResult = {
  ads: MetaAdRecord[];
  /** Appels HTTP effectués */
  calls: number;
  /** D'autres pages existaient au-delà de `maxPages` */
  truncated: boolean;
};

export interface AdLibraryProvider {
  readonly mode: "meta" | "mock";
  searchAds(input: AdLibrarySearchInput): Promise<AdLibrarySearchResult>;
}

export const META_GRAPH_BASE = "https://graph.facebook.com";
export const META_ADS_ARCHIVE_ENDPOINT = "ads_archive";
/** Champs demandés à la bibliothèque (ordre de la documentation). */
export const META_ADS_ARCHIVE_FIELDS =
  "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,publisher_platforms,languages,eu_total_reach,target_ages,target_gender,target_locations,beneficiary_payers";
/** Délai maximal d'une requête (ms). */
export const META_TIMEOUT_MS = 30_000;
/** Attente avant l'unique relance d'une erreur transitoire (ms). */
export const META_RETRY_DELAY_MS = 2_000;
/** Jeton invalide ou expiré (OAuthException). */
export const META_INVALID_TOKEN_CODE = 190;
/** Limites de débit Graph : application (4), utilisateur (17), page (32), personnalisée (613). */
export const META_TRANSIENT_CODES: readonly number[] = [4, 17, 32, 613];

/** Erreur de la bibliothèque : statut HTTP, code Graph et caractère transitoire (relance utile). */
export class MetaAdLibraryError extends Error {
  readonly status: number | null;
  readonly code: number | null;
  readonly transient: boolean;

  constructor(message: string, opts: { status?: number | null; code?: number | null; transient?: boolean } = {}) {
    super(message);
    this.name = "MetaAdLibraryError";
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.transient = opts.transient ?? false;
  }
}

/** Jeton invalide ou expiré (code Graph 190) : à renouveler côté Harmony, aucune relance utile. */
export function isMetaTokenError(err: unknown): boolean {
  return err instanceof MetaAdLibraryError && err.code === META_INVALID_TOKEN_CODE;
}

// ─── Requête ─────────────────────────────────────────────────────────────────

/** Version Graph : META_GRAPH_VERSION si elle a la forme « vNN.N », sinon META_GRAPH_VERSION_DEFAULT. */
export function metaGraphVersion(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.META_GRAPH_VERSION?.trim() ?? "";
  return /^v\d+\.\d+$/.test(value) ? value : META_GRAPH_VERSION_DEFAULT;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Annonces par page réellement demandées (entier 1..META_LIBRARY_PAGE_LIMIT). */
export function pageLimitFor(limit: number | undefined): number {
  const value = Number.isFinite(limit) ? Math.floor(limit as number) : META_LIBRARY_PAGE_LIMIT;
  return clamp(value, 1, META_LIBRARY_PAGE_LIMIT);
}

/** URL de la première page d'une recherche (contient le jeton : ne jamais la journaliser). */
export function adsArchiveUrl(opts: { version: string; token: string; term: string; country: string; activeStatus: "ALL" | "ACTIVE"; limit: number }): string {
  const params = new URLSearchParams({
    access_token: opts.token,
    ad_type: "ALL",
    ad_reached_countries: JSON.stringify([opts.country]),
    search_terms: opts.term,
    search_type: "KEYWORD_UNORDERED",
    ad_active_status: opts.activeStatus,
    limit: String(opts.limit),
    fields: META_ADS_ARCHIVE_FIELDS,
  });
  return `${META_GRAPH_BASE}/${opts.version}/${META_ADS_ARCHIVE_ENDPOINT}?${params.toString()}`;
}

/** Retire le jeton d'un texte (paramètre `access_token=…`, encodé ou non, et valeur brute du jeton). */
export function redactMetaToken(text: string, token?: string): string {
  let out = text.replace(/access_token(=|%3D)[^&\s"'),]*/gi, "access_token=***");
  if (token && token.length >= 8) out = out.split(token).join("***");
  return out;
}

type GraphError = { message: string; code: number | null; subcode: number | null };

function graphErrorFrom(json: unknown): GraphError | null {
  if (!json || typeof json !== "object") return null;
  const error = (json as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; code?: unknown; error_subcode?: unknown };
  return { message: textOrNull(e.message) ?? "erreur Graph sans message", code: numberOrNull(e.code), subcode: numberOrNull(e.error_subcode) };
}

// ─── Normalisation ───────────────────────────────────────────────────────────

function idOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return textOrNull(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = textOrNull(entry);
    if (text) out.push(text.replace(/\s+/g, " "));
  }
  return out;
}

/** Date Graph (« 2025-03-12 » ou « 2025-03-12T10:00:00+0000 ») → ISO 8601, null si absente ou invalide. */
export function isoDateOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  const normalized = text.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function reachOrNull(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  const num = numberOrNull(n);
  return num !== null && num >= 0 ? Math.round(num) : null;
}

function locationsFrom(value: unknown): MetaAdLocation[] {
  if (!Array.isArray(value)) return [];
  const out: MetaAdLocation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { name?: unknown; type?: unknown; excluded?: unknown };
    const name = textOrNull(e.name);
    if (!name) continue;
    out.push({ name, type: textOrNull(e.type), excluded: e.excluded === true });
  }
  return out;
}

function payerFrom(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { payer?: unknown; beneficiary?: unknown };
    const payer = textOrNull(e.payer) ?? textOrNull(e.beneficiary);
    if (payer) return payer;
  }
  return null;
}

/**
 * Item `ads_archive` → annonce normalisée ; null sans identifiant ou si
 * l'item n'est pas un objet. Champs absents → tableaux vides ou null (rien
 * d'inventé) ; `ad_snapshot_url` est ignoré (il embarque le jeton) : le lien
 * public est `metaLibraryUrl(id)`.
 */
export function adRecordFromItem(item: unknown): MetaAdRecord | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const id = idOrNull(raw.id);
  if (!id) return null;
  return {
    id,
    pageId: idOrNull(raw.page_id),
    pageName: textOrNull(raw.page_name)?.replace(/\s+/g, " ") ?? "",
    bodies: stringList(raw.ad_creative_bodies),
    titles: stringList(raw.ad_creative_link_titles),
    descriptions: stringList(raw.ad_creative_link_descriptions),
    captions: stringList(raw.ad_creative_link_captions),
    libraryUrl: metaLibraryUrl(id),
    startedAt: isoDateOrNull(raw.ad_delivery_start_time),
    stoppedAt: isoDateOrNull(raw.ad_delivery_stop_time),
    platforms: stringList(raw.publisher_platforms),
    languages: stringList(raw.languages),
    euTotalReach: reachOrNull(raw.eu_total_reach),
    targetAges: textOrNull(raw.target_ages),
    targetGender: textOrNull(raw.target_gender),
    targetLocations: locationsFrom(raw.target_locations),
    payer: payerFrom(raw.beneficiary_payers),
  };
}

// ─── Implémentation réelle ───────────────────────────────────────────────────

export type MetaAdLibraryOptions = {
  /** Version Graph (défaut : META_GRAPH_VERSION_DEFAULT) */
  version?: string;
  /** Délai par requête (ms), défaut META_TIMEOUT_MS */
  timeoutMs?: number;
  /** Attente avant la relance (ms), défaut META_RETRY_DELAY_MS — 0 dans les tests */
  retryDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fournisseur réel : un GET par page, délai de 30 s, une relance après 2 s
 * sur erreur transitoire (limites de débit Graph, 429, 5xx, délai, réseau),
 * pagination par `paging.next`. Les messages d'erreur ne contiennent jamais
 * le jeton.
 */
export class MetaAdLibraryProvider implements AdLibraryProvider {
  readonly mode = "meta" as const;
  private readonly version: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: MetaAdLibraryOptions = {},
  ) {
    this.version = options.version ?? META_GRAPH_VERSION_DEFAULT;
    this.timeoutMs = options.timeoutMs ?? META_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? META_RETRY_DELAY_MS;
  }

  async searchAds(input: AdLibrarySearchInput): Promise<AdLibrarySearchResult> {
    const term = input.term.replace(/\s+/g, " ").trim();
    if (term === "") return { ads: [], calls: 0, truncated: false };
    const maxPages = Math.max(1, Math.floor(input.maxPages ?? 1));
    const ads: MetaAdRecord[] = [];
    let calls = 0;
    let next: string | null = adsArchiveUrl({
      version: this.version,
      token: this.token,
      term,
      country: input.country || META_AD_LIBRARY_COUNTRY,
      activeStatus: input.activeStatus === "ACTIVE" ? "ACTIVE" : "ALL",
      limit: pageLimitFor(input.limit),
    });
    while (next && calls < maxPages) {
      const page = await this.fetchPage(next);
      calls++;
      ads.push(...page.ads);
      next = page.next;
    }
    return { ads, calls, truncated: next !== null };
  }

  /** Une page, avec une seule relance sur erreur transitoire. */
  private async fetchPage(url: string): Promise<{ ads: MetaAdRecord[]; next: string | null }> {
    let lastError: MetaAdLibraryError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0 && this.retryDelayMs > 0) await sleep(this.retryDelayMs);
      try {
        return await this.fetchOnce(url);
      } catch (err) {
        if (err instanceof MetaAdLibraryError && err.transient) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new MetaAdLibraryError("Meta ads_archive : échec", { transient: true });
  }

  private redact(text: string): string {
    return redactMetaToken(text, this.token);
  }

  private async fetchOnce(url: string): Promise<{ ads: MetaAdRecord[]; next: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      } catch (err) {
        throw new MetaAdLibraryError(`Meta ads_archive réseau : ${this.redact(describeError(err))}`, { transient: true });
      }
      let text = "";
      try {
        text = await response.text();
      } catch {
        text = "";
      }
      let json: unknown = null;
      try {
        json = text === "" ? null : JSON.parse(text);
      } catch {
        json = null;
      }
      const graphError = graphErrorFrom(json);
      if (!response.ok || graphError) {
        const code = graphError?.code ?? null;
        const transient = response.status === 429 || response.status >= 500 || (code !== null && META_TRANSIENT_CODES.includes(code));
        const detail = graphError
          ? `${graphError.message}${graphError.subcode !== null ? ` (sous-code ${graphError.subcode})` : ""}`
          : text.replace(/\s+/g, " ").trim().slice(0, 200) || response.statusText || "sans détail";
        throw new MetaAdLibraryError(
          `Meta ads_archive HTTP ${response.status}${code !== null ? ` code ${code}` : ""} : ${this.redact(detail).slice(0, 300)}`,
          { status: response.status, code, transient },
        );
      }
      const body = (json ?? {}) as { data?: unknown; paging?: { next?: unknown } | null };
      const items: unknown[] = Array.isArray(body.data) ? body.data : [];
      const ads = items.map(adRecordFromItem).filter((ad): ad is MetaAdRecord => ad !== null);
      const next = body.paging && typeof body.paging === "object" ? textOrNull(body.paging.next) : null;
      return { ads, next: next && /^https:\/\//.test(next) ? next : null };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Mock déterministe ───────────────────────────────────────────────────────

export type MockLocality = { city: string; department: string | null; region: string | null };

const MOCK_SURNAMES = ["Martin", "Bernard", "Roux", "Fontaine", "Lefèvre", "Garnier", "Morel", "Chevalier", "Perrin", "Dumas", "Blanchard", "Girard"];

const MOCK_PLATFORMS: readonly string[][] = [
  ["facebook"],
  ["instagram"],
  ["facebook", "instagram"],
  ["facebook", "instagram", "messenger"],
  ["facebook", "instagram", "audience_network", "messenger"],
];

const MOCK_AGES: readonly (string | null)[] = ["18-65+", "25-54", "30-65+", "18-44", "35-65+", null];
const MOCK_GENDERS: readonly (string | null)[] = ["All", "All", "Women", "All", "Men", null];

type MockAngle = {
  body: string;
  title: string;
  description: string;
  caption: string;
};

/** Textes plausibles de praticiens bien-être ({term}, {Term}, {city} remplacés). */
const MOCK_ANGLES: readonly MockAngle[] = [
  {
    body: "Et si vous preniez un moment pour vous ? Au cabinet, chaque séance commence par un temps d'écoute, puis des exercices simples à reprendre chez vous. « {term} » à {city} : première séance sur rendez-vous.",
    title: "{Term} à {city}",
    description: "Première séance sur rendez-vous",
    caption: "Prendre rendez-vous en ligne",
  },
  {
    body: "Séance découverte à 35 € jusqu'à la fin du mois. Une heure pour faire connaissance, comprendre la démarche et repartir avec un premier exercice. Rendez-vous en ligne en deux clics.",
    title: "Séance découverte à 35 €",
    description: "Offre valable jusqu'à la fin du mois",
    caption: "Réserver ma séance découverte",
  },
  {
    body: "Comment se passe une séance ? Un échange, des exercices de respiration et de relâchement, puis un temps de retour. Pas besoin d'expérience : on avance à votre rythme. Cabinet à {city}, aussi en visio.",
    title: "Une séance, concrètement",
    description: "Respiration, détente, écoute",
    caption: "En savoir plus sur la méthode",
  },
  {
    body: "« Un accueil chaleureux et des outils concrets que je réutilise au quotidien. » Merci pour vos avis : ils nous encouragent chaque jour. Cabinet ouvert du lundi au samedi à {city}.",
    title: "Ils en parlent mieux que nous",
    description: "Avis Google vérifiés",
    caption: "Lire les avis",
  },
  {
    body: "Rentrée : reprendre un bon rythme, retrouver le calme avant les examens ou un nouveau poste. Ateliers en petit groupe le samedi matin, places limitées. « {term} » au cœur de {city}.",
    title: "Ateliers de rentrée",
    description: "Petit groupe, samedi matin",
    caption: "Voir les dates",
  },
  {
    body: "L'hiver approche : des séances pour garder son énergie et préparer les fêtes en douceur. Créneaux du soir ouverts jusqu'à 20 h, sur rendez-vous.",
    title: "Prendre soin de soi cet hiver",
    description: "Créneaux du soir jusqu'à 20 h",
    caption: "Choisir un créneau",
  },
  {
    body: "Nouveau cabinet au centre de {city}, à deux pas de la gare. Parking gratuit, accès facile. Prise de rendez-vous en ligne, réponse sous 24 h.",
    title: "Nouveau cabinet à {city}",
    description: "Centre-ville, parking gratuit",
    caption: "Découvrir le cabinet",
  },
  {
    body: "Atelier découverte le samedi à 14 h : respiration, détente et échanges en petit groupe. Inscription sur le site, 8 places. Une façon simple de découvrir « {term} » avant une séance individuelle.",
    title: "Atelier découverte",
    description: "8 places, samedi 14 h",
    caption: "Je m'inscris",
  },
];

function fill(template: string, term: string, city: string): string {
  const capitalized = term.charAt(0).toUpperCase() + term.slice(1);
  return template.replace(/\{term\}/g, term).replace(/\{Term\}/g, capitalized).replace(/\{city\}/g, city);
}

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

function mockPageName(h: number, city: string): string {
  const surname = pick(MOCK_SURNAMES, h >>> 3);
  const variants = [`Cabinet ${surname}`, `Cabinet ${surname}`, `Cabinet du Bien-Être ${city}`, `Cabinet Équilibre`, `Cabinet Harmonie ${city}`, `Cabinet Respire`, `Cabinet Sérénité ${surname}`];
  return pick(variants, h >>> 7);
}

/** Zones ciblées selon le tirage : ≈ 30 % ville, 20 % département, 20 % région, 30 % France (repli France sans localité). */
function mockLocations(draw: number, locality: MockLocality | null): MetaAdLocation[] {
  const france: MetaAdLocation = { name: "France", type: "country", excluded: false };
  if (!locality) return [france];
  if (draw < 3) {
    const city: MetaAdLocation = { name: locality.city, type: "city", excluded: false };
    return draw === 1 ? [city, { name: "Paris", type: "city", excluded: true }] : [city];
  }
  if (draw < 5 && locality.department) return [{ name: locality.department, type: "region", excluded: false }];
  if (draw < 7 && locality.region) return [{ name: locality.region, type: "region", excluded: false }];
  return [france];
}

/**
 * Annonces simulées d'un terme : 10 à 18, textes français de praticiens
 * (accroches, offres découverte, pédagogie, avis, saisonnier, local), pages
 * « Cabinet … », zones mélangées, portées 500–60 000, débuts 3 à 200 jours
 * avant `now`, un tiers arrêtées, plateformes variées. Les deux premières
 * annonces ne dépendent pas du terme (mêmes identifiants pour tous les termes
 * d'une même localité : elles remontent plusieurs fois, comme dans la vraie
 * bibliothèque). Déterministe : même terme, même localité, même `now` → mêmes
 * annonces.
 */
export function mockLibraryAds(term: string, opts: { now: Date; locality: MockLocality | null; activeStatus?: "ALL" | "ACTIVE" }): MetaAdRecord[] {
  const key = normalizeAdsText(term) || "annonce";
  const city = opts.locality?.city || "centre-ville";
  const count = 10 + (hash31(`meta:count:${key}`) % 9);
  const out: MetaAdRecord[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i < 2 ? `meta:shared:${normalizeAdsText(city)}:${i}` : `meta:${key}:${i}`;
    const h = hash31(seed);
    const angle = pick(MOCK_ANGLES, (h >>> 4) + i);
    const draw = (h >>> 8) % 10;
    const reach = 500 + ((h >>> 12) % 59_501);
    const startDays = 3 + ((h >>> 3) % 198);
    const stopped = i % 3 === 2;
    const stopDays = stopped ? Math.max(0, startDays - 1 - ((h >>> 5) % Math.max(1, startDays - 1))) : null;
    if (stopped && opts.activeStatus === "ACTIVE") continue;
    const start = new Date(opts.now.getTime() - startDays * 86_400_000);
    const stop = stopDays === null ? null : new Date(opts.now.getTime() - stopDays * 86_400_000);
    const id = String(1_000_000_000_000 + (hash31(`meta:id:${seed}`) % 900_000_000_000));
    const pageName = mockPageName(h, city);
    out.push({
      id,
      pageId: String(100_000_000_000 + (hash31(`meta:page:${pageName}`) % 800_000_000_000)),
      pageName,
      bodies: [fill(angle.body, term, city)],
      titles: [fill(angle.title, term, city)],
      descriptions: [fill(angle.description, term, city)],
      captions: [angle.caption],
      libraryUrl: metaLibraryUrl(id),
      startedAt: start.toISOString(),
      stoppedAt: stop ? stop.toISOString() : null,
      platforms: [...pick(MOCK_PLATFORMS, h >>> 2)],
      languages: ["fr"],
      euTotalReach: (h >>> 9) % 7 === 0 ? null : reach,
      targetAges: pick(MOCK_AGES, h >>> 6),
      targetGender: pick(MOCK_GENDERS, h >>> 10),
      targetLocations: mockLocations(draw, opts.locality ?? null),
      payer: pageName,
    });
  }
  return out;
}

/**
 * Fournisseur factice : annonces déterministes par terme et localité
 * (ville, département, région du site), un appel compté par recherche,
 * jamais de pagination. `now` fige les dates (tests) ; sinon l'instant de
 * l'appel.
 */
export class MockAdLibraryProvider implements AdLibraryProvider {
  readonly mode = "mock" as const;
  private readonly now: Date | undefined;
  private readonly locality: MockLocality | null;

  constructor(opts: { now?: Date; locality?: MockLocality } = {}) {
    this.now = opts.now;
    this.locality = opts.locality ?? null;
  }

  async searchAds(input: AdLibrarySearchInput): Promise<AdLibrarySearchResult> {
    const term = input.term.replace(/\s+/g, " ").trim();
    if (term === "") return { ads: [], calls: 0, truncated: false };
    const ads = mockLibraryAds(term, { now: this.now ?? new Date(), locality: this.locality, activeStatus: input.activeStatus });
    const limit = pageLimitFor(input.limit);
    return { ads: ads.slice(0, limit), calls: 1, truncated: ads.length > limit };
  }
}

// ─── Fabrique ────────────────────────────────────────────────────────────────

/**
 * META_ADS_MOCK=1 → mock (localité et `now` facultatifs pour les démos) ;
 * jeton META_AD_LIBRARY_TOKEN → fournisseur réel (version META_GRAPH_VERSION) ;
 * sinon null : la veille est indisponible (jamais de données simulées par
 * défaut).
 */
export function createAdLibraryProvider(env: NodeJS.ProcessEnv = process.env, opts: { now?: Date; locality?: MockLocality } = {}): AdLibraryProvider | null {
  const mock = env.META_ADS_MOCK === "1" || env.META_ADS_MOCK === "true";
  if (mock) return new MockAdLibraryProvider(opts);
  const token = env.META_AD_LIBRARY_TOKEN?.trim();
  if (token) return new MetaAdLibraryProvider(token, fetch, { version: metaGraphVersion(env) });
  return null;
}
