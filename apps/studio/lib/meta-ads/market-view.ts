/**
 * Onglet « Marché » (Meta Ads) : modèle d'affichage de la galerie — veille et
 * bibliothèque personnelle, avec les gestes du praticien pas encore revenus du
 * serveur — et textes dérivés d'une annonce (accroche, dates, plateformes,
 * audience, phrases de l'en-tête). Le filtrage, le tri et les compteurs
 * restent dans `@theralys/shared` (`meta-library`). Fonctions pures.
 */

import {
  META_MARKET_SCOPES,
  META_MARKET_SCOPE_LABELS,
  META_GALLERY_DEFAULT_FILTERS,
  adTopPercent,
  galleryAdsFrom,
  type MetaAdMedia,
  type MetaAdMediaFormat,
  type MetaAdsMarket,
  type MetaGalleryAd,
  type MetaGalleryFilters,
  type MetaLibraryEntry,
  type MetaMarketAd,
  type MetaMarketScope,
  type MetaMarketSignal,
  type MetaRelevanceSummary,
} from "@theralys/shared";
import { PARIS_TZ } from "../calendar";

// ─── Bibliothèque : état serveur + gestes en attente ─────────────────────────

/** État voulu par le praticien pour une annonce : gardée, supprimée, ou ni l'un ni l'autre. */
export type LibraryMark = "kept" | "dismissed" | "none";

/** Geste appliqué à l'écran avant la réponse du serveur (`at` : ISO 8601, `token` : action qui l'a posé). */
export type LibraryOverride = { mark: LibraryMark; at: string; token: number };
export type LibraryOverrides = Readonly<Record<string, LibraryOverride | undefined>>;

export type LibrarySource = { kept: readonly MetaLibraryEntry[]; dismissedIds: readonly string[] };

/** Annonce de la vue « Ma bibliothèque » : date de garde et présence dans la veille courante. */
export type LibraryGalleryAd = MetaGalleryAd & { savedAt: string; inWatch: boolean };

/** Vue « Annonces » : la veille sans les annonces supprimées, gestes en attente compris. */
export function watchGalleryAds(
  ads: readonly MetaMarketAd[],
  mediaByAdId: Readonly<Record<string, MetaAdMedia | undefined>>,
  library: LibrarySource,
  overrides: LibraryOverrides,
): MetaGalleryAd[] {
  const keptIds = new Set(library.kept.map((entry) => entry.adId));
  const dismissedIds = new Set(library.dismissedIds);
  for (const [id, override] of Object.entries(overrides)) {
    if (!override) continue;
    keptIds.delete(id);
    dismissedIds.delete(id);
    if (override.mark === "kept") keptIds.add(id);
    if (override.mark === "dismissed") dismissedIds.add(id);
  }
  return galleryAdsFrom(ads, mediaByAdId, { keptIds, dismissedIds });
}

/**
 * Vue « Ma bibliothèque » : les exemples gardés (annonce et visuels tels que
 * conservés), sans ceux que le praticien vient de retirer, plus ceux qu'il
 * vient de garder dans la veille (visuels de la veille en attendant le serveur).
 */
export function libraryGalleryAds(
  ads: readonly MetaMarketAd[],
  mediaByAdId: Readonly<Record<string, MetaAdMedia | undefined>>,
  library: LibrarySource,
  overrides: LibraryOverrides,
): LibraryGalleryAd[] {
  const watch = new Map(ads.map((ad) => [ad.id, ad]));
  const out: LibraryGalleryAd[] = [];
  const seen = new Set<string>();
  for (const entry of library.kept) {
    seen.add(entry.adId);
    const mark = overrides[entry.adId]?.mark;
    if (!entry.ad || mark === "none" || mark === "dismissed") continue;
    out.push({ ...entry.ad, media: entry.media ?? mediaByAdId[entry.adId] ?? null, kept: true, savedAt: entry.savedAt, inWatch: watch.has(entry.adId) });
  }
  const pending: LibraryGalleryAd[] = [];
  for (const [id, override] of Object.entries(overrides)) {
    const ad = watch.get(id);
    if (!override || override.mark !== "kept" || seen.has(id) || !ad) continue;
    pending.push({ ...ad, media: mediaByAdId[id] ?? null, kept: true, savedAt: override.at, inWatch: true });
  }
  pending.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return [...pending, ...out];
}

// ─── Textes d'une annonce ────────────────────────────────────────────────────

