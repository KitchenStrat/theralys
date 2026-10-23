/**
 * Réseaux sociaux (studio Harmony) : constantes, types JSON stockés dans
 * `social_posts` et logique pure (créneaux du mois, tailles, clé de cache).
 *
 * Ce module ne dépend ni de la base ni du paquet IA : il est importé par le
 * schéma drizzle (types `content` / `assets`), par `@theralys/ai` et par le
 * studio (calendrier, rendu).
 */

// ─── Formats, tailles, piliers, templates ────────────────────────────────────

export const SOCIAL_FORMATS = ["static", "carousel", "story"] as const;
export type SocialFormat = (typeof SOCIAL_FORMATS)[number];

export const SOCIAL_SIZES = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
} as const;
export type SocialSize = keyof typeof SOCIAL_SIZES;

export const SIZES_FOR_FORMAT: Record<SocialFormat, readonly SocialSize[]> = {
  static: ["square", "portrait", "story"],
  carousel: ["square", "portrait"],
  story: ["story"],
};

export const SOCIAL_PILLARS = [
  "specialite",
  "conseil",
  "article",
  "idee_recue",
  "coulisses",
  "infos_pratiques",
  "projection",
  "avis",
  "nouvel_article",
] as const;
export type SocialPillar = (typeof SOCIAL_PILLARS)[number];

export const SOCIAL_TEMPLATES = [
  "affirmation",
  "photo-titre",
  "question-reponse",
  "liste-conseils",
  "infos-pratiques",
  "avis",
  "carrousel-etapes",
  "carrousel-article",
  "story-rappel",
] as const;
export type SocialTemplate = (typeof SOCIAL_TEMPLATES)[number];

export const TEMPLATE_FORMATS: Record<SocialTemplate, readonly SocialFormat[]> = {
  affirmation: ["static", "story"],
  "photo-titre": ["static", "story"],
  "question-reponse": ["static", "story"],
  "liste-conseils": ["static"],
  "infos-pratiques": ["static"],
  avis: ["static"],
  "carrousel-etapes": ["carousel"],
  "carrousel-article": ["carousel"],
  "story-rappel": ["story"],
};

export const TEMPLATE_ACCEPTS_PHOTO: Record<SocialTemplate, boolean> = {
  "photo-titre": true,
  "carrousel-etapes": true,
  "carrousel-article": true,
  "story-rappel": true,
  affirmation: false,
  "question-reponse": false,
  "liste-conseils": false,
  "infos-pratiques": false,
  avis: false,
};

/** Template de repli quand celui rendu par le modèle est incompatible avec le format. */
export const SOCIAL_DEFAULT_TEMPLATE: Record<SocialFormat, SocialTemplate> = {
  static: "affirmation",
  carousel: "carrousel-etapes",
  story: "story-rappel",
};

export const SOCIAL_ACCENT_ROLES = ["primary", "primaryDark", "deep", "soft"] as const;
export type SocialAccentRole = (typeof SOCIAL_ACCENT_ROLES)[number];

/** Jours de publication de la cadence (ISO : 1 = lundi … 7 = dimanche) : mardi, vendredi. */
export const SOCIAL_POST_DAYS = [2, 5] as const;
/** Annonces « Nouvel article » (J+1) par mois, au plus. */
export const SOCIAL_NEW_ARTICLE_POSTS_MAX = 2;
/** Demandes « sur mesure » par site et mois civil (UTC). */
export const SOCIAL_REQUESTS_PER_MONTH = 20;
/** Entre dans la clé de cache des rendus : à incrémenter à chaque retouche visuelle. */
export const SOCIAL_TEMPLATE_VERSION = 1;
/** Couverture + ≤ 5 pages + CTA. */
export const SOCIAL_MAX_CAROUSEL_SLIDES = 7;

// ─── Voix (copie structurelle de BlogVoice, packages/ai/src/voice.ts) ────────

/**
 * Réglages « Votre voix » du blog, figés dans chaque contenu au moment de la
 * génération. Mêmes valeurs que `BlogVoice` (`@theralys/ai`) et que les enums
 * `voice_*` de la base — `shared` ne pouvant importer ni l'un ni l'autre.
 */
export type SocialVoice = {
  designation: "nous" | "je" | "on";
  accord: "feminin" | "masculin";
  reader: "vous" | "tu";
  tone: "chaleureux" | "rassurant" | "pose" | "direct" | "pedagogue";
};

export const DEFAULT_SOCIAL_VOICE: SocialVoice = {
  designation: "je",
  accord: "feminin",
  reader: "vous",
  tone: "chaleureux",
};

// ─── Types JSON stockés (social_posts.content / assets) ──────────────────────

export type SocialSlide = {
  role: "single" | "cover" | "page" | "cta";
  /** ≤ 60 caractères, sans gras */
  title: string;
  /** ≤ 200 (static/story) ou ≤ 160 (page de carrousel), 1 passage **gras**, lignes « - » (3 max) */
  body: string;
  /** ≤ 32 caractères */
  badge?: string;
  /** URL résolue depuis photosById (jamais envoyée au modèle) */
  imageUrl?: string;
};

export type SocialSourceRef = {
  kind: "section" | "page" | "article" | "review" | "request";
  /** ex. "section:home:faq:2", "page:<uuid>", "article:<uuid>" */
  id: string;
  /** « Page « Gestion du stress » », « Article « … » », « Avis Google de Marie D. » */
  label: string;
  /** Site public ou /publications/<id> */
  href?: string;
};

