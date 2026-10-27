/**
 * Contenus réseaux sociaux (studio) : contrat du générateur, schéma zod de la
 * sortie du modèle, règles sociales (anti-racolage), `finalizePlan` (sortie du
 * modèle → publications prêtes à insérer) et `createSocialGenerator` (modes
 * live et mock). Conception §3.2 à §3.10.
 */

import { z } from "zod";
import {
  REQUEST_SOURCE_REF,
  SOCIAL_ACCENT_ROLES,
  SOCIAL_DEFAULT_TEMPLATE,
  SOCIAL_FORMATS,
  SOCIAL_PILLARS,
  SOCIAL_TEMPLATES,
  TEMPLATE_ACCEPTS_PHOTO,
  TEMPLATE_FORMATS,
  describeSourceRef,
  normalizeHashtags,
  plainText,
  singleEmphasis,
  stripEmoji,
  truncateAtSentence,
  truncateAtWord,
  type SocialAccentRole,
  type SocialFormat,
  type SocialPillar,
  type SocialPostContent,
  type SocialSiteBrief,
  type SocialSlide,
  type SocialSlot,
  type SocialSourceRef,
  type SocialTemplate,
} from "@theralys/shared";
import { completeStructured, type AnthropicClientOptions } from "./anthropic";
import { resolveAiMode } from "./generate-site";
import { checkEthicalComplianceDeep, type GuardrailViolation } from "./guardrails";
import { mockSocialMonth, mockSocialRequest } from "./mock/social";
import {
  articleRefId,
  socialMonthUserPrompt,
  socialRequestUserPrompt,
  socialSystemPrompt,
  type SocialPromptVariant,
} from "./social-prompts";
import { voiceBricks, type BlogVoice } from "./voice";

// ─── Libellés écrits par le code (jamais par le modèle) ──────────────────────

/** Dernière diapositive d'un carrousel « étapes » (ajoutée par finalizePlan). */
export const SOCIAL_CTA_TITLE = "Envie d'en parler ?";
/** Dernière diapositive d'un carrousel « article ». */
export const SOCIAL_ARTICLE_CTA_TITLE = "L'article complet est sur mon site";
/** Idiome Instagram/Facebook, inséré dans chaque légende avant la signature. */
export const SOCIAL_BIO_LINE = "Pour prendre rendez-vous, le lien est dans ma bio.";
/** Badge imposé sur les créneaux « nouvel_article ». */
export const SOCIAL_NEW_ARTICLE_BADGE = "Nouvel article";

// ─── Entrées / sorties du générateur ─────────────────────────────────────────

/** Contexte commun aux deux modes (issu de buildSocialBrief + recentSocialTopics). */
export type SocialGenerationContext = {
  /** Topics + libellés de sourceRefs des 60 derniers jours (≤ 40) */
  recentTopics: string[];
  /** id photo (« p3 ») → URL, pour résoudre `imageRef` → `imageUrl` */
  photosById: Record<string, string>;
  /** id de source → libellé/lien, pour enrichir `sourceRefs` */
  refsById: Record<string, SocialSourceRef>;
};

export type SocialMonthInput = SocialGenerationContext & {
  /** "YYYY-MM" */
  month: string;
  /** Créneaux libres (socialSlotsForMonth − dates déjà occupées), dans l'ordre */
  slots: SocialSlot[];
};

export type SocialRequestInput = SocialGenerationContext & {
  /** Texte saisi dans la barre (déjà vérifié par checkEthicalCompliance) */
  topic: string;
  format: SocialFormat;
  /** Hex #rrggbb choisi par le praticien, null = automatique (accentRole) */
  accentHex: string | null;
  /** "YYYY-MM-DD" */
  scheduledFor: string;
};

/** Une publication prête à insérer dans `social_posts`. */
export type FinalizedPost = {
  /** "YYYY-MM-DD" */
  scheduledFor: string;
  format: SocialFormat;
  template: SocialTemplate;
  pillar: SocialPillar;
  /** ≤ 70 caractères, affiché dans le calendrier */
  topic: string;
  content: SocialPostContent;
};

export type SocialGenerator = {
  mode: "anthropic" | "mock";
  /** 1 appel, N posts finalisés (≥ 1 ; les créneaux manquants restent libres). */
  planMonth(brief: SocialSiteBrief, input: SocialMonthInput): Promise<FinalizedPost[]>;
  /** 1 appel, 1 post finalisé. */
  generateRequest(brief: SocialSiteBrief, input: SocialRequestInput): Promise<FinalizedPost>;
};

// ─── Schéma zod de la sortie du modèle (§3.3) ────────────────────────────────

/**
 * Bornes volontairement plus larges que les consignes du prompt (badge ≤ 32,
 * topic ≤ 70, altText ≤ 250, note ≤ 200, 2 à 5 pages, 1 à 6 sources) :
 * `finalizePlan` ramène tout aux limites éditoriales, on ne relance pas le
 * modèle pour quelques caractères de trop.
 */
const slideSchema = z.object({
  title: z.string().trim().min(2).max(90),
  body: z.string().trim().max(260).default(""),
  badge: z.string().trim().max(60).optional(),
  imageRef: z
    .string()
    .regex(/^p\d{1,2}$/)
    .optional(),
});

/**
 * Types de la sortie du modèle, déclarés explicitement (et non inférés de zod)
 * pour rester stables à travers l'import circulaire avec `mock/social.ts` ;
 * un garde-fou à la compilation vérifie qu'ils coïncident avec le schéma.
 */