export const SIGNAL_LABELS: Record<MetaMarketSignal, { label: string; short: string; tone: "success" | "warning" | "neutral" }> = {
  fort: { label: "Signal fort", short: "Fort", tone: "success" },
  moyen: { label: "Signal moyen", short: "Moyen", tone: "warning" },
  faible: { label: "Signal faible", short: "Faible", tone: "neutral" },
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

const GENDER_LABELS: Record<string, string> = { All: "tous", Women: "femmes", Men: "hommes" };

/** Longueur maximale de l'accroche d'une carte. */
export const AD_HOOK_MAX = 110;
/** En deçà, une première phrase est une amorce (« Bonjour ! », « Dr. ») : la suivante est ajoutée. */
const HOOK_MIN = 24;

/** Texte principal d'une annonce : son premier texte non vide ; chaîne vide sinon. */
export function adMainText(ad: Pick<MetaMarketAd, "bodies">): string {
  return ad.bodies.map((body) => body.trim()).find((body) => body !== "") ?? "";
}

/**
 * Accroche d'une annonce : première phrase (ou première ligne) de son premier
 * texte non vide, coupée au mot à `max` caractères. Chaîne vide sans texte.
 */
export function adHook(ad: Pick<MetaMarketAd, "bodies" | "titles" | "descriptions">, max = AD_HOOK_MAX): string {
  const source = [...ad.bodies, ...ad.titles, ...ad.descriptions].map((text) => text.trim()).find((text) => text !== "") ?? "";
  const line = source.split(/\r?\n/).map((part) => part.replace(/\s+/g, " ").trim()).find((part) => part !== "") ?? "";
  if (line === "") return "";
  // Phrases : jusqu'à une ponctuation finale suivie d'une espace (« 45.50 € » et « site.fr » ne coupent pas)
  const sentences = line.match(/.+?(?:[.!?…]+(?=\s|$)|$)/g) ?? [line];
  let hook = "";
  for (const sentence of sentences) {
    hook += sentence;
    if (hook.trim().length >= HOOK_MIN) break;
  }
  hook = hook.trim();
  if (hook.length <= max) return hook;
  const cut = hook.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "");
  return `${cut === "" ? hook.slice(0, max - 1) : cut}…`;
}

const AD_DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: PARIS_TZ });

/** « 20/03/2026 » (jour civil Europe/Paris) ; null si la date manque ou est illisible. */
export function formatAdDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : AD_DATE.format(date);
}

/** « Facebook, Instagram +1 » : `max` plateformes puis le nombre des suivantes ; null sans plateforme. */
export function platformsLabel(platforms: readonly string[], max = 2): string | null {
  const labels = [...new Set(platforms.map((platform) => PLATFORM_LABELS[platform] ?? platform).filter((label) => label.trim() !== ""))];
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max).join(", ");
  return labels.length > max ? `${shown} +${labels.length - max}` : shown;
}

/** « 25-54 ans · femmes » ; null si l'audience n'est pas publiée. */
export function audienceLabel(ad: Pick<MetaMarketAd, "targetAges" | "targetGender">): string | null {
  const parts = [ad.targetAges ? `${ad.targetAges} ans` : null, ad.targetGender ? (GENDER_LABELS[ad.targetGender] ?? ad.targetGender.toLowerCase()) : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** « Albi, Castres, Gaillac, Toulouse (+2) » : zones ciblées, hors exclusions ; null sans zone. */
export function zonesLabel(ad: Pick<MetaMarketAd, "targetLocations">, max = 4): string | null {
  const zones = ad.targetLocations.filter((location) => !location.excluded).map((location) => location.name);
  if (zones.length === 0) return null;
  return `${zones.slice(0, max).join(", ")}${zones.length > max ? ` (+${zones.length - max})` : ""}`;
}

export type AdDiffusion = {
  /** active : encore diffusée ; stopped : arrêtée ; unknown : durée inconnue */
  state: "active" | "stopped" | "unknown";
  /** Carte : « 209 j », « 42 j · arrêtée », « — » */
  short: string;
  /** Fiche : « En diffusion depuis 209 j » */
  long: string;
};

export function adDiffusion(ad: Pick<MetaMarketAd, "active" | "runningDays">): AdDiffusion {
  if (ad.runningDays === null) return { state: "unknown", short: "—", long: ad.active ? "En diffusion, durée inconnue" : "Durée inconnue" };
  const days = `${ad.runningDays} j`;
  return ad.active
    ? { state: "active", short: days, long: `En diffusion depuis ${days}` }
    : { state: "stopped", short: `${days} · arrêtée`, long: `Diffusée ${days}, arrêtée` };
}

/** « #25 /111 · top 23 % » ; null pour une veille enregistrée avant les rangs. */
export function rankLabel(ad: Pick<MetaMarketAd, "rank" | "rankTotal">): string | null {
  if (!ad.rank) return null;
  const top = adTopPercent(ad);
  return top === null || !ad.rankTotal ? `#${ad.rank}` : `#${ad.rank} /${ad.rankTotal} · top ${top} %`;
}

const INITIALS_SKIPPED = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "a", "à"]);