export type SocialPostContent = {
  pillar: SocialPillar;
  accentRole: SocialAccentRole;
  caption: string;
  hashtags: string[];
  altText: string;
  slides: SocialSlide[];
  sourceRefs: SocialSourceRef[];
  /** Adaptation d'une demande (requête) — « Nous avons adapté votre demande… » */
  note?: string;
  /** Instantané de la voix au moment de la génération */
  voice: SocialVoice;
  generator: "anthropic" | "mock";
};

export type SocialRender = {
  key: string;
  /** URL Blob (null = cache mémoire seul) */
  url: string | null;
  bytes: number;
  /** ISO 8601 */
  renderedAt: string;
};

/** Clé des rendus : `${size}:${slide}:${variant}`. */
export type SocialPostAssets = { version: number; renders: Record<string, SocialRender> };

export const EMPTY_SOCIAL_ASSETS: SocialPostAssets = { version: 1, renders: {} };

// ─── Créneaux du mois ────────────────────────────────────────────────────────

export type SocialSlot = {
  /** "YYYY-MM-DD" (UTC) */
  date: string;
  kind: "cadence" | "nouvel_article";
  /** Article annoncé (kind = nouvel_article) */
  articleId?: string;
};

export type SocialSlotsInput = {
  year: number;
  /** 1..12 */
  month: number;
  /** Instant courant (comparé en date UTC) */
  today: Date;
  /** Articles `scheduled`/`published` (filtrés par l'appelant) ; `publishAt` null ignoré */
  articles: { id: string; publishAt: Date | string | null }[];
};

/** "YYYY-MM-DD" d'une date, en UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Date UTC à minuit décalée de `days` jours. */
function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Bornes UTC d'un mois : [1er du mois, 1er du mois suivant[. */
export function monthRange(
  year: number,
  month: number,
): { start: Date; end: Date; startIso: string; endIso: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, startIso: isoDay(start), endIso: isoDay(end) };
}

/**
 * Créneaux d'un mois, triés par date :
 * - `cadence` : mardis et vendredis strictement postérieurs à `today` (UTC) ;
 * - `nouvel_article` : lendemain de `publishAt` de chaque article du mois (au
 *   plus 2, les plus récents), jamais le même jour qu'un créneau cadence
 *   (collision → J+2), toujours dans le mois et strictement après `today`.
 * Un mois passé n'a aucun créneau.
 */
export function socialSlotsForMonth(input: SocialSlotsInput): SocialSlot[] {
  const { startIso, endIso } = monthRange(input.year, input.month);
  const todayIso = isoDay(input.today);
  const inMonth = (day: string) => day >= startIso && day < endIso;

  const cadence: SocialSlot[] = [];
  const cadenceDays = new Set<string>();
  for (let day = startIso; day < endIso; day = shiftDay(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7; // ISO : dimanche = 7
    if (!(SOCIAL_POST_DAYS as readonly number[]).includes(weekday)) continue;
    if (day <= todayIso) continue;
    cadence.push({ date: day, kind: "cadence" });
    cadenceDays.add(day);
  }

  const candidates = input.articles
    .map((a) => {
      if (!a.publishAt) return null;
      const publishAt = a.publishAt instanceof Date ? a.publishAt : new Date(a.publishAt);
      if (Number.isNaN(publishAt.getTime())) return null;
      return { id: a.id, publishAt, day: isoDay(publishAt) };
    })
    .filter((a): a is { id: string; publishAt: Date; day: string } => a !== null)
    .filter((a) => inMonth(a.day))
    .sort((a, b) => b.publishAt.getTime() - a.publishAt.getTime());

  const articleSlots: SocialSlot[] = [];
  const taken = new Set<string>();
  for (const article of candidates) {
    if (articleSlots.length >= SOCIAL_NEW_ARTICLE_POSTS_MAX) break;
    let day = shiftDay(article.day, 1);
    if (cadenceDays.has(day)) day = shiftDay(day, 1);
    if (!inMonth(day) || day <= todayIso || taken.has(day)) continue;
    taken.add(day);
    articleSlots.push({ date: day, kind: "nouvel_article", articleId: article.id });
  }

  return [...cadence, ...articleSlots].sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Tailles ─────────────────────────────────────────────────────────────────

/**
 * Tailles proposées pour un contenu : celles du format, en retirant « story »
 * quand le template ne sait pas se rendre en vertical (liste-conseils,
 * infos-pratiques, avis, carrousels).
 */
export function sizesFor(format: SocialFormat, template: SocialTemplate): SocialSize[] {
  const allowed = TEMPLATE_FORMATS[template];
  return SIZES_FOR_FORMAT[format].filter(
    (size) => size !== "story" || format === "story" || allowed.includes("story"),
  );
}

// ─── Clé de cache des rendus ─────────────────────────────────────────────────

export type SocialAssetKeyInput = {
  /** SOCIAL_TEMPLATE_VERSION */
  v: number;
  size: SocialSize;
  slideIndex: number;
  /** "full" | "preview" … */
  variant: string;
  template: SocialTemplate;
  /** Hex de la couleur d'accent résolue */
  accent: string;
  /** themeCssVars(site.theme) */
  theme: Record<string, string>;
  logo: string | null;
  slide: SocialSlide;
  brand: { firstName: string; lastName: string; profession: string; city: string };
  domain: string;
};

/** JSON canonique : clés triées à tous les niveaux, `undefined` omis. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Charge utile (stable) de la clé de cache d'un rendu ; le hachage sha256 est
 * fait côté studio (`node:crypto`).
 */
export function socialAssetKeyPayload(input: SocialAssetKeyInput): string {
  return canonicalJson(input);
}
