/**
 * Meta Ads (studio Harmony) — visuels des annonces de la veille, bibliothèque
 * personnelle du praticien et logique de la galerie du marché.
 *
 * L'API officielle de Meta (bibliothèque publicitaire) ne renvoie que les
 * textes : les visuels (image, vidéo, carrousel, avatar de la page) viennent
 * d'un fournisseur de données tiers, par identifiant d'annonce. Leurs liens
 * d'origine expirent en quelques jours : l'image principale de chaque annonce
 * est donc copiée sur notre stockage (`posterUrl`), et la vidéo d'une annonce
 * gardée comme exemple l'est aussi (`videoUrl`).
 *
 * « Garder comme exemple » conserve l'annonce, son analyse et ses visuels
 * indéfiniment dans la bibliothèque du site ; « Supprimer » la retire de la
 * veille et l'empêche de revenir aux analyses suivantes. Aucune dépendance
 * base ou IA.
 */

import { normalizeAdsText } from "./google-ads";
import { META_MARKET_SCOPES, type MetaMarketAd, type MetaMarketScope } from "./meta-ads";

// ─── Paramètres ──────────────────────────────────────────────────────────────

/** Visuels conservés par annonce (diapositives d'un carrousel, déclinaisons). */
export const META_MEDIA_ITEMS_MAX = 5;
/** Recherches de visuels par mois et par site (analyses, rechargements, exemples gardés). */
export const META_MEDIA_LOOKUPS_PER_MONTH = 400;
/** Coût d'une recherche de visuels (USD), inscrit au registre des usages. */
export const META_MEDIA_LOOKUP_COST_USD = 0.002;
/** Annonces de réserve dont les visuels sont cherchés, pour remplacer celles qu'une catégorie de page commerciale écarte. */
export const META_MARKET_MEDIA_SPARE = 6;
/** Exemples gardés au plus par site. */
export const META_LIBRARY_KEPT_MAX = 200;
/** Annonces traitées au plus par action groupée. */
export const META_LIBRARY_BULK_MAX = 60;
/** Taille maximale d'une vidéo copiée pour un exemple gardé (octets). */
export const META_LIBRARY_VIDEO_MAX_BYTES = 40 * 1024 * 1024;
/** Largeur maximale des images copiées (px). */
export const META_MEDIA_POSTER_WIDTH = 1080;
/** Une annonce lancée depuis moins de jours que cela est une nouveauté. */
export const META_GALLERY_RECENT_DAYS = 30;

// ─── Visuels ─────────────────────────────────────────────────────────────────

export const META_AD_MEDIA_FORMATS = ["image", "video", "carousel"] as const;
export type MetaAdMediaFormat = (typeof META_AD_MEDIA_FORMATS)[number];

export const META_AD_MEDIA_FORMAT_LABELS: Record<MetaAdMediaFormat, string> = {
  image: "Image",
  video: "Vidéo",
  carousel: "Carrousel",
};

export type MetaAdMediaItem = {
  kind: "image" | "video";
  /** Image durable sur notre stockage (l'image, ou l'affiche de la vidéo) ; null si la copie a échoué */
  posterUrl: string | null;
  /** Liens d'origine (CDN de Meta) : ils expirent en quelques jours */
  sourceImageUrl: string | null;
  sourceVideoUrl: string | null;
  /** Vidéo durable sur notre stockage (exemples gardés seulement) */
  videoUrl?: string | null;
};

export type MetaAdMedia = {
  version: 1;
  format: MetaAdMediaFormat;
  /** true : déclinaisons d'une annonce dynamique (Meta choisit laquelle montrer) ; false : visuel unique ou carrousel */
  variants: boolean;
  items: MetaAdMediaItem[];
  /** Avatar de la page (copie durable, sinon lien d'origine) */
  avatarUrl: string | null;
  /** Libellé du bouton de l'annonce (« En savoir plus ») */
  ctaText: string | null;
  /** Page de destination de l'annonce */
  linkUrl: string | null;
  /** Catégories de la page Facebook (« Osteopathic Doctor », « Shopping & retail ») */
  pageCategories: string[];
  pageLikes: number | null;
  /** ISO 8601 : première expiration des liens d'origine, null si inconnue */
  sourceExpiresAt: string | null;
  /** ISO 8601 */
  fetchedAt: string;
  source: "scrapecreators" | "mock";
};

