/**
 * Visuels des annonces Meta (images, vidéos, carrousels, avatar de la page).
 *
 * L'API officielle de la bibliothèque publicitaire ne renvoie que les textes,
 * et son lien d'aperçu ne se lit ni côté serveur ni dans une page : les
 * visuels viennent donc d'un fournisseur de données tiers, ScrapeCreators,
 * interrogé par identifiant d'annonce
 * (`GET https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=…`, clé
 * dans l'en-tête `x-api-key`, un crédit par appel). Les liens renvoyés
 * pointent sur le CDN de Meta et expirent en quelques jours : l'appelant
 * copie ce qu'il veut garder. Seuls les liens `https` du CDN de Meta sont
 * conservés (ils seront téléchargés côté serveur).
 *
 * Sans clé SCRAPECREATORS_API_KEY et sans META_ADS_MOCK, aucun fournisseur
 * (`null`) : la veille s'affiche sans visuels. La clé n'est jamais journalisée.
 */

import { META_MEDIA_ITEMS_MAX, isMetaCdnUrl, metaCdnExpiry, normalizeAdsText, type MetaAdMediaFormat } from "@theralys/shared";
import { boundedText } from "./index";

export const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";
export const SCRAPECREATORS_AD_PATH = "/v1/facebook/adLibrary/ad";
/** Délai maximal d'une recherche (ms). */
export const AD_MEDIA_TIMEOUT_MS = 15_000;
/** Attente avant l'unique relance d'une erreur transitoire (ms). */
export const AD_MEDIA_RETRY_DELAY_MS = 1_500;

export type AdMediaLookupItem = {
  kind: "image" | "video";
  /** Image d'origine (ou affiche de la vidéo), lien expirant du CDN de Meta */
  imageUrl: string | null;
  /** Vidéo d'origine, lien expirant du CDN de Meta */
  videoUrl: string | null;
  /** Image prête à afficher, sans téléchargement (données de démonstration) */
  posterUrl?: string | null;
};

export type AdMediaLookup = {
  adId: string;
  format: MetaAdMediaFormat;
  /** Déclinaisons d'une annonce dynamique (DCO) plutôt que diapositives */
  variants: boolean;
  items: AdMediaLookupItem[];
  avatarUrl: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  pageCategories: string[];
  pageLikes: number | null;
  /** ISO 8601 : première expiration des liens, null si inconnue */
  expiresAt: string | null;
};

export interface AdMediaProvider {
  readonly mode: "scrapecreators" | "mock";
  /** Visuels d'une annonce ; null si l'annonce est introuvable chez le fournisseur. */
  lookup(adId: string): Promise<AdMediaLookup | null>;
}

/**
 * `retry` : échec avant toute réponse exploitable du fournisseur (connexion
 * refusée, 5xx) — rien n'a été facturé, une relance est utile. `transient` :
 * délai dépassé ou réponse 200 illisible — la recherche a pu être facturée,
 * elle n'est pas relancée.
 */
export type AdMediaErrorKind = "auth" | "credits" | "rate" | "retry" | "transient" | "other";

/** Erreur du fournisseur de visuels : `auth`, `credits` et `rate` condamnent tout le lot, `retry` mérite une relance. */
export class AdMediaError extends Error {
  readonly status: number | null;
  readonly kind: AdMediaErrorKind;

  constructor(message: string, opts: { status?: number | null; kind?: AdMediaErrorKind } = {}) {
    super(message);
    this.name = "AdMediaError";
    this.status = opts.status ?? null;
    this.kind = opts.kind ?? "other";
  }
}

/** Clé refusée, crédits épuisés ou limite de débit : inutile de poursuivre le lot. */
export function isAdMediaBlocking(err: unknown): boolean {
  return err instanceof AdMediaError && (err.kind === "auth" || err.kind === "credits" || err.kind === "rate");
}

// ─── Normalisation ───────────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((v): v is Record<string, unknown> => v !== null) : [];
}

function cdnUrl(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2_000 && isMetaCdnUrl(value) ? value : null;
}

/** Texte court sans caractère de contrôle ni marque de direction, borné (mêmes règles que les textes d'annonces). */
function shortText(value: unknown, max: number): string | null {
  return boundedText(value, max);
}