export type SocialSlideDraft = { title: string; body: string; badge?: string; imageRef?: string };
export type SocialPostDraft = {
  /** Index du créneau (mois) */
  slot?: number;
  pillar: SocialPillar;
  format: SocialFormat;
  template: SocialTemplate;
  accentRole: SocialAccentRole;
  topic: string;
  slides: SocialSlideDraft[];
  caption: string;
  hashtags: string[];
  altText: string;
  sourceRefs: string[];
  note?: string;
};
export type SocialPlan = { posts: SocialPostDraft[] };

export const socialPostSchema = z.object({
  /** Index du créneau (mois) */
  slot: z.number().int().min(0).max(15).optional(),
  pillar: z.enum(SOCIAL_PILLARS),
  format: z.enum(SOCIAL_FORMATS),
  template: z.enum(SOCIAL_TEMPLATES),
  accentRole: z.enum(SOCIAL_ACCENT_ROLES).default("primary"),
  topic: z.string().trim().min(5).max(120),
  /** Carrousel : couverture + pages (finalizePlan garde 5 pages au plus), la CTA est ajoutée par le code */
  slides: z.array(slideSchema).min(1).max(8),
  caption: z.string().trim().min(120).max(2200),
  hashtags: z.array(z.string().trim().min(2).max(42)).min(3).max(10),
  altText: z.string().trim().min(10).max(500),
  sourceRefs: z.array(z.string().trim().min(3).max(120)).min(1).max(12),
  note: z.string().trim().max(300).optional(),
});

/**
 * L'échec du `superRefine` (marketing interdit) fait échouer `schema.parse`
 * → `completeStructured` relance une fois avec le message en feedback.
 */