/** Hôtes acceptés pour un visuel d'origine : CDN de Meta uniquement (jamais d'autre hôte téléchargé côté serveur). */
export function isMetaCdnUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host.endsWith(".fbcdn.net") || host.endsWith(".cdninstagram.com");
  } catch {
    return false;
  }
}

/** Expiration d'un lien du CDN de Meta (paramètre `oe`, secondes Unix en hexadécimal) ; null si absente. */
export function metaCdnExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const oe = new URL(value).searchParams.get("oe");
    if (!oe || !/^[0-9a-f]{6,10}$/i.test(oe)) return null;
    const seconds = Number.parseInt(oe, 16);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/** Les liens d'origine ne sont plus servis (marge d'une heure). */
export function metaMediaSourceExpired(media: Pick<MetaAdMedia, "sourceExpiresAt">, now = new Date()): boolean {
  if (!media.sourceExpiresAt) return false;
  const expiry = new Date(media.sourceExpiresAt);
  return Number.isNaN(expiry.getTime()) ? false : expiry.getTime() - 3_600_000 <= now.getTime();
}

/** Image à afficher pour un visuel : la copie durable, sinon le lien d'origine tant qu'il vit. */
export function metaMediaItemImage(item: MetaAdMediaItem, media: Pick<MetaAdMedia, "sourceExpiresAt">, now = new Date()): string | null {
  if (item.posterUrl) return item.posterUrl;
  return item.sourceImageUrl && !metaMediaSourceExpired(media, now) ? item.sourceImageUrl : null;
}

/** Image de couverture d'une annonce (premier visuel affichable) ; null sans visuel. */
export function metaMediaCover(media: MetaAdMedia | null | undefined, now = new Date()): string | null {
  if (!media) return null;
  for (const item of media.items) {
    const image = metaMediaItemImage(item, media, now);
    if (image) return image;
  }
  return null;
}

/** Libellé du format sur une carte : « Vidéo », « Carrousel 1/3 », « Image · 4 déclinaisons ». */
export function metaMediaBadge(media: MetaAdMedia): string {
  const label = META_AD_MEDIA_FORMAT_LABELS[media.format];
  const count = media.items.length;
  if (media.variants && count > 1) return `${label} · ${count} déclinaisons`;
  if (media.format === "carousel" && count > 1) return `${label} 1/${count}`;
  return label;
}

/**
 * Catégories de page Facebook qui signent un annonceur hors veille (boutique,
 * marque, école, média, assurance) : second filtre, appliqué une fois les
 * visuels obtenus. Liste volontairement courte : beaucoup de praticiens
 * choisissent une catégorie vague (« Product/service », « Local business »).
 */
const COMMERCIAL_PAGE_CATEGORIES: readonly string[] = [
  "shopping retail", "e commerce website", "retail company", "brand", "clothing brand", "app page", "software", "insurance company", "insurance agent",
  "insurance broker", "school", "college university", "education website", "educational consultant", "news media website", "media news company", "magazine",
  "vitamins supplements", "vitamin supplement shop", "health food store", "pharmacy drugstore", "sporting goods store", "mattress store", "furniture store",
  "baby goods kids goods", "medical equipment supplier", "medical equipment manufacturer", "tv channel", "publisher", "book",
];

export function isCommercialPageCategory(categories: readonly string[]): boolean {
  return categories.some((category) => COMMERCIAL_PAGE_CATEGORIES.includes(normalizeAdsText(category)));
}

// ─── Note et tendance ────────────────────────────────────────────────────────