/** Page de destination : http(s) seulement, bornée. */
function linkUrlFrom(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function videoItem(raw: Record<string, unknown>): AdMediaLookupItem | null {
  const videoUrl = cdnUrl(raw.video_sd_url) ?? cdnUrl(raw.video_hd_url);
  if (!videoUrl) return null;
  return { kind: "video", imageUrl: cdnUrl(raw.video_preview_image_url), videoUrl };
}

function imageItem(raw: Record<string, unknown>): AdMediaLookupItem | null {
  const imageUrl = cdnUrl(raw.original_image_url) ?? cdnUrl(raw.resized_image_url);
  return imageUrl ? { kind: "image", imageUrl, videoUrl: null } : null;
}

/** Formats de la bibliothèque dont les cartes sont des déclinaisons d'une annonce dynamique (les autres multi-cartes sont des diapositives). */
const VARIANT_FORMATS = new Set(["dco"]);

/**
 * Réponse ScrapeCreators → visuels normalisés ; null si la réponse n'a pas de
 * bloc `snapshot`. Une annonce sans visuel exploitable donne `items: []`.
 * Vidéos et images propres d'abord, cartes (carrousel, DCO, catalogue) sinon ;
 * au plus META_MEDIA_ITEMS_MAX visuels.
 */
export function adMediaFromScrapeCreators(json: unknown, adId: string): AdMediaLookup | null {
  const root = record(json);
  const snapshot = record(root?.snapshot);
  if (!root || !snapshot) return null;
  const videos = list(snapshot.videos).map(videoItem).filter((v): v is AdMediaLookupItem => v !== null);
  const images = list(snapshot.images).map(imageItem).filter((v): v is AdMediaLookupItem => v !== null);
  const cards = list(snapshot.cards).map((card) => videoItem(card) ?? imageItem(card)).filter((v): v is AdMediaLookupItem => v !== null);
  const own = [...videos, ...images];
  const items = (own.length > 0 ? own : cards).slice(0, META_MEDIA_ITEMS_MAX);
  const display = normalizeAdsText(typeof snapshot.display_format === "string" ? snapshot.display_format : "");
  const variants = items.length > 1 && VARIANT_FORMATS.has(display);
  const format: MetaAdMediaFormat = items.length > 1 && !variants ? "carousel" : items[0]?.kind === "video" ? "video" : "image";
  const avatarUrl = cdnUrl(snapshot.page_profile_picture_url);
  const expiries = [avatarUrl, ...items.flatMap((item) => [item.imageUrl, item.videoUrl])]
    .map((url) => metaCdnExpiry(url))
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  const likes = typeof snapshot.page_like_count === "number" && Number.isFinite(snapshot.page_like_count) ? Math.max(0, Math.trunc(snapshot.page_like_count)) : null;
  return {
    adId,
    format,
    variants,
    items,
    avatarUrl,
    ctaText: shortText(snapshot.cta_text, 40),
    linkUrl: linkUrlFrom(snapshot.link_url),
    pageCategories: (Array.isArray(snapshot.page_categories) ? snapshot.page_categories : [])
      .map((c) => shortText(c, 60))
      .filter((c): c is string => c !== null)
      .slice(0, 5),
    pageLikes: likes,
    expiresAt: expiries.length > 0 ? new Date(Math.min(...expiries)).toISOString() : null,
  };
}

// ─── Implémentation réelle ───────────────────────────────────────────────────

export type ScrapeCreatorsOptions = {
  timeoutMs?: number;
  /** Attente avant la relance (ms) — 0 dans les tests */
  retryDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAdId(value: string): boolean {
  return /^\d{5,25}$/.test(value);
}

/**
 * Fournisseur réel : un GET par annonce, délai de 15 s, une seule relance
 * après 1,5 s quand rien n'a pu être facturé (connexion refusée, 5xx). Un
 * délai dépassé ou une réponse 200 illisible ne sont pas relancés (la
 * recherche a pu être comptée). 401 / 403 → clé refusée ; 402 → crédits
 * épuisés ; 429 → limite de débit ; 404 ou `success: false` → annonce
 * introuvable (null). `creditsRemaining` suit le solde renvoyé par l'API.
 */
export class ScrapeCreatorsMediaProvider implements AdMediaProvider {
  readonly mode = "scrapecreators" as const;
  creditsRemaining: number | null = null;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: ScrapeCreatorsOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? AD_MEDIA_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? AD_MEDIA_RETRY_DELAY_MS;
  }

  async lookup(adId: string): Promise<AdMediaLookup | null> {
    if (!isAdId(adId)) return null;
    let last: AdMediaError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0 && this.retryDelayMs > 0) await sleep(this.retryDelayMs);
      try {
        return await this.lookupOnce(adId);
      } catch (err) {
        if (err instanceof AdMediaError && err.kind === "retry") {
          last = err;
          continue;
        }
        throw err;
      }
    }
    throw last ?? new AdMediaError("ScrapeCreators : échec", { kind: "retry" });
  }

  private redact(text: string): string {
    return this.apiKey.length >= 8 ? text.split(this.apiKey).join("***") : text;
  }

  private async lookupOnce(adId: string): Promise<AdMediaLookup | null> {
    const url = `${SCRAPECREATORS_BASE}${SCRAPECREATORS_AD_PATH}?id=${encodeURIComponent(adId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "GET", headers: { Accept: "application/json", "x-api-key": this.apiKey }, signal: controller.signal });
      } catch (err) {
        // Délai dépassé : la requête est peut-être arrivée (et facturée) — pas de relance ; connexion impossible : relance
        const kind: AdMediaErrorKind = controller.signal.aborted ? "transient" : "retry";
        throw new AdMediaError(`ScrapeCreators réseau : ${this.redact(err instanceof Error ? err.message : String(err)).slice(0, 200)}`, { kind });
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
      const root = record(json);
      const detail = this.redact(shortText(root?.message, 200) ?? shortText(root?.error, 200) ?? (text.replace(/\s+/g, " ").trim().slice(0, 200) || response.statusText || "sans détail"));
      if (response.status === 404) return null;
      if (!response.ok) {
        const kind: AdMediaErrorKind =
          response.status === 401 || response.status === 403 ? "auth" : response.status === 402 ? "credits" : response.status === 429 ? "rate" : response.status >= 500 ? "retry" : "other";
        throw new AdMediaError(`ScrapeCreators HTTP ${response.status} : ${detail}`, { status: response.status, kind });
      }
      if (!root) throw new AdMediaError("ScrapeCreators : réponse illisible", { status: response.status, kind: "transient" });
      if (typeof root.credits_remaining === "number" && Number.isFinite(root.credits_remaining)) this.creditsRemaining = root.credits_remaining;
      if (root.success === false) return null;
      return adMediaFromScrapeCreators(root, adId);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Données de démonstration ────────────────────────────────────────────────

function hash31(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

const MOCK_PALETTES: readonly (readonly [string, string, string])[] = [
  ["#f4e7dc", "#d98f6c", "#7a3e2b"],
  ["#e3efe6", "#7fb08e", "#2f5d45"],
  ["#e6ecf6", "#8aa5d6", "#2f4674"],
  ["#f6ead9", "#e0b65c", "#7a5a12"],
  ["#efe4f1", "#b48cc0", "#5a2f6b"],
  ["#e2f0f1", "#6fb4ba", "#1f5a61"],
];

/** Visuel de démonstration : SVG en `data:` (aucun téléchargement, aucun stockage). */
export function mockPosterDataUrl(seed: string, label: string): string {
  const [bg, mid, dark] = MOCK_PALETTES[hash31(seed) % MOCK_PALETTES.length]!;
  const x = 180 + (hash31(`${seed}:x`) % 440);
  const y = 260 + (hash31(`${seed}:y`) % 380);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>` +
    `<rect width="800" height="1000" fill="url(#g)"/>` +
    `<circle cx="${x}" cy="${y}" r="210" fill="${dark}" opacity="0.16"/><circle cx="${800 - x}" cy="${1000 - y}" r="150" fill="#ffffff" opacity="0.35"/>` +
    `<text x="400" y="930" text-anchor="middle" font-family="sans-serif" font-size="30" fill="${dark}" opacity="0.75">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Fournisseur factice : visuels déterministes par identifiant (image, vidéo
 * sans fichier, carrousel de trois images, déclinaisons), prêts à afficher.
 */
export class MockAdMediaProvider implements AdMediaProvider {
  readonly mode = "mock" as const;

  async lookup(adId: string): Promise<AdMediaLookup | null> {
    if (adId.trim() === "") return null;
    const draw = hash31(`media:${adId}`) % 6;
    const poster = (n: number) => mockPosterDataUrl(`${adId}:${n}`, "Visuel de démonstration");
    const image = (n: number): AdMediaLookupItem => ({ kind: "image", imageUrl: null, videoUrl: null, posterUrl: poster(n) });
    const video = (n: number): AdMediaLookupItem => ({ kind: "video", imageUrl: null, videoUrl: null, posterUrl: poster(n) });
    const items = draw === 1 || draw === 4 ? [video(0)] : draw === 2 ? [image(0), image(1), image(2)] : draw === 5 ? [image(0), image(1)] : [image(0)];
    return {
      adId,
      format: items.length > 1 && draw !== 5 ? "carousel" : (items[0]!.kind as MetaAdMediaFormat),
      variants: draw === 5,
      items,
      avatarUrl: null,
      ctaText: draw % 2 === 0 ? "En savoir plus" : "Prendre rendez-vous",
      linkUrl: null,
      pageCategories: ["Alternative & Holistic Health Service"],
      pageLikes: 80 + (hash31(`likes:${adId}`) % 900),
      expiresAt: null,
    };
  }
}

// ─── Fabrique ────────────────────────────────────────────────────────────────

/**
 * META_ADS_MOCK=1 → visuels de démonstration ; clé SCRAPECREATORS_API_KEY →
 * fournisseur réel ; sinon null (veille sans visuels).
 */
export function createAdMediaProvider(env: NodeJS.ProcessEnv = process.env): AdMediaProvider | null {
  const mock = env.META_ADS_MOCK === "1" || env.META_ADS_MOCK === "true";
  if (mock) return new MockAdMediaProvider();
  const key = env.SCRAPECREATORS_API_KEY?.trim();
  return key ? new ScrapeCreatorsMediaProvider(key) : null;
}