function planSchema<P extends z.ZodTypeAny>(post: P) {
  return z.object({ posts: z.array(post).min(1).max(12) }).superRefine((plan, ctx) => {
    const { ok, violations } = checkSocialCompliance(plan);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Marketing social interdit : ${violations
          .slice(0, 3)
          .map((v) => `[${v.rule}] ${v.excerpt}`)
          .join(" | ")}`.slice(0, 220),
      });
    }
  });
}

export const socialPlanSchema = planSchema(socialPostSchema);

/**
 * Posts de la fiche Google : même sortie, mais sans hashtag obligatoire (le
 * prompt demande un tableau vide ; `toGooglePost` ignore de toute façon les
 * hashtags et retire ceux glissés dans le texte).
 */
export const googlePlanSchema = planSchema(
  socialPostSchema.extend({ hashtags: z.array(z.string().trim().min(2).max(42)).max(10) }),
);

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _planMatchesSchema: MutuallyAssignable<z.infer<typeof socialPlanSchema>, SocialPlan> = true;
void _planMatchesSchema;

// ─── Règles sociales (§3.8) — même forme que FORBIDDEN_PATTERNS ──────────────

export const SOCIAL_FORBIDDEN_PATTERNS: { rule: string; pattern: RegExp }[] = [
  { rule: "avant/après", pattern: /\bavant\s*\/\s*apr[èe]s\b/gi },
  {
    rule: "promesse chiffrée",
    pattern: /\b\d+\s*s[ée]ances?\s+(suffisent|pour\s+(retrouver|ne\s+plus|en\s+finir))/gi,
  },
  {
    rule: "taux de réussite",
    pattern: /\b\d{2,3}\s*%\s*(de\s+r[ée]ussite|des\s+(patients|clients)|efficace)/gi,
  },
  { rule: "réduction", pattern: /-\s?\d{1,2}\s?%/g },
  { rule: "perte de poids", pattern: /\bperte\s+de\s+poids\b|\bmaigrir\b|\bminceur\b/gi },
  { rule: "innocuité", pattern: /\bsans\s+effets?\s+secondaires?\b/gi },
  {
    rule: "urgence commerciale",
    pattern: /\bderni[èe]res?\s+places?\b|\boffre\s+limit[ée]e\b|\bpromo(?:tion)?s?\b|\burgent\b/gi,
  },
  {
    rule: "promesse excessive",
    pattern: /\btransforme[zr]?\s+(votre|ta)\s+vie\b|\bsecret\b|\ble\s+meilleur\b|\bla\s+meilleure\b/gi,
  },
  { rule: "majuscules criées", pattern: /\b[A-ZÉÈÀ]{4,}\s+[A-ZÉÈÀ]{4,}\b/g },
];

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

/**
 * Vérifie récursivement toutes les chaînes d'une structure : règles sociales
 * (ci-dessus) + marketing éthique (checkEthicalComplianceDeep).
 */
export function checkSocialCompliance(value: unknown): {
  ok: boolean;
  violations: GuardrailViolation[];
} {
  const texts: string[] = [];
  collectStrings(value, texts);
  const text = texts.join("\n");
  const violations: GuardrailViolation[] = [];
  for (const { rule, pattern } of SOCIAL_FORBIDDEN_PATTERNS) {
    // Regex avec flag g : réinitialiser lastIndex avant chaque usage
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      violations.push({ rule, excerpt: `…${text.slice(start, end)}…` });
      if (violations.length > 20) return { ok: false, violations };
    }
  }
  const ethical = checkEthicalComplianceDeep(value);
  violations.push(...ethical.violations);
  return { ok: violations.length === 0, violations };
}

/**
 * Brief prêt pour la génération : les avis dont le texte enfreint une règle
 * sociale ou éthique (« le meilleur », majuscules criées, « traitement »…)
 * sont écartés — cités mot pour mot, ils feraient échouer la vérification du
 * mois entier. Le pilier « avis » n'est alors proposé que s'il en reste
 * (`availablePillars` lit `brief.reviews`), et un `review:` écarté n'est plus
 * un avis valide pour `finalizePlan`.
 */
export function sanitizeSocialBrief(brief: SocialSiteBrief): SocialSiteBrief {
  const reviews = brief.reviews.filter((r) => checkSocialCompliance(r.text).ok);
  return reviews.length === brief.reviews.length ? brief : { ...brief, reviews };
}

// ─── Textes écrits par le code ───────────────────────────────────────────────

const NUMBER_WORDS = ["", "une", "deux", "trois", "quatre", "cinq", "six", "sept"];

/** « 3 » → « trois » (au-delà de sept : le chiffre). */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export type SocialAltTextSlide = { title: string; body: string; hasPhoto: boolean };

/**
 * Texte alternatif écrit par le code à partir des diapositives finales : il ne
 * décrit que ce qui est réellement rendu (photo présente ou non, nombre de
 * points d'une liste, note réelle de l'avis cité). Employé par le mock et par
 * `finalizePlan` dès que le template, la photo ou la citation d'un brouillon
 * ont changé — le texte du modèle décrirait alors un visuel qui n'existe plus.
 */
export function socialAltText(
  template: SocialTemplate,
  slides: SocialAltTextSlide[],
  brand: { firstName: string; profession: string },
  opts: { reviewRating?: number; total?: number } = {},
): string {
  const first = slides[0];
  const title = first?.title ?? "";
  const signature = `${brand.firstName}, ${brand.profession.toLowerCase()}`;
  const total = opts.total ?? slides.length;
  const bullets = (first?.body ?? "").split("\n").filter((l) => /^- /.test(l)).length;
  switch (template) {
    case "photo-titre":
      return `Photo d'ambiance avec, en surimpression, le titre « ${title} » et la signature ${signature}.`;
    case "affirmation":
      return `Texte « ${title} » sur un fond de couleur dégradé, signé ${signature}.`;
    case "question-reponse":
      return `Question « ${title} » suivie de sa réponse courte, sur fond clair.`;
    case "liste-conseils":
      return `Titre « ${title} » et une liste de ${bullets >= 2 ? `${numberWord(bullets)} points numérotés` : "repères"}, signée ${signature}.`;
    case "infos-pratiques":
      return `Encadré « ${title} » listant les informations pratiques du cabinet de ${signature}.`;
    case "avis":
      return `Avis Google ${opts.reviewRating ? `${numberWord(opts.reviewRating)} étoiles ` : ""}cité entre guillemets, suivi du prénom de son auteur.`;
    case "carrousel-etapes":
      return `Carrousel de ${total} pages : couverture « ${title} »${first?.hasPhoto ? " sur photo" : ""}, étapes numérotées, puis invitation à prendre rendez-vous.`;
    case "carrousel-article":
      return `Carrousel de ${total} pages résumant l'article « ${title} »${first?.hasPhoto ? ", avec sa photo de couverture" : ""}.`;
    case "story-rappel":
      return `Story verticale : ${first?.hasPhoto ? "photo" : "dégradé de couleur"} en haut, titre « ${title} » et pastille « Lien dans ma bio ».`;
  }
}

/** Body de la diapositive CTA : « Je vous accueille sur rendez-vous à Albi. », accordé à la voix. */
export function socialWelcomeLine(voice: BlogVoice, city: string): string {
  const b = voiceBricks(voice);
  const verb = b.subj(
    b.reader("Je vous accueille", "Je t'accueille"),
    b.reader("Nous vous accueillons", "Nous t'accueillons"),
    b.reader("On vous accueille", "On t'accueille"),
  );
  return `${verb} **sur rendez-vous** à ${city}.`;
}

// ─── finalizePlan (§3.4) ─────────────────────────────────────────────────────

export type FinalizeInput = (
  | ({ kind: "month" } & SocialMonthInput)
  | ({ kind: "request" } & SocialRequestInput)
) & {
  /** Recopié dans content.generator */
  generator: SocialPostContent["generator"];
};

/** Limites appliquées aux textes (les bornes zod sont plus larges). */
const TITLE_MAX = 60;
const AVIS_TITLE_MAX = 90;
/** Citation entre « » dans un titre « avis » (AVIS_TITLE_MAX − 4) */
const AVIS_QUOTE_MAX = 86;
const BODY_MAX = 200;
const CAROUSEL_BODY_MAX = 160;
const BADGE_MAX = 32;
const TOPIC_MAX = 70;
const ALT_MAX = 300;
const NOTE_MAX = 200;
const CAPTION_MAX = 2000;
const CAPTION_FIRST_LINE_MAX = 125;
const CAPTION_EMOJI_MAX = 3;
const BULLETS_MAX = 3;
const CAROUSEL_PAGES_MAX = 5;

const CAROUSEL_INCOMPLETE = "carrousel incomplet";
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const BULLET_LINE_RE = /^\s*(?:[-•*]|✅|\d{1,2}[.)])\s+/u;
const EMOJI_SEQ_RE =
  /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(?:\u{FE0F}|\u{200D}\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\u{20E3})*/gu;