/** Note sur 10 d'une annonce, tirée de son score (portée, durée de diffusion, diffusion en cours). */
export function adNote(score: number): number {
  if (!Number.isFinite(score)) return 1;
  return Math.max(1, Math.min(10, Math.round(score * 1.3)));
}

/** Annonce « tendance » : encore diffusée et au signal fort (longue durée, large portée). */
export function adIsTrending(ad: Pick<MetaMarketAd, "active" | "signal">): boolean {
  return ad.active && ad.signal === "fort";
}

/** Annonces repérées en deçà desquelles un pourcentage n'a pas de sens (« top 34 % » de trois annonces). */
export const AD_TOP_PERCENT_MIN_TOTAL = 10;

/**
 * Tranche des mieux notées à laquelle l'annonce appartient : « top 23 % »
 * (arrondi supérieur, 1 au minimum) ; null sans rang ou sur moins de
 * AD_TOP_PERCENT_MIN_TOTAL annonces repérées.
 */
export function adTopPercent(ad: Pick<MetaMarketAd, "rank" | "rankTotal">): number | null {
  if (!ad.rank || !ad.rankTotal || ad.rankTotal < AD_TOP_PERCENT_MIN_TOTAL) return null;
  return Math.max(1, Math.min(100, Math.ceil((ad.rank / ad.rankTotal) * 100)));
}

// ─── Bibliothèque personnelle ────────────────────────────────────────────────

export const META_LIBRARY_STATUSES = ["kept", "dismissed"] as const;
export type MetaLibraryStatus = (typeof META_LIBRARY_STATUSES)[number];

/** Exemple gardé : l'annonce telle qu'elle était au moment de la garde, son analyse et ses visuels durables. */
export type MetaLibraryEntry = {
  adId: string;
  status: MetaLibraryStatus;
  pageName: string;
  /** Annonce et son analyse (zone, signal, note, rang) ; null pour une annonce supprimée */
  ad: MetaMarketAd | null;
  media: MetaAdMedia | null;
  /** ISO 8601 */
  savedAt: string;
};

// ─── Galerie ─────────────────────────────────────────────────────────────────

/** Annonce affichée dans la galerie : la veille, ses visuels et son état dans la bibliothèque. */
export type MetaGalleryAd = MetaMarketAd & {
  media: MetaAdMedia | null;
  kept: boolean;
};

export const META_GALLERY_SORTS = ["note", "diffusion", "portee", "recent"] as const;
export type MetaGallerySort = (typeof META_GALLERY_SORTS)[number];

export const META_GALLERY_SORT_LABELS: Record<MetaGallerySort, string> = {
  note: "Meilleure note",
  diffusion: "Diffusion la plus longue",
  portee: "Plus grande portée",
  recent: "Les plus récentes",
};

/** Filtre de format : « sans » regroupe les annonces dont le visuel est inconnu. */
export type MetaGalleryFormat = "all" | MetaAdMediaFormat | "sans";

export type MetaGalleryFilters = {
  query: string;
  format: MetaGalleryFormat;
  activeOnly: boolean;
  recentOnly: boolean;
  scope: "all" | MetaMarketScope;
  sort: MetaGallerySort;
};

export const META_GALLERY_DEFAULT_FILTERS: MetaGalleryFilters = { query: "", format: "all", activeOnly: false, recentOnly: false, scope: "all", sort: "note" };