/** Initiales d'une page (deux au plus), sans les mots de liaison : « Cabinet du Bien-Être Albi » → « CB ». */
export function pageInitials(pageName: string): string {
  const words = pageName
    .replace(/[’']/g, " ")
    .split(/[\s\-–—/&|·.,]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word !== "");
  const meaningful = words.filter((word) => word.length > 1 && !INITIALS_SKIPPED.has(word.toLowerCase()));
  const picked = (meaningful.length > 0 ? meaningful : words).slice(0, 2);
  return picked.map((word) => [...word][0]!.toLocaleUpperCase("fr")).join("") || "?";
}

function hash31(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

export type PosterTone = { from: string; to: string; ink: string };

/** Teintes douces des affiches typographiques et des pastilles d'initiales. */
const POSTER_TONES: readonly PosterTone[] = [
  { from: "#f0f8ff", to: "#cfe8fa", ink: "#0b5280" },
  { from: "#f6f1ea", to: "#e8dccb", ink: "#5a452c" },
  { from: "#eef6f1", to: "#d2e8da", ink: "#24543d" },
  { from: "#f6eff5", to: "#e6d5e5", ink: "#5a3458" },
  { from: "#fdf2ea", to: "#f8dcc8", ink: "#7a3f1e" },
  { from: "#eef2f8", to: "#d6e0ee", ink: "#2f4674" },
];

/** Teinte d'une annonce, toujours la même pour un identifiant donné. */
export function posterTone(seed: string): PosterTone {
  return POSTER_TONES[hash31(seed) % POSTER_TONES.length]!;
}

/** Format affiché d'une annonce de la galerie (« sans » : visuel inconnu). */
export function galleryFormatOf(ad: Pick<MetaGalleryAd, "media">): MetaAdMediaFormat | "sans" {
  return ad.media && ad.media.items.length > 0 ? ad.media.format : "sans";
}

/** Adresse de lecture de la vidéo d'une annonce (redirige vers le fichier, 404 si indisponible). */
export function metaVideoSrc(adId: string, index: number): string {
  return `/api/meta-ads/media/${encodeURIComponent(adId)}/video?i=${index}`;
}

/** Lien externe affichable : http(s) seulement ; null sinon. */
export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// ─── En-tête et barre d'outils ───────────────────────────────────────────────

const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n.toLocaleString("fr-FR")} ${n > 1 ? pluralForm : singular}`;

/**
 * « 412 annonces écartées d'office : 180 commerciales (produits, applications,
 * assurances), 95 formations ou services aux praticiens, 137 hors sujet. » —
 * catégories vides omises ; null si rien n'a été écarté.
 */
export function filteredNote(filtered: MetaRelevanceSummary | null | undefined): string | null {
  if (!filtered) return null;
  const total = filtered.commerce + filtered.formation + filtered.autre;
  if (total <= 0) return null;
  const parts = [
    filtered.commerce > 0 ? `${plural(filtered.commerce, "commerciale")} (produits, applications, assurances)` : null,
    filtered.formation > 0 ? `${plural(filtered.formation, "formation")} ou ${filtered.formation > 1 ? "services" : "service"} aux praticiens` : null,
    filtered.autre > 0 ? `${filtered.autre.toLocaleString("fr-FR")} hors sujet` : null,
  ].filter(Boolean);
  return `${plural(total, "annonce")} ${total > 1 ? "écartées" : "écartée"} d'office : ${parts.join(", ")}.`;
}

/** « 3 annonces que vous avez supprimées ne sont plus proposées. » ; null à zéro. */
export function dismissedNote(count: number): string | null {
  if (count <= 0) return null;
  return count > 1 ? `${plural(count, "annonce")} que vous avez supprimées ne sont plus proposées.` : "1 annonce que vous avez supprimée n'est plus proposée.";
}

/** « Les visuels de 3 annonces ne sont pas encore affichés. » */
export function visualsNote(missing: number): string {
  return `Les visuels de ${plural(missing, "annonce")} ne sont pas encore affichés.`;
}

/** Compteur de la galerie : « 60 annonces », ou « 37 annonces sur 60 » quand un filtre joue. */
export function galleryCountLabel(shown: number, total: number): string {
  return shown === total ? plural(total, "annonce") : `${plural(shown, "annonce")} sur ${total.toLocaleString("fr-FR")}`;
}

/** « 3 sélectionnées » */
export function selectionLabel(count: number): string {
  return `${count} ${count > 1 ? "sélectionnées" : "sélectionnée"}`;
}

export function filtersAreDefault(filters: MetaGalleryFilters): boolean {
  const base = META_GALLERY_DEFAULT_FILTERS;
  return (
    filters.query.trim() === "" &&
    filters.format === base.format &&
    filters.activeOnly === base.activeOnly &&
    filters.recentOnly === base.recentOnly &&
    filters.scope === base.scope &&
    filters.sort === base.sort
  );
}

export type ScopeCounter = { scope: MetaMarketScope; label: string; spotted: number; kept: number };

/**
 * Compteurs par zone : annonces repérées dans la bibliothèque publicitaire
 * (`counts`) et conservées dans la veille (`ads`). Toute zone qui a des
 * annonces repérées ou conservées est affichée — la veille complète la zone
 * retenue avec les mieux notées des zones plus larges.
 */
export function scopeCounters(market: Pick<MetaAdsMarket, "ads" | "counts">): ScopeCounter[] {
  return META_MARKET_SCOPES.map((scope) => ({
    scope,
    label: META_MARKET_SCOPE_LABELS[scope],
    spotted: market.counts[scope],
    kept: market.ads.filter((ad) => ad.scope === scope).length,
  })).filter((counter) => counter.spotted > 0 || counter.kept > 0);
}