const HASHTAG_IN_TEXT_RE = /(^|[\s(«"'])#([\p{L}\p{N}_]{2,})/gu;

/** Texte d'une ligne : emojis, liens et gras retirés, espaces normalisés. */
function cleanInline(text: string): string {
  return stripEmoji(text)
    .replace(/\u202f/g, "\u00a0")
    .replace(LINK_RE, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(text: string, max: number): string {
  return truncateAtWord(cleanInline(text), max);
}

/** Lignes « - » au-delà de `max` supprimées (les autres lignes sont conservées). */
function limitBullets(lines: string[], max: number): string[] {
  let count = 0;
  return lines.filter((line) => {
    if (!BULLET_LINE_RE.test(line)) return true;
    count += 1;
    return count <= max;
  });
}

/** Un `**` dépareillé après troncature : refermé avant « … », sinon retiré. */
function closeEmphasis(text: string): string {
  const count = (text.match(/\*\*/g) ?? []).length;
  if (count % 2 === 0) return text;
  if (text.endsWith("…")) {
    const head = text.slice(0, -1).trimEnd();
    if (head.endsWith("**")) return `${head.slice(0, -2).trimEnd()}…`;
    return `${head}**…`;
  }
  const idx = text.lastIndexOf("**");
  return text.slice(0, idx) + text.slice(idx + 2);
}

/**
 * Body d'une diapositive : stripEmoji, U+202F → U+00A0, liens aplatis, un
 * seul passage gras, lignes « - » ≤ 3, troncature au mot.
 */
function cleanBody(text: string, max: number): string {
  const lines = stripEmoji(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u202f/g, "\u00a0")
    .replace(LINK_RE, "$1")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l !== "");
  const joined = limitBullets(lines, BULLETS_MAX).join("\n");
  return closeEmphasis(truncateAtWord(singleEmphasis(joined), max));
}

/** Au plus `max` emojis conservés (les suivants sont retirés). */
function limitEmoji(text: string, max: number): string {
  let seen = 0;
  return text
    .replace(EMOJI_SEQ_RE, (m) => (++seen <= max ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+(\n|$)/g, "$1");
}

/** ≤ `max` caractères, coupés à la dernière fin de phrase. */
function clampCaption(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  let cut = -1;
  const re = /[.!?…»]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) cut = m.index + 1;
  return cut > max / 2 ? head.slice(0, cut).trim() : truncateAtWord(head, max);
}

/** Dernière position de coupure (fin de `marker`) ≤ `max`, ou -1. */
function lastBreakWithin(text: string, marker: RegExp, max: number): number {
  let best = -1;
  let m: RegExpExecArray | null;
  marker.lastIndex = 0;
  while ((m = marker.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end <= max) best = end;
    else break;
  }
  return best;
}

/**
 * Première ligne > `max` : coupée à la phrase (sinon à la virgule, sinon au
 * mot), la suite passe dans un nouveau paragraphe — rien n'est perdu.
 */
function breakFirstLine(text: string, max: number): string {
  const nl = text.indexOf("\n");
  const first = nl === -1 ? text : text.slice(0, nl);
  const rest = nl === -1 ? "" : text.slice(nl);
  if (first.length <= max) return text;
  let cut = lastBreakWithin(first, /[.!?…](?=\s)/g, max);
  if (cut <= 0) cut = lastBreakWithin(first, /[,;:](?=\s)/g, max);
  if (cut <= 0) cut = first.lastIndexOf(" ", max);
  if (cut <= 0) return text;
  const head = first.slice(0, cut).trimEnd();
  const tail = first.slice(cut).trimStart();
  return `${head}\n\n${tail}${rest}`;
}

/**
 * Légende : markdown retiré, hashtags déplacés (renvoyés), ≤ 3 emojis,
 * ≤ 2 000 caractères, première ligne ≤ 125.
 */
function cleanCaption(raw: string): { caption: string; hashtags: string[] } {
  const hashtags: string[] = [];
  const text = plainText(raw)
    .replace(HASHTAG_IN_TEXT_RE, (_m, pre: string, tag: string) => {
      hashtags.push(`#${tag}`);
      return pre;
    })
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const caption = breakFirstLine(
    clampCaption(limitEmoji(text, CAPTION_EMOJI_MAX), CAPTION_MAX),
    CAPTION_FIRST_LINE_MAX,
  );
  return { caption, hashtags };
}

/** Tous les ids de sources présents dans le brief (en plus de `refsById`). */
function briefRefIds(brief: SocialSiteBrief): Set<string> {
  const ids = new Set<string>(["section:home:hero"]);
  const { home } = brief;
  for (const h of home.highlights) ids.add(h.id);
  for (const s of home.specialties) {
    ids.add(s.id);
    if (s.pageId) ids.add(s.pageId);
  }
  if (home.future) ids.add(home.future.id);
  if (home.about) ids.add(home.about.id);
  for (const c of home.infoCards) ids.add(c.id);
  for (const p of home.process) ids.add(p.id);
  for (const f of home.faq) ids.add(f.id);
  if (home.contact) ids.add(home.contact.id);
  for (const p of brief.motifPages) {
    ids.add(p.id);
    for (const f of p.faq) ids.add(f.id);
  }
  for (const a of brief.articles) ids.add(a.id);
  for (const r of brief.reviews) ids.add(r.id);
  return ids;
}

/** Photo associée à une source (spécialité, page de motif, article), pour un repli. */
function photoOfRef(brief: SocialSiteBrief, id: string): string | undefined {
  const spec = brief.home.specialties.find((s) => s.id === id || s.pageId === id);
  if (spec?.photoId) return spec.photoId;
  const page = brief.motifPages.find((p) => p.id === id || p.id === spec?.pageId);
  if (page?.photoId) return page.photoId;
  return brief.articles.find((a) => a.id === id)?.photoId;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SlideContext = {
  brief: SocialSiteBrief;
  photosById: Record<string, string>;
  template: SocialTemplate;
  pillar: SocialPillar;
};

/**
 * `imageRef` → URL : inconnu, template sans photo, ou photo non
 * « portraitSafe » employée pour représenter le praticien (piliers coulisses /
 * infos_pratiques, badge « qui je suis » / « votre <métier> ») → retirée.
 */
function resolvePhoto(ref: string | undefined, badge: string | undefined, ctx: SlideContext): string | undefined {
  if (!ref || !TEMPLATE_ACCEPTS_PHOTO[ctx.template]) return undefined;
  const url = ctx.photosById[ref];
  if (!url) return undefined;
  const meta = ctx.brief.photos.find((p) => p.id === ref);
  if (!meta?.portraitSafe) {
    if (ctx.pillar === "coulisses" || ctx.pillar === "infos_pratiques") return undefined;
    const profession = escapeRegExp(ctx.brief.practitioner.profession.toLowerCase());
    const portraitBadge = new RegExp(
      `qui\\s+(?:je\\s+suis|suis-je)|(?:votre|ton|ta|vos)\\s+(?:${profession}|praticien|praticienne)`,
      "i",
    );
    if (badge && portraitBadge.test(badge)) return undefined;
  }
  return url;
}

function finalizeSlide(
  draft: SocialSlideDraft,
  role: SocialSlide["role"],
  ctx: SlideContext,
  opts: { titleMax: number; bodyMax: number; photo: boolean; badge?: string; imageRef?: string },
): SocialSlide {
  const badgeText = opts.badge ?? draft.badge;
  const badge = badgeText ? cleanTitle(badgeText, BADGE_MAX) : "";
  const imageUrl = opts.photo ? resolvePhoto(opts.imageRef ?? draft.imageRef, badge, ctx) : undefined;
  const title = cleanTitle(draft.title, opts.titleMax);
  return {
    role,
    title: title === "" ? "…" : title,
    body: cleanBody(draft.body, opts.bodyMax),
    ...(badge !== "" ? { badge } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** Diapositives de repli « projection » (titre du site) quand un avis n'est pas exploitable. */
function heroDrafts(brief: SocialSiteBrief, format: SocialFormat): SocialSlideDraft[] {
  const hero = brief.home.hero;
  const title = hero?.title ?? brief.siteName;
  const body = hero?.paragraphs[0] ?? "";
  if (format !== "carousel") return [{ title, body }];
  const pages = (brief.home.future?.lines ?? brief.home.process.map((p) => p.description)).slice(0, 3);
  return [{ title, body }, ...(pages.length > 0 ? pages : [body || title]).map((p) => ({ title: truncateAtWord(p, 60), body: "" }))];
}

type PostContext = {
  brief: SocialSiteBrief;
  photosById: Record<string, string>;
  refsById: Record<string, SocialSourceRef>;
  knownRefs: Set<string>;
  generator: SocialPostContent["generator"];
  isRequest: boolean;
};

type PostFrame = {
  scheduledFor: string;
  format: SocialFormat;
  /** Créneau « nouvel_article » : pilier/template/badge/article imposés */
  newArticleId?: string;
  /** Avis en double ou sans avis valide : devient projection/affirmation */
  forceProjection: boolean;
};

/** Avis du brief référencé par le brouillon (`review:<id>` dans sourceRefs), s'il existe. */
function reviewOf(draft: SocialPostDraft, brief: SocialSiteBrief): SocialSiteBrief["reviews"][number] | undefined {
  for (const id of draft.sourceRefs) {
    if (!id.startsWith("review:")) continue;
    const review = brief.reviews.find((r) => r.id === id);
    if (review) return review;
  }
  return undefined;
}

function isAvisDraft(draft: SocialPostDraft): boolean {
  return draft.pillar === "avis" || draft.template === "avis";
}

/**
 * Pilier effectif après les règles « avis » (évalué avant le mix) : un
 * brouillon qui cite un avis valide est un « avis » quel que soit le pilier
 * déclaré (la citation n'est jamais perdue) ; sans avis valide (démo, avis
 * inconnu ou écarté, second avis du mois) il devient « projection ».
 */
function effectivePillar(draft: SocialPostDraft, frame: PostFrame, brief: SocialSiteBrief): SocialPillar {
  if (frame.newArticleId) return "nouvel_article";
  if (frame.forceProjection) return "projection";
  if (isAvisDraft(draft)) return reviewOf(draft, brief) ? "avis" : "projection";
  return draft.pillar;
}

/** Apostrophes, espaces insécables et espaces multiples normalisés (comparaison d'une citation à son avis). */
function normalizeQuote(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** Citation d'un titre « avis », sans guillemets ni « … » final. */
function quoteCore(title: string): string {
  return normalizeQuote(
    cleanInline(title)
      .replace(/^[«"“]\s*/, "")
      .replace(/\s*[»"”]$/, "")
      .replace(/…$/, ""),
  );
}

/**
 * Diapositive du template « avis » écrite par le code : citation par phrases
 * entières (≤ 86 caractères, jamais coupée en pleine phrase quand une phrase
 * tient) et signature « Prénom I. · Avis Google ».
 */
export function reviewSlide(review: { authorName: string; text: string }): SocialSlideDraft {
  return {
    title: `« ${truncateAtSentence(review.text, AVIS_QUOTE_MAX, 0.3)} »`,
    body: `${review.authorName} · Avis Google`,
  };
}

function finalizeOne(draft: SocialPostDraft, frame: PostFrame, ctx: PostContext): FinalizedPost {
  const { brief } = ctx;
  const format = frame.format;
  let pillar = effectivePillar(draft, frame, brief);
  let template: SocialTemplate = draft.template;
  let slidesIn: SocialSlideDraft[] = draft.slides;
  let refIds: string[] = draft.sourceRefs;
  // Le texte alternatif du modèle n'est gardé que si le visuel qu'il décrit est bien celui rendu
  let altFromCode = false;

  // Avis non exploitable (démo, avis inconnu ou écarté, second avis du mois) → projection sur le titre du site
  const avisDraft = isAvisDraft(draft);
  const review = avisDraft ? reviewOf(draft, brief) : undefined;
  const projection = avisDraft && pillar === "projection";
  if (projection) {
    template = SOCIAL_DEFAULT_TEMPLATE[format];
    slidesIn = heroDrafts(brief, format);
    refIds = ["section:home:hero"];
    altFromCode = true;
  } else if (template === "avis" && review && format === "static") {
    // La citation doit être un passage exact de l'avis ; sinon le code la réécrit depuis l'avis lui-même
    const first = slidesIn[0];
    const core = first ? quoteCore(first.title) : "";
    const faithful = first !== undefined && core.length >= 10 && normalizeQuote(review.text).includes(core);
    slidesIn = [faithful ? { ...first, body: `${review.authorName} · Avis Google` } : reviewSlide(review)];
    refIds = [...new Set([review.id, ...refIds])];
    altFromCode = true;
  }
  if (frame.newArticleId) {
    pillar = "nouvel_article";
    template = "photo-titre";
    refIds = [...new Set([frame.newArticleId, ...refIds])];
  }
  // Template incompatible avec le format → défaut du format
  if (!TEMPLATE_FORMATS[template].includes(format)) template = SOCIAL_DEFAULT_TEMPLATE[format];

  // Diapositives
  const slideCtx: SlideContext = { brief, photosById: ctx.photosById, template, pillar };
  const titleMax = template === "avis" ? AVIS_TITLE_MAX : TITLE_MAX;
  let slides: SocialSlide[];
  let fallbackRef: string | undefined;
  if (format === "carousel") {
    if (slidesIn.length < 2) throw new Error(CAROUSEL_INCOMPLETE);
    const [cover, ...pages] = slidesIn.slice(0, 1 + CAROUSEL_PAGES_MAX);
    slides = [
      finalizeSlide(cover!, "cover", slideCtx, { titleMax, bodyMax: CAROUSEL_BODY_MAX, photo: true }),
      ...pages.map((p) => finalizeSlide(p, "page", slideCtx, { titleMax, bodyMax: CAROUSEL_BODY_MAX, photo: false })),
      {
        role: "cta",
        title: template === "carrousel-article" ? SOCIAL_ARTICLE_CTA_TITLE : SOCIAL_CTA_TITLE,
        body: socialWelcomeLine(brief.voice, brief.practitioner.city),
      },
    ];
  } else {
    const first = slidesIn[0];
    if (!first) throw new Error("diapositive manquante");
    fallbackRef = template === "photo-titre" && !first.imageRef
      ? refIds.map((id) => photoOfRef(brief, id)).find((id): id is string => id !== undefined)
      : undefined;
    slides = [
      finalizeSlide(first, "single", slideCtx, {
        titleMax,
        bodyMax: BODY_MAX,
        photo: true,
        ...(frame.newArticleId ? { badge: SOCIAL_NEW_ARTICLE_BADGE } : {}),
        ...(fallbackRef ? { imageRef: fallbackRef } : {}),
      }),
    ];
  }
  // Template photo sans photo résolue → variante sans photo
  if (template === "photo-titre" && !slides[0]?.imageUrl) template = "affirmation";

  // Texte alternatif : template rétrogradé, photo retirée (ou ajoutée en repli), citation réécrite → écrit par le code
  const draftHadPhoto = TEMPLATE_ACCEPTS_PHOTO[draft.template] && Boolean(slidesIn[0]?.imageRef ?? fallbackRef);
  const hasPhoto = Boolean(slides[0]?.imageUrl);
  if (template !== draft.template || draftHadPhoto !== hasPhoto) altFromCode = true;
  const altText = cleanTitle(
    altFromCode
      ? socialAltText(
          template,
          slides.map((s) => ({ title: s.title, body: s.body, hasPhoto: Boolean(s.imageUrl) })),
          brief.practitioner,
          review ? { reviewRating: review.rating } : {},
        )
      : draft.altText,
    ALT_MAX,
  );

  // Légende, hashtags, textes courts
  const { caption, hashtags: moved } = cleanCaption(draft.caption);
  const { profession, city } = brief.practitioner;
  const hashtags = normalizeHashtags([...draft.hashtags, ...moved], { profession, city });
  // Repli projection : le sujet du calendrier suit le contenu réellement rendu, pas l'avis abandonné
  const topic = (projection ? slides[0]?.title : cleanTitle(draft.topic, TOPIC_MAX)) || slides[0]?.title || "Publication";
  const note = draft.note ? cleanTitle(draft.note, NOTE_MAX) : "";

  // Sources : ids inconnus retirés, vide → accueil, enrichis, requête → « Votre demande »
  const seen = new Set<string>();
  const sourceRefs: SocialSourceRef[] = [];
  for (const id of refIds) {
    if (!ctx.knownRefs.has(id) || seen.has(id)) continue;
    seen.add(id);
    sourceRefs.push(describeSourceRef(id, ctx.refsById));
  }
  if (sourceRefs.length === 0) sourceRefs.push(describeSourceRef("section:home:hero", ctx.refsById));
  if (ctx.isRequest && !seen.has(REQUEST_SOURCE_REF.id)) sourceRefs.push(REQUEST_SOURCE_REF);

  return {
    scheduledFor: frame.scheduledFor,
    format,
    template,
    pillar,
    topic,
    content: {
      pillar,
      accentRole: draft.accentRole,
      caption,
      hashtags,
      altText,
      slides,
      sourceRefs: sourceRefs.slice(0, 7),
      ...(note !== "" ? { note } : {}),
      voice: brief.voice,
      generator: ctx.generator,
    },
  };
}

type Assigned = { slot: SocialSlot; draft: SocialPostDraft; frame: PostFrame };

/**
 * Posts réaffectés aux créneaux : par `slot` quand l'index est valide et
 * libre, sinon dans l'ordre sur les créneaux restants ; surplus ignoré.
 */
function assignSlots(posts: SocialPostDraft[], slots: SocialSlot[]): Assigned[] {
  const bySlot = new Map<number, SocialPostDraft>();
  const pending: SocialPostDraft[] = [];
  for (const post of posts) {
    const index = post.slot;
    if (index !== undefined && index < slots.length && !bySlot.has(index)) bySlot.set(index, post);
    else pending.push(post);
  }
  for (let i = 0; i < slots.length && pending.length > 0; i++) {
    if (!bySlot.has(i)) bySlot.set(i, pending.shift()!);
  }
  return slots.flatMap((slot, i) => {
    const draft = bySlot.get(i);
    if (!draft) return [];
    const frame: PostFrame = {
      scheduledFor: slot.date,
      format: slot.kind === "nouvel_article" ? "static" : draft.format,
      ...(slot.kind === "nouvel_article" && slot.articleId ? { newArticleId: articleRefId(slot.articleId) } : {}),
      forceProjection: false,
    };
    return [{ slot, draft, frame }];
  });
}

/** Mix du mois : au plus un avis, jamais deux piliers consécutifs identiques (échange si possible). */
function applyMix(items: Assigned[], brief: SocialSiteBrief): void {
  let avisSeen = false;
  for (const item of items) {
    if (effectivePillar(item.draft, item.frame, brief) !== "avis") continue;
    if (avisSeen) item.frame.forceProjection = true;
    avisSeen = true;
  }
  const pillarOf = (item: Assigned) => effectivePillar(item.draft, item.frame, brief);
  const fixed = (item: Assigned) => item.slot.kind === "nouvel_article";
  for (let i = 1; i < items.length; i++) {
    const current = items[i]!;
    const previous = items[i - 1]!;
    if (pillarOf(current) !== pillarOf(previous) || fixed(current)) continue;
    for (let j = i + 1; j < items.length; j++) {
      const candidate = items[j]!;
      if (fixed(candidate) || pillarOf(candidate) === pillarOf(previous)) continue;
      // Après échange, `current` occupe la position j : ses voisins ne doivent pas lui ressembler
      const left = j - 1 === i ? candidate : items[j - 1]!;
      const right = items[j + 1];
      if (pillarOf(left) === pillarOf(current) || (right && pillarOf(right) === pillarOf(current))) continue;
      const swapped: Assigned = { slot: current.slot, draft: candidate.draft, frame: { ...candidate.frame, scheduledFor: current.slot.date } };
      items[j] = { slot: candidate.slot, draft: current.draft, frame: { ...current.frame, scheduledFor: candidate.slot.date } };
      items[i] = swapped;
      break;
    }
  }
}

/**
 * Transforme la sortie validée du modèle en publications prêtes à insérer
 * (pure, testée). Étapes (conception §3.4) :
 * 1. dates/format jamais pris dans la sortie (mois : réaffectation aux `slots`
 *    par `slot` si cohérent, sinon dans l'ordre, surplus ignoré, créneau
 *    nouvel_article → pilier/template forcés ; requête : `scheduledFor` et
 *    `format` imposés) ;
 * 2. template incompatible avec le format → SOCIAL_DEFAULT_TEMPLATE ; `avis`
 *    sans `review:` valide → projection/`affirmation` (un avis valide impose le
 *    pilier avis) ; citation d'avis qui n'est pas un passage exact de l'avis →
 *    réécrite par le code (phrases entières) ; template photo sans photo →
 *    variante sans photo ;
 * 3. diapositives : rôles (single / cover + page… / cta ajoutée par le code
 *    avec SOCIAL_CTA_TITLE ou SOCIAL_ARTICLE_CTA_TITLE), < 2 reçues pour un
 *    carrousel → erreur « carrousel incomplet » (requête) ou post écarté (mois) ;
 * 4. texte : stripEmoji, singleEmphasis, liens aplatis, truncateAtWord
 *    (title 60 / body 200 ou 160), listes ≤ 3 lignes ;
 * 5. légende : markdown retiré, ≤ 2 000 car., ≤ 3 emojis, première ligne ≤ 125,
 *    hashtags déplacés vers `hashtags` ;
 * 6. normalizeHashtags ; 7. photos (imageRef → imageUrl via photosById,
 *    portraitSafe) ; altText réécrit par le code (socialAltText) dès que le
 *    template, la photo ou la citation ont changé ; 8. sourceRefs (ids inconnus retirés, vide → section:home:hero,
 *    enrichis via refsById, requête → REQUEST_SOURCE_REF) ; 9. mix (piliers
 *    consécutifs, ≤ 1 avis) ; 10. accentRole conservé ; 11. `generator` recopié.
 */
export function finalizePlan(
  plan: SocialPlan,
  brief: SocialSiteBrief,
  input: FinalizeInput,
): FinalizedPost[] {
  const knownRefs = briefRefIds(brief);
  for (const id of Object.keys(input.refsById)) knownRefs.add(id);
  const ctx: PostContext = {
    brief,
    photosById: input.photosById,
    refsById: input.refsById,
    knownRefs,
    generator: input.generator,
    isRequest: input.kind === "request",
  };

  if (input.kind === "request") {
    const draft = plan.posts[0];
    if (!draft) throw new Error("aucune publication rendue");
    const frame: PostFrame = { scheduledFor: input.scheduledFor, format: input.format, forceProjection: false };
    return [finalizeOne(draft, frame, ctx)];
  }

  const items = assignSlots(plan.posts, input.slots);
  applyMix(items, brief);
  const out: FinalizedPost[] = [];
  for (const item of items) {
    try {
      out.push(finalizeOne(item.draft, item.frame, ctx));
    } catch (err) {
      // Un carrousel incomplet est écarté (son créneau reste libre) plutôt que de perdre tout le mois
      if (err instanceof Error && err.message === CAROUSEL_INCOMPLETE && items.length > 1) continue;
      throw err;
    }
  }
  if (out.length === 0) throw new Error("aucune publication exploitable");
  return out;
}

// ─── createSocialGenerator (§3.2, §3.9, §3.10) ───────────────────────────────

/**
 * Mode mock : une publication non conforme (texte du site cité tel quel qui
 * enfreint une règle) est écartée — son créneau reste libre — plutôt que de
 * perdre tout le mois ; erreur seulement s'il ne reste rien.
 */
export function keepCompliant(posts: FinalizedPost[]): FinalizedPost[] {
  const kept = posts.filter((post) => checkSocialCompliance(post).ok);
  if (kept.length === 0) {
    const { violations } = checkSocialCompliance(posts);
    throw new Error(`Contenu social mock non conforme : [${violations[0]?.rule}] ${violations[0]?.excerpt}`);
  }
  return kept;
}

/**
 * Générateur de contenus réseaux sociaux : mode choisi par `resolveAiMode(env)`.
 * Dans les deux modes, le brief est d'abord assaini (`sanitizeSocialBrief` :
 * avis non conformes écartés). Mode live : completeStructured({ apiKey, model,
 * effort: "medium" }, socialSystemPrompt(brief), socialMonthUserPrompt /
 * socialRequestUserPrompt, socialPlanSchema) puis finalizePlan. Mode mock :
 * mock/social.ts puis finalizePlan puis checkSocialCompliance post par post
 * (publication fautive écartée, throw seulement si aucune ne reste).
 */
export function createSocialGenerator(env: NodeJS.ProcessEnv = process.env): SocialGenerator {
  const mode = resolveAiMode(env);
  if (mode === "mock") {
    return {
      mode,
      planMonth: async (rawBrief, input) => {
        const brief = sanitizeSocialBrief(rawBrief);
        return keepCompliant(
          finalizePlan(mockSocialMonth(brief, input), brief, { kind: "month", ...input, generator: "mock" }),
        );
      },
      generateRequest: async (rawBrief, input) => {
        const brief = sanitizeSocialBrief(rawBrief);
        const [post] = keepCompliant(
          finalizePlan(mockSocialRequest(brief, input), brief, { kind: "request", ...input, generator: "mock" }),
        );
        return post!;
      },
    };
  }
  const options: AnthropicClientOptions = {
    apiKey: env.ANTHROPIC_API_KEY!,
    model: env.ANTHROPIC_MODEL,
    effort: "medium",
  };
  return {
    mode,
    planMonth: async (rawBrief, input) => {
      const brief = sanitizeSocialBrief(rawBrief);
      const plan = await completeSocialPlan(options, brief, socialMonthUserPrompt(brief, input));
      return finalizePlan(plan, brief, { kind: "month", ...input, generator: "anthropic" });
    },
    generateRequest: async (rawBrief, input) => {
      const brief = sanitizeSocialBrief(rawBrief);
      const plan = await completeSocialPlan(options, brief, socialRequestUserPrompt(brief, input));
      const [post] = finalizePlan(plan, brief, { kind: "request", ...input, generator: "anthropic" });
      return post!;
    },
  };
}

/**
 * Appel live. `completeStructured` infère son type de retour depuis l'entrée
 * du schéma (les `.default()` rendent `accentRole`/`body` facultatifs) alors
 * que la valeur rendue est déjà la sortie de `schema.parse` : un second parse,
 * idempotent et sans coût notable, fixe le type sans conversion forcée.
 * Variante « google » (posts de la fiche Google, `google-profile.ts`) : même
 * appel avec le prompt système et le schéma de cette variante.
 */
export async function completeSocialPlan(
  options: AnthropicClientOptions,
  brief: SocialSiteBrief,
  userPrompt: string,
  variant: SocialPromptVariant = "social",
  complete: typeof completeStructured = completeStructured,
): Promise<SocialPlan> {
  const schema = variant === "google" ? googlePlanSchema : socialPlanSchema;
  const parsed: z.input<typeof schema> = await complete(
    options,
    socialSystemPrompt(brief, { variant }),
    userPrompt,
    schema,
  );
  return schema.parse(parsed);
}