function startedTime(ad: Pick<MetaMarketAd, "startedAt">): number {
  const time = ad.startedAt ? new Date(ad.startedAt).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

/** Annonce lancée depuis moins de META_GALLERY_RECENT_DAYS jours. */
export function adIsRecent(ad: Pick<MetaMarketAd, "startedAt">, now = new Date()): boolean {
  const started = startedTime(ad);
  return started > 0 && now.getTime() - started <= META_GALLERY_RECENT_DAYS * 86_400_000;
}

function matchesFormat(ad: MetaGalleryAd, format: MetaGalleryFormat): boolean {
  if (format === "all") return true;
  if (format === "sans") return ad.media === null || ad.media.items.length === 0;
  return ad.media !== null && ad.media.items.length > 0 && ad.media.format === format;
}

function matchesQuery(ad: MetaGalleryAd, query: string): boolean {
  const needle = normalizeAdsText(query);
  if (needle === "") return true;
  const haystack = normalizeAdsText([ad.pageName, ...ad.bodies, ...ad.titles, ...ad.descriptions, ...ad.captions, ...ad.targetLocations.map((l) => l.name)].join(" "));
  return needle.split(" ").every((word) => haystack.includes(word));
}

const SORTERS: Record<MetaGallerySort, (a: MetaGalleryAd, b: MetaGalleryAd) => number> = {
  note: (a, b) => b.score - a.score,
  diffusion: (a, b) => (b.runningDays ?? -1) - (a.runningDays ?? -1),
  portee: (a, b) => (b.euTotalReach ?? -1) - (a.euTotalReach ?? -1),
  recent: (a, b) => startedTime(b) - startedTime(a),
};

/** Annonces de la galerie après recherche, filtres et tri (ordre stable : à égalité, nom de page puis identifiant). */
export function filterGalleryAds(ads: readonly MetaGalleryAd[], filters: MetaGalleryFilters, now = new Date()): MetaGalleryAd[] {
  const sorter = SORTERS[filters.sort];
  return ads
    .filter((ad) => matchesQuery(ad, filters.query))
    .filter((ad) => matchesFormat(ad, filters.format))
    .filter((ad) => !filters.activeOnly || ad.active)
    .filter((ad) => !filters.recentOnly || adIsRecent(ad, now))
    .filter((ad) => filters.scope === "all" || ad.scope === filters.scope)
    .sort((a, b) => sorter(a, b) || a.pageName.localeCompare(b.pageName, "fr") || a.id.localeCompare(b.id));
}

export type MetaGalleryCounts = {
  total: number;
  active: number;
  recent: number;
  formats: Record<MetaAdMediaFormat | "sans", number>;
  scopes: Record<MetaMarketScope, number>;
};

/** Compteurs des filtres, sur l'ensemble des annonces de la vue (avant filtrage). */
export function galleryCounts(ads: readonly MetaGalleryAd[], now = new Date()): MetaGalleryCounts {
  const counts: MetaGalleryCounts = {
    total: ads.length,
    active: 0,
    recent: 0,
    formats: { image: 0, video: 0, carousel: 0, sans: 0 },
    scopes: { ville: 0, departement: 0, region: 0, france: 0 },
  };
  for (const ad of ads) {
    if (ad.active) counts.active++;
    if (adIsRecent(ad, now)) counts.recent++;
    if (ad.media && ad.media.items.length > 0) counts.formats[ad.media.format]++;
    else counts.formats.sans++;
    counts.scopes[ad.scope]++;
  }
  return counts;
}

/** Zones présentes dans la vue, dans l'ordre ville → France (pour le filtre de zone). */
export function galleryScopes(counts: MetaGalleryCounts): MetaMarketScope[] {
  return META_MARKET_SCOPES.filter((scope) => counts.scopes[scope] > 0);
}

/**
 * Annonces de la galerie « Veille » : celles de la dernière analyse, sans les
 * annonces supprimées, avec leurs visuels et leur état « gardée ».
 */
export function galleryAdsFrom(
  ads: readonly MetaMarketAd[],
  mediaByAdId: Readonly<Record<string, MetaAdMedia | undefined>>,
  library: { keptIds: ReadonlySet<string>; dismissedIds: ReadonlySet<string> },
): MetaGalleryAd[] {
  return ads.filter((ad) => !library.dismissedIds.has(ad.id)).map((ad) => ({ ...ad, media: mediaByAdId[ad.id] ?? null, kept: library.keptIds.has(ad.id) }));
}
