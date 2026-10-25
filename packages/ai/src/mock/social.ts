/**
 * Mock déterministe des contenus réseaux sociaux (conception §3.9) : sans
 * appel API, à partir du brief du site. Produit un `SocialPlan` (même forme
 * que la sortie du modèle) que `finalizePlan` transforme ensuite comme en
 * mode live.
 *
 * Graine `hash31(ville + nom du site + mois)` : même brief → même sortie.
 * Les textes sont assemblés avec les briques de voix (voice.ts) ; les
 * diapositives ne contiennent jamais d'emoji et chaque body porte exactement
 * un passage **gras** (sauf le template « avis », rendu en texte simple).
 */

import {
  camelHashtag,
  truncateAtSentence,
  truncateAtWord,
  singleEmphasis,
  type SocialFormat,
  type SocialPillar,
  type SocialSiteBrief,
  type SocialSlot,
  type SocialTemplate,
} from "@theralys/shared";
import { emphasizeLead } from "../emphasis";
import {
  articleRefId,
  hash31,
  rotatePillars,
  socialSeed,
} from "../social-prompts";
// Import circulaire avec ../social (qui importe ce module) : ces exports ne
// sont utilisés qu'à l'intérieur des fonctions, jamais à l'initialisation.
import {
  SOCIAL_BIO_LINE,
  SOCIAL_NEW_ARTICLE_BADGE,
  checkSocialCompliance,
  numberWord,
  reviewSlide,
  socialAltText,
  type SocialPlan,
  type SocialPostDraft,
  type SocialSlideDraft,
} from "../social";
import { voiceBricks, type VoiceBricks } from "../voice";

// ─── Contexte ────────────────────────────────────────────────────────────────

type Ctx = {
  brief: SocialSiteBrief;
  b: VoiceBricks;
  first: string;
  profession: string;
  /** « sophrologue » */
  professionLower: string;
  /** « la sophrologie » */
  practice: string;
  /** « La sophrologie » */
  practiceCap: string;
  city: string;
  recent: string[];
  seed: number;
  /** Consignes du praticien interprétées par le mock */
  wishes: MockWishes;
};

/**
 * Ce que le mock retient des consignes libres (« Paramétrage ») : le texte
 * n'est pas compris, deux cas déterministes et testables sont honorés.
 */
export type MockWishes = {
  /** Les consignes contiennent « question » : chaque légende se termine par une question */
  endWithQuestion: boolean;
  /** « hashtag » suivi de #Mot : ces hashtags sont ajoutés (normalizeHashtags dédoublonne) */
  hashtags: string[];
};

const NO_WISHES: MockWishes = { endWithQuestion: false, hashtags: [] };

/** Lit les consignes : « question » → légendes interrogatives ; « hashtag … #Mot » → hashtags ajoutés. */
export function parseMockWishes(instructions: string | undefined): MockWishes {
  if (!instructions) return NO_WISHES;
  const hashtags: string[] = [];
  for (const line of instructions.matchAll(/hashtags?\b([^\n]*)/giu)) {
    for (const tag of (line[1] ?? "").matchAll(/#[\p{L}\p{N}_]{2,40}/gu)) hashtags.push(tag[0]);
  }
  // Formulation positive explicite seulement (« Terminer chaque légende par une question ») :
  // « éviter les questions » ou « questions fréquentes » ne déclenchent rien
  const endWithQuestion = /(terminer|finir|conclure|clore)[^.\n]*\bquestion\b|\bpar une question\b/i.test(
    instructions,
  );
  return { endWithQuestion, hashtags };
}

function makeCtx(brief: SocialSiteBrief, recent: string[], seed: number): Ctx {
  const { firstName, profession, practiceName, city } = brief.practitioner;
  return {
    brief,
    b: voiceBricks(brief.voice),
    first: firstName,
    profession,
    professionLower: profession.toLowerCase(),
    practice: practiceName,
    practiceCap: capitalize(practiceName),
    city,
    recent: recent.map((t) => t.toLowerCase()),
    seed,
    wishes: parseMockWishes(brief.instructions),
  };
}

// ─── Aides texte ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** « de » élidé devant une voyelle : « parlons de … » → « parlons d'accompagnement ». */
function de(word: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüœh]/i.test(word) ? `d'${word}` : `de ${word}`;
}

/** Texte d'une ligne, sans gras ni liens, espaces normalisés. */
function inline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function title(text: string, max = 60): string {
  return truncateAtWord(inline(text).replace(/[.:]\s*$/, ""), max);
}

function sentences(text: string): string[] {
  return inline(text)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Phrases complètes d'un texte : un fragment final tronqué par le brief
 * (« … ») est écarté dès qu'il reste au moins une phrase entière.
 */
function wholeSentences(text: string): string[] {
  const all = sentences(text);
  return all.length > 1 && /…$/.test(all[all.length - 1] ?? "") ? all.slice(0, -1) : all;
}

/** Texte recopié dans une légende : phrases entières seulement (jamais de « … » en pleine phrase). */
function wholeText(text: string): string {
  return wholeSentences(text).join(" ");
}

/** Première phrase, terminée par un point. */
function firstSentence(text: string): string {
  const s = (sentences(text)[0] ?? inline(text)).replace(/\s*[:;,]$/, "");
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** Gras sur les premiers mots porteurs (3 au plus, mots-outils de fin exclus). */
function boldLead(text: string): string {
  const words = [...text.matchAll(/\S+/g)];
  if (words.length < 2) return text;
  let n = Math.min(3, words.length);
  while (n > 2 && TAIL_STOP.test(words[n - 1]![0].replace(/[.,;:!?]$/, ""))) n -= 1;
  const last = words[n - 1]!;
  const lead = text.slice(0, last.index + last[0].length).replace(/[.,;:!?]+$/, "");
  return `**${lead}**${text.slice(lead.length)}`;
}

/**
 * Exactement un passage **gras** de quelques mots : l'attaque du texte
 * (emphasizeLead) ; si elle couvre tout le texte, seulement ses premiers mots
 * porteurs ; sans attaque trouvée, les premiers mots.
 */
function ensureBold(text: string): string {
  const once = singleEmphasis(emphasizeLead(text));
  const m = /\*\*([^*\n]+)\*\*/.exec(once);
  if (!m) return boldLead(once);
  const plain = once.replace(/\*\*/g, "");
  const trimPunct = (t: string) => t.replace(/[\s.,;:!?]+$/, "");
  const whole = trimPunct(plain) === trimPunct(m[1] ?? "");
  return whole && plain.split(/\s+/).length > 3 ? boldLead(plain) : once;
}

/**
 * Body d'une diapositive : phrases entières qui tiennent dans `max` (marqueurs
 * compris), sinon troncature au mot ; 1 gras.
 */
function body(text: string, max: number): string {
  const clean = wholeText(inline(text)).replace(/\s*:$/, ".");
  return ensureBold(truncateAtSentence(clean, max - 4, 0.25));
}

/** Mots qui ouvrent une proposition : une ligne peut s'arrêter juste avant. */
const CLAUSE_BREAK_RE =
  /\s(?=(?:et|ou|mais|puis|qui|que|dont|où|pour|dans|avec|sans|malgré|afin|lorsque|quand|comme|chez|vers|sur|sous|entre|par|selon|grâce|à|en|de|des|du|au|aux)\s)/giu;

/** Dernière coupure possible (début du motif) dans [min, max], ou -1. */
function lastCut(text: string, re: RegExp, max: number, min: number): number {
  let best = -1;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > max) break;
    if (m.index >= min) best = m.index;
  }
  return best;
}

/**
 * Ligne ramenée sous `perLine` sans « … » quand c'est possible : coupée à la
 * dernière fin de phrase, sinon à un séparateur (« : », « — », « · »), sinon à
 * une virgule ou devant une conjonction / préposition (ces deux dernières en
 * gardant au moins la moitié du budget) ; en dernier recours, troncature au mot.
 * « Les épaules et la nuque : la zone classique… » → « Les épaules et la nuque ».
 */
function shortLine(line: string, perLine: number): string {
  const clean = inline(line).replace(/[.;,]\s*$/, "");
  if (clean.length <= perLine) return clean;
  const half = Math.ceil(perLine / 2);
  const strategies: [RegExp, number][] = [
    [/[.!?…](?=\s)/g, 8],
    [/\s[:—–·]\s/g, 8],
    [/,(?=\s)/g, half],
    [CLAUSE_BREAK_RE, half],
  ];
  for (const [re, min] of strategies) {
    const cut = lastCut(clean, re, perLine, min);
    if (cut > 0) return clean.slice(0, cut).replace(/[\s,;:.]+$/, "");
  }
  return truncateAtWord(clean, perLine);
}

/**
 * Titre d'article ramené sous `max` : la question qui suit « : » quand elle
 * tient (« Gestion du stress à Albi : à quoi s'attendre lors d'une première
 * séance ? » → « À quoi s'attendre lors d'une première séance ? »), sinon une
 * coupure de proposition (shortLine), jamais un mot coupé en « … » si possible.
 */
function articleTitle(text: string, max = 60): string {
  const clean = inline(text).replace(/[.:]\s*$/, "");
  if (clean.length <= max) return clean;
  const parts = clean.split(/\s:\s/);
  const question = parts.length === 2 ? capitalize(parts[1]!.trim()) : "";
  if (question.length >= 20 && question.length <= max) return question;
  return shortLine(clean, max);
}

/**
 * Body en lignes « - » (3 au plus) : chaque ligne tient dans `perLine`, le
 * tout dans `max`, et seule la première ligne porte le gras.
 */
function bulletBody(lines: string[], max: number, perLine = 70): string {
  const out: string[] = [];
  let length = 0;
  for (const raw of lines) {
    if (out.length === 3) break;
    const line = shortLine(raw, perLine);
    if (line === "") continue;
    const formatted = out.length === 0 ? `- ${ensureBold(line)}` : `- ${line}`;
    if (length + formatted.length + (out.length > 0 ? 1 : 0) > max) break;
    length += formatted.length + (out.length > 0 ? 1 : 0);
    out.push(formatted);
  }
  return out.join("\n");
}

/** Texte du site citable tel quel : aucune règle sociale ni éthique enfreinte. */
function compliant(text: string): boolean {
  return checkSocialCompliance(text).ok;
}

/**
 * Choix stable d'un élément : seuls les éléments citables (texte conforme),
 * d'abord ceux absents des sujets récents, puis par graine.
 */
function pick<T>(ctx: Ctx, candidates: readonly T[], k: number, labelOf: (item: T) => string, textOf: (item: T) => string = labelOf): T | undefined {
  const items = candidates.filter((item) => compliant(textOf(item)));
  if (items.length === 0) return undefined;
  const fresh = items.filter((item) => {
    const label = labelOf(item).toLowerCase();
    return label === "" || !ctx.recent.some((t) => t.includes(label));
  });
  const pool = fresh.length > 0 ? fresh : items;
  return pool[(ctx.seed + k) % pool.length];
}

/** Lignes de la section « avenir » sans sa phrase d'introduction (« … possible de : »). */
function futureLines(brief: SocialSiteBrief): string[] {
  return (brief.home.future?.lines ?? []).map((l) => inline(l)).filter((l) => l !== "" && !/[:;]$/.test(l));
}

/** Titre du site sans sa ville (« … et apaiser le mental à Albi. » → « … et apaiser le mental »). */
function heroTitle(brief: SocialSiteBrief): string {
  const raw = inline(brief.home.hero?.title ?? brief.siteName).replace(/[.!]$/, "");
  const city = brief.practitioner.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`\\s+à\\s+${city}$`, "iu"), "");
}

/** « la sophrologie » → « #Sophrologie » ; « cette pratique de bien-être » → « #BienEtre ». */
function practiceTag(practice: string): string {
  return camelHashtag(practice.replace(/^(cette pratique de|les|la|le|l['’])\s*/i, ""));
}

// ─── Légende ─────────────────────────────────────────────────────────────────

function signature(ctx: Ctx): string {
  return `${ctx.first}, ${ctx.professionLower} à ${ctx.city}`;
}

function prudenceLine(ctx: Ctx): string {
  return `${ctx.practiceCap} ne se substitue pas à un avis médical.`;
}

/** Question finale (consigne « question »), accordée au lecteur, variée par graine. */
function closingQuestion(ctx: Ctx, k: number): string {
  const { b } = ctx;
  const questions = [
    `Et ${b.reader("vous", "toi")}, qu'est-ce qui ${b.reader("vous aiderait", "t'aiderait")} à souffler cette semaine ?`,
    `Et ${b.reader("vous", "toi")}, quand ${b.reader("avez-vous", "as-tu")} pris un vrai moment pour ${b.reader("vous", "toi")} ?`,
    `Qu'est-ce qui ${b.reader("vous", "te")} ferait du bien en ce moment ?`,
  ];
  return questions[(ctx.seed + k) % questions.length]!;
}

/**
 * Accroche (≤ 125 caractères, 1 emoji) → développement → [prudence] →
 * [question finale si les consignes le demandent] → ligne « lien dans ma bio »
 * → signature « Prénom, métier à Ville » (même structure que le prompt live).
 */
function caption(ctx: Ctx, hook: string, development: string[], pillar: SocialPillar, k = 0): string {
  const dev = development.filter((p) => p.trim() !== "");
  const mentionsCare = /sommeil|douleur/i.test([hook, ...dev].join(" "));
  const prudent = pillar === "conseil" || pillar === "article" || mentionsCare;
  return [
    truncateAtWord(hook, 125),
    ...dev,
    ...(prudent ? [prudenceLine(ctx)] : []),
    ...(ctx.wishes.endWithQuestion ? [closingQuestion(ctx, k)] : []),
    SOCIAL_BIO_LINE,
    signature(ctx),
  ].join("\n\n");
}

function hashtags(ctx: Ctx, extra: string[]): string[] {
  return [
    camelHashtag(`${ctx.profession} ${ctx.city}`),
    camelHashtag(ctx.city),
    practiceTag(ctx.practice),
    // Hashtags demandés dans les consignes : avant les thématiques, pour survivre au plafond de 8
    ...ctx.wishes.hashtags,
    ...extra,
    "#BienEtre",
  ];
}

// ─── Texte alternatif ────────────────────────────────────────────────────────

/** Texte alternatif du brouillon : `socialAltText` sur les diapositives (photo = imageRef présent). */
function altText(ctx: Ctx, parts: DraftParts, slides: SocialSlideDraft[]): string {
  const total = parts.format === "carousel" ? slides.length + 1 : slides.length;
  return socialAltText(
    parts.template,
    slides.map((s) => ({ title: s.title, body: s.body, hasPhoto: Boolean(s.imageRef) })),
    ctx.brief.practitioner,
    { total, ...(parts.review ? { reviewRating: parts.review.rating } : {}) },
  );
}

// ─── Assemblage d'un brouillon ───────────────────────────────────────────────

type DraftParts = {
  pillar: SocialPillar;
  format: SocialFormat;
  template: SocialTemplate;
  topic: string;
  slides: SocialSlideDraft[];
  hook: string;
  development: string[];
  tags: string[];
  sourceRefs: string[];
  /** Avis cité (template « avis ») : sa note réelle entre dans le texte alternatif */
  review?: { rating: number };
  k: number;
};

const ACCENTS = ["primary", "soft", "primaryDark", "deep"] as const;

function draft(ctx: Ctx, parts: DraftParts): SocialPostDraft {
  const slides = parts.slides.map((s) => ({
    ...s,
    title: truncateAtWord(s.title, 90),
    body: truncateAtWord(s.body, 260),
  }));
  return {
    pillar: parts.pillar,
    format: parts.format,
    template: parts.template,
    accentRole: ACCENTS[(ctx.seed + parts.k) % ACCENTS.length] ?? "primary",
    topic: truncateAtWord(parts.topic, 70),
    slides,
    caption: caption(ctx, parts.hook, parts.development, parts.pillar, parts.k),
    hashtags: hashtags(ctx, parts.tags),
    altText: truncateAtWord(altText(ctx, parts, slides), 300),
    sourceRefs: [...new Set(parts.sourceRefs)].slice(0, 6),
  };
}

function slide(t: string, bodyText: string, extra: { badge?: string; imageRef?: string } = {}): SocialSlideDraft {
  return {
    title: t,
    body: bodyText,
    ...(extra.badge ? { badge: extra.badge } : {}),
    ...(extra.imageRef ? { imageRef: extra.imageRef } : {}),
  };
}

const TAIL_STOP = /^(de|des|du|la|le|les|et|à|en|par|pour|un|une|sur|dans|vos|votre|tes|ton|ta|\d+)$/i;
/** Mot élidé (« l'air », « d'un ») : pas une attaque de passage gras. */
const ELIDED = /^[ld]['’]/i;

/** Gras sur les derniers mots porteurs d'une phrase (« … pendant **4 secondes**. »). */
function boldTail(text: string): string {
  const clean = inline(text);
  const words = [...clean.matchAll(/\S+/g)];
  if (words.length < 4) return ensureBold(clean);
  // Trois derniers mots, en sautant les mots-outils et élidés de tête tant qu'il en reste deux
  let from = Math.max(1, words.length - 3);
  while (from < words.length - 2) {
    const word = words[from]![0].replace(/[.,;:!?]$/, "");
    if (!TAIL_STOP.test(word) && !ELIDED.test(word)) break;
    from += 1;
  }
  const start = words[from]!.index;
  const tail = clean.slice(start).replace(/[.!?]$/, "");
  const end = start + tail.length;
  return `${clean.slice(0, start)}**${tail}**${clean.slice(end)}`;
}

/** Conjonction en tête d'un reste d'étape (« et posez vos mains » → « Posez vos mains »). */
const LEAD_CONJUNCTION = /^(?:et|puis|ou|ensuite|enfin)\s+/i;

/**
 * Page d'un carrousel d'étapes : « Asseyez-vous confortablement, pieds à plat »
 * → titre « Asseyez-vous confortablement » / body « Pieds à plat… ». Sans
 * proposition détachable, le titre reprend l'attaque de l'étape (« Retenez
 * l'air ») et le body n'en garde que la suite (« 2 secondes. ») — jamais les
 * mêmes mots deux fois ; étape trop courte pour être scindée → « Étape n ».
 */
function stepSlide(step: string, index: number): SocialSlideDraft {
  const clean = inline(step).replace(/[.!]$/, "");
  const m = /^([^,:;—–]{6,60}?)\s*[,:;—–]\s+(.+)$/.exec(clean);
  if (m && m[2] && m[2].split(/\s+/).length >= 2) {
    return slide(title(m[1] ?? "", 60), body(capitalize(m[2]), 160));
  }
  const words = clean.split(/\s+/);
  let n = Math.min(3, words.length - 1);
  while (n > 1 && TAIL_STOP.test(words[n - 1] ?? "")) n -= 1;
  const short = words.slice(0, n).join(" ").replace(/[,;:]$/, "");
  const rest = words.slice(n).join(" ").replace(LEAD_CONJUNCTION, "");
  if (short.length >= 6 && rest.split(/\s+/).filter(Boolean).length >= 2) {
    return slide(title(short, 60), truncateAtWord(boldTail(`${capitalize(rest)}.`), 160));
  }
  return slide(`Étape ${index + 1}`, truncateAtWord(boldTail(`${clean}.`), 160));
}

// ─── Contenus par pilier ─────────────────────────────────────────────────────

function processSteps(ctx: Ctx): { title: string; description: string }[] {
  return ctx.brief.home.process;
}

function fallbackProcess(ctx: Ctx): { title: string; description: string }[] {
  const { b } = ctx;
  return [
    {
      title: "Un temps d'échange",
      description: `Nous faisons le point ensemble sur ce qui ${b.reader("vous amène", "t'amène")}, sans jugement.`,
    },
    {
      title: "La séance",
      description: `${capitalize(b.subj(b.reader("Je vous guide", "Je te guide"), b.reader("Nous vous guidons", "Nous te guidons"), b.reader("On vous guide", "On te guide")))} pas à pas, à ${b.yourAdj} rythme.`,
    },
    {
      title: "Le retour au calme",
      description: `Quelques minutes pour revenir à ${b.reader("vous", "toi")} et repartir avec des repères simples.`,
    },
  ];
}

function specialitePost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const spec = pick(ctx, brief.home.specialties, k, (s) => s.title, (s) => `${s.title}\n${s.excerpt}`);
  if (!spec) return undefined;
  const page = brief.motifPages.find((p) => p.slug === spec.slug);
  const photo = spec.photoId ?? page?.photoId;
  const badge = `${ctx.profession} à ${ctx.city}`;
  const excerptSentences = wholeSentences(spec.excerpt);
  const refs = [spec.id, ...(spec.pageId ? [spec.pageId] : [])];
  const lower = lowerFirst(spec.title);
  const toi = b.reader("vous", "toi");
  const hook = `Un temps pour ${toi}, rien que pour ${toi} : parlons ${de(lower)}. 🌿`;
  const development = [
    wholeText(spec.excerpt),
    `En séance, ${b.subj(b.reader("je vous accompagne", "je t'accompagne"), b.reader("nous vous accompagnons", "nous t'accompagnons"), b.reader("on vous accompagne", "on t'accompagne"))} pas à pas, à ${b.yourAdj} rythme, pour installer des repères simples à réutiliser au quotidien.`,
  ];
  const tags = [camelHashtag(spec.title)];
  const base = { pillar: "specialite" as const, topic: `Spécialité : ${title(spec.title, 55)}`, hook, development, tags, sourceRefs: refs, k };

  if (format === "carousel") {
    const process = processSteps(ctx)[0] ?? fallbackProcess(ctx)[0]!;
    // Deuxième phrase de l'extrait ; sinon le résumé de la page s'il ne répète pas la couverture ; sinon une phrase générique
    const cover = firstSentence(spec.excerpt);
    const concrete =
      excerptSentences.slice(1).find((s) => s.length >= 30) ??
      (page?.summary && firstSentence(page.summary) !== cover ? page.summary : undefined) ??
      `Des exercices simples, guidés pas à pas, à refaire chez ${toi} entre les séances.`;
    const forWho =
      [...(page?.faq ?? []), ...brief.home.faq].find((f) => /qui s['’]adresse|pour qui/i.test(f.question))?.answer ??
      page?.summary ??
      `À toute personne qui souhaite s'accorder un moment pour elle, à son rythme.`;
    return draft(ctx, {
      ...base,
      format,
      template: "carrousel-etapes",
      slides: [
        slide(title(spec.title), body(firstSentence(spec.excerpt), 160), { badge, imageRef: photo }),
        slide("Concrètement", body(concrete, 160)),
        slide("Comment se passe une séance ?", body(process.description, 160)),
        slide("Pour qui ?", body(forWho, 160)),
      ],
    });
  }
  const template: SocialTemplate = photo ? "photo-titre" : "affirmation";
  return draft(ctx, {
    ...base,
    format,
    template,
    slides: [slide(title(spec.title), body(firstSentence(spec.excerpt), 200), { badge, imageRef: photo })],
  });
}

function conseilPost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft {
  const { brief, b } = ctx;
  const article = pick(
    ctx,
    brief.articles.filter((a) => a.exerciseSteps.length >= 2),
    k,
    (a) => a.title,
    (a) => [a.title, a.exerciseIntro ?? "", ...a.exerciseSteps].join("\n"),
  );
  const steps = (article?.exerciseSteps ?? []).slice(0, 5);
  const fromArticle = article !== undefined && steps.length >= 2;
  const process = processSteps(ctx).length >= 2 ? processSteps(ctx) : fallbackProcess(ctx);
  const refs = fromArticle ? [article.id] : ["section:home:process"];
  const site = b.subj("mon site", "notre site", "le site");

  const hook = fromArticle
    ? `Trois minutes, les yeux fermés : un exercice simple à glisser dans ${b.yourAdjF} journée. 🧘`
    : `Comment se passe une séance ? ${capitalize(b.subj(b.reader("Je vous emmène", "Je t'emmène"), b.reader("Nous vous emmenons", "Nous t'emmenons"), b.reader("On vous emmène", "On t'emmène")))} dans les coulisses. ✨`;
  const development = fromArticle
    ? [
        article.exerciseIntro ? firstSentence(article.exerciseIntro) : `Un exercice tiré de l'article « ${article.title} ».`,
        `${capitalize(b.reader("Vous le retrouverez", "Tu le retrouveras"))} en détail dans l'article « ${article.title} », sur ${site}. Un repère simple, à refaire dès que le besoin s'en fait sentir.`,
      ]
    : [
        `${process.map((s) => lowerFirst(s.title)).join(", ")} : ${numberWord(process.length)} temps pour ${b.reader("vous poser", "te poser")}, à ${b.yourAdj} rythme.`,
        `${capitalize(b.subj(b.reader("Je vous explique", "Je t'explique"), b.reader("Nous vous expliquons", "Nous t'expliquons"), b.reader("On vous explique", "On t'explique")))} chaque étape, et rien n'est jamais forcé.`,
      ];
  const tags = fromArticle ? ["#ExerciceDuJour", "#Respiration"] : ["#Coulisses", "#Seance"];
  const topic = fromArticle ? "Un exercice simple à faire chez soi" : "Comment se passe une séance ?";
  const base = { pillar: "conseil" as const, topic, hook, development, tags, sourceRefs: refs, k };

  if (format === "carousel") {
    const pages = fromArticle
      ? steps.map((s, i) => stepSlide(s, i))
      : process.slice(0, 5).map((s) => slide(title(s.title), body(s.description, 160)));
    const cover = fromArticle
      ? slide(
          `${capitalize(numberWord(pages.length))} étapes pour relâcher la pression`,
          body(article.exerciseIntro ?? `Un exercice simple, à faire assis, les yeux fermés.`, 160),
          { imageRef: article.photoId ?? brief.photos.find((p) => p.kind === "hero")?.id },
        )
      : slide("Comment se passe une séance ?", body(`${capitalize(numberWord(pages.length))} temps, à ${b.yourAdj} rythme, sans rien à préparer.`, 160));
    return draft(ctx, { ...base, format, template: "carrousel-etapes", slides: [cover, ...pages] });
  }
  if (format === "story") {
    const text = fromArticle
      ? `${steps[0]} ${steps[1]}`
      : `${process[0]?.description ?? ""}`;
    return draft(ctx, {
      ...base,
      format,
      template: "story-rappel",
      slides: [slide(fromArticle ? "Un exercice simple à tester" : "Comment se passe une séance ?", body(text, 200), { imageRef: article?.photoId })],
    });
  }
  const lines = fromArticle ? steps : process.map((s) => s.title);
  return draft(ctx, {
    ...base,
    format,
    template: "liste-conseils",
    slides: [slide(fromArticle ? `Un exercice en ${numberWord(Math.min(3, lines.length))} étapes` : "Comment se passe une séance ?", bulletBody(lines, 200))],
  });
}

function articlePost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const article = pick(ctx, brief.articles, k + 1, (a) => a.title, (a) => [a.title, a.lead, a.excerpt, ...a.signs, ...a.contributions, ...a.whenToConsult].join("\n"));
  if (!article) return undefined;
  const site = b.subj("mon site", "notre site", "le site");
  const blog = b.subj("mon blog", "notre blog", "le blog");
  const hook = `${truncateAtWord(article.title, 110)} 📖`;
  const development = [
    wholeText(article.lead || article.excerpt),
    `${capitalize(b.reader("Vous y trouverez", "Tu y trouveras"))} ce qui se joue, ce que ${ctx.practice} peut apporter et quand consulter. L'article complet est sur ${site}.`,
  ];
  const tags = ["#ArticleDuBlog", "#Lecture"];
  const base = { pillar: "article" as const, topic: `Article — ${articleTitle(article.title, 58)}`, hook, development, tags, sourceRefs: [article.id], k };
  const badge = "Article du blog";

  if (format === "carousel") {
    const pages: SocialSlideDraft[] = [];
    if (article.signs.length > 0) pages.push(slide("Ce qui se joue", bulletBody(article.signs, 160, 52)));
    if (article.contributions.length > 0) {
      pages.push(slide(title(`Ce que ${ctx.practice} peut apporter`), bulletBody(article.contributions, 160, 52)));
    }
    // Situations rédigées en phrases : un budget plus large évite de les couper
    if (article.whenToConsult.length > 0) pages.push(slide("Quand consulter ?", bulletBody(article.whenToConsult, 160, 60)));
    if (pages.length === 0) pages.push(slide("En quelques mots", body(article.lead || article.excerpt, 160)));
    return draft(ctx, {
      ...base,
      format,
      template: "carrousel-article",
      slides: [slide(articleTitle(article.title), body(firstSentence(article.excerpt || article.lead), 160), { badge, imageRef: article.photoId }), ...pages],
    });
  }
  return draft(ctx, {
    ...base,
    format,
    template: article.photoId ? "photo-titre" : "affirmation",
    slides: [slide(articleTitle(article.title), body(firstSentence(article.excerpt || article.lead), 200), { badge: `Sur ${blog}`, imageRef: article.photoId })],
  });
}

function ideeRecuePost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const pool = [
    ...brief.home.faq,
    ...brief.motifPages.flatMap((p) => p.faq),
    ...brief.articles.flatMap((a) => a.faq.map((f, i) => ({ id: a.id, question: f.question, answer: f.answer, i }))),
  ];
  const faq = pick(ctx, pool, k, (f) => f.question, (f) => `${f.question}\n${f.answer}`);
  if (!faq) return undefined;
  const hook = `« ${title(faq.question, 90)} » : c'est une question qui revient souvent. 💬`;
  const development = [
    wholeText(faq.answer),
    `${capitalize(b.subj("Je prends", "Nous prenons", "On prend"))} toujours le temps d'y répondre en séance, simplement et sans jargon. ${b.reader("N'hésitez pas", "N'hésite pas")} à ${b.subj("me", "nous", "nous")} poser ${b.yourPl} questions avant ${b.yourAdjF} première séance.`,
  ];
  const tags = ["#IdeeRecue", "#QuestionFrequente"];
  // Sujet du calendrier (≤ 70) : la question entière prime sur son préfixe
  const question = title(faq.question, 160);
  const topic =
    question.length <= 49
      ? `Question fréquente : ${question}`
      : question.length <= 59
        ? `Question : ${question}`
        : title(question, 70);
  const base = { pillar: "idee_recue" as const, topic, hook, development, tags, sourceRefs: [faq.id], k };
  const badge = "Question fréquente";

  if (format === "carousel") {
    const parts = wholeSentences(faq.answer).slice(0, 4);
    const titles = ["En clair", "Concrètement", "À retenir", "Et ensuite"];
    const pages = parts.map((s, i) => slide(titles[i] ?? `Point ${i + 1}`, body(s, 160)));
    if (pages.length < 2) {
      const step = processSteps(ctx)[0] ?? fallbackProcess(ctx)[0]!;
      pages.push(slide("Et en séance ?", body(step.description, 160)));
    }
    return draft(ctx, {
      ...base,
      format,
      template: "carrousel-etapes",
      slides: [slide(title(faq.question), body(`La réponse en ${numberWord(pages.length)} points, sans jargon.`, 160), { badge }), ...pages],
    });
  }
  return draft(ctx, {
    ...base,
    format,
    template: "question-reponse",
    slides: [slide(title(faq.question), body(faq.answer, 200), { badge })],
  });
}

function coulissesPost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft {
  const { brief, b } = ctx;
  const process = processSteps(ctx).length >= 2 ? processSteps(ctx) : fallbackProcess(ctx);
  const about = brief.home.about;
  const refs = [
    ...(processSteps(ctx).length >= 2 ? ["section:home:process"] : []),
    ...(about ? [about.id] : []),
  ];
  if (refs.length === 0) refs.push("section:home:hero");
  const hook = `Comment se passe une séance ? Petit tour en coulisses. ✨`;
  const development = [
    `${capitalize(process.map((s) => lowerFirst(s.title)).join(", "))} : ${numberWord(process.length)} temps pour ${b.reader("vous poser", "te poser")}, à ${b.yourAdj} rythme.`,
    about?.paragraphs[0]
      ? wholeText(about.paragraphs[0])
      : `${capitalize(b.subj(b.reader("Je vous explique", "Je t'explique"), b.reader("Nous vous expliquons", "Nous t'expliquons"), b.reader("On vous explique", "On t'explique")))} chaque étape, et rien n'est jamais forcé.`,
  ];
  const tags = ["#Coulisses", "#Seance"];
  const base = { pillar: "coulisses" as const, topic: "Comment se passe une séance ?", hook, development, tags, sourceRefs: refs, k };

  if (format === "carousel") {
    return draft(ctx, {
      ...base,
      format,
      template: "carrousel-etapes",
      slides: [
        slide("Comment se passe une séance ?", body(`${capitalize(numberWord(process.length))} temps, à ${b.yourAdj} rythme, sans rien à préparer.`, 160)),
        ...process.slice(0, 5).map((s) => slide(title(s.title), body(s.description, 160))),
      ],
    });
  }
  if (format === "story") {
    return draft(ctx, {
      ...base,
      format,
      template: "story-rappel",
      slides: [slide("Comment se passe une séance ?", body(process[0]?.description ?? "", 200))],
    });
  }
  return draft(ctx, {
    ...base,
    format,
    template: "liste-conseils",
    slides: [slide("Comment se passe une séance ?", bulletBody(process.map((s) => s.title), 200))],
  });
}

/** « 45 à 60 minutes en moyenne » → « 45 à 60 minutes ». */
function durationOf(ctx: Ctx): string | undefined {
  const card = ctx.brief.home.infoCards.find((c) => /dur[ée]e/i.test(c.title) || /minutes?|\bh\b/i.test(c.text));
  const m = card ? /\d+\s*(?:à\s*\d+\s*)?(?:minutes?|min|h)\b/i.exec(card.text) : null;
  return m?.[0];
}

function infosPost(ctx: Ctx, k: number, format: SocialFormat, opts: { invite?: boolean } = {}): SocialPostDraft {
  const { brief, b } = ctx;
  const cards = brief.home.infoCards;
  const contact = brief.home.contact;
  const lines =
    cards.length > 0
      ? cards.map((c) => `${c.title} : ${c.text}`)
      : [`Sur rendez-vous à ${ctx.city}`, contact?.address ?? "", contact?.note ?? ""].filter((l) => l !== "");
  const refs = [
    ...(cards.length > 0 ? ["section:home:infos"] : []),
    ...(contact ? ["section:home:contact"] : []),
  ];
  if (refs.length === 0) refs.push("section:home:hero");
  const hook = `Les infos pratiques avant de ${b.reader("vous", "te")} lancer, en un coup d'œil. 📌`;
  const development = [
    cards.map((c) => `${c.title} : ${lowerFirst(c.text)}.`).join(" ") ||
      `${capitalize(b.subj(b.reader("Je vous reçois", "Je te reçois"), b.reader("Nous vous recevons", "Nous te recevons"), b.reader("On vous reçoit", "On te reçoit")))} sur rendez-vous, dans un cadre calme.`,
    `${b.reader("N'hésitez pas", "N'hésite pas")} à ${b.subj("me", "nous", "nous")} contacter pour toute question : ${b.subj("je réponds", "nous répondons", "on répond")} avec plaisir.`,
  ];
  const tags = ["#InfosPratiques", "#RendezVous"];
  const base = { pillar: "infos_pratiques" as const, hook, development, tags, sourceRefs: refs, k };

  if (format === "story") {
    const duration = durationOf(ctx);
    const receive = capitalize(b.subj(b.reader("Je vous reçois", "Je te reçois"), b.reader("Nous vous recevons", "Nous te recevons"), b.reader("On vous reçoit", "On te reçoit")));
    const storyTitle = opts.invite ? `Des créneaux pour ${b.reader("vous", "te")} poser` : "Première séance : à quoi s'attendre ?";
    const text = opts.invite
      ? `${receive} sur rendez-vous, à ${b.yourAdj} rythme : **le lien est dans ma bio**.`
      : duration
        ? `Un temps d'échange, puis ${ctx.practice} à ${b.yourAdj} rythme. **${duration}**, sans rien à préparer.`
        : `Un temps d'échange, puis ${ctx.practice} à ${b.yourAdj} rythme : **rien à préparer**, juste ${b.reader("vous", "toi")}.`;
    return draft(ctx, {
      ...base,
      topic: storyTitle,
      format,
      template: "story-rappel",
      slides: [slide(storyTitle, truncateAtWord(text, 200), { imageRef: brief.photos.find((p) => p.kind === "future" || p.kind === "hero")?.id })],
    });
  }
  if (format === "carousel") {
    const pages = cards.length > 0
      ? cards.map((c) => slide(title(c.title), body(c.text, 160)))
      : lines.map((l, i) => slide(`Repère ${i + 1}`, body(l, 160)));
    if (pages.length < 1) pages.push(slide("Sur rendez-vous", body(`${capitalize(b.subj("Je vous reçois", "Nous vous recevons", "On vous reçoit"))} à ${ctx.city}, dans un cadre calme.`, 160)));
    return draft(ctx, {
      ...base,
      topic: "Infos pratiques",
      format,
      template: "carrousel-etapes",
      slides: [slide("Infos pratiques", body("Durée, règlement, prise en charge : l'essentiel en quelques pages.", 160)), ...pages],
    });
  }
  return draft(ctx, {
    ...base,
    topic: "Infos pratiques",
    format,
    template: "infos-pratiques",
    slides: [slide("Infos pratiques", bulletBody(lines, 200, 66))],
  });
}

function projectionPost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft {
  const { brief, b } = ctx;
  const future = brief.home.future;
  const hero = brief.home.hero;
  const lines = futureLines(brief);
  const useFuture = future !== undefined && lines.length >= 2 && (ctx.seed + k) % 2 === 0;
  const refs = [...(useFuture ? ["section:home:future"] : ["section:home:hero"]), ...(future && !useFuture ? ["section:home:future"] : [])];
  const together = b.subj(b.reader("je vous accompagne", "je t'accompagne"), b.reader("nous vous accompagnons", "nous t'accompagnons"), b.reader("on vous accompagne", "on t'accompagne"));
  const hook = `${truncateAtWord(inline(future?.title ?? hero?.title ?? `Et si ${b.you} ${b.reader("preniez", "prenais")} soin de ${b.reader("vous", "toi")} ?`), 118)} 🌱`;
  const development = [
    lines.length >= 2
      ? `${lines.slice(0, 3).map((l) => l.replace(/[.;]$/, "")).join(". ")}.`
      : hero?.paragraphs[0] ?? `${ctx.practiceCap} est un accompagnement doux, à ${b.yourAdj} rythme.`,
    `C'est ce vers quoi ${together}, pas à pas et sans pression.`,
  ];
  const tags = ["#PrendreSoinDeSoi", "#Equilibre"];
  const base = { pillar: "projection" as const, hook, development, tags, sourceRefs: refs, k };
  const heroTitleText = title(heroTitle(brief));
  const heroBody = body(hero?.paragraphs[0] ?? `${ctx.practiceCap} pour retrouver un corps détendu et un esprit apaisé.`, 200);

  if (format === "carousel") {
    const pageLines = lines.length >= 2 ? lines : (hero?.paragraphs ?? []);
    const hints = [
      `Un objectif que l'on construit ensemble, **séance après séance**.`,
      `Sans pression ni obligation : **à ${b.yourAdj} rythme**.`,
      `Avec des outils simples à **réutiliser au quotidien**.`,
      `Un pas après l'autre, **avec bienveillance**.`,
      `Pour retrouver, durablement, **un peu de légèreté**.`,
    ];
    const pages = pageLines.slice(0, 5).map((l, i) => slide(shortLine(l, 60), hints[i] ?? hints[0]!));
    if (pages.length < 1) pages.push(slide("Pas à pas", heroBody));
    return draft(ctx, {
      ...base,
      topic: title(future?.title ?? heroTitleText, 70),
      format,
      template: "carrousel-etapes",
      slides: [slide(title(future?.title ?? heroTitleText), body(future ? `Ce que ${ctx.practice} peut apporter, pas à pas.` : (hero?.paragraphs[0] ?? heroBody), 160)), ...pages],
    });
  }
  if (format === "static" && useFuture) {
    return draft(ctx, {
      ...base,
      topic: title(future.title, 70),
      format,
      template: "liste-conseils",
      slides: [slide(title(future.title), bulletBody(lines, 200))],
    });
  }
  return draft(ctx, {
    ...base,
    topic: title(heroTitleText, 70),
    format,
    template: "affirmation",
    slides: [slide(heroTitleText, heroBody)],
  });
}

function avisPost(ctx: Ctx, k: number): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const review = pick(ctx, brief.reviews, k, (r) => r.authorName, (r) => r.text);
  if (!review) return undefined;
  const hook = `Merci ${review.authorName} pour ce retour qui ${b.subj("me", "nous", "nous")} touche. 💛`;
  const development = [
    `« ${review.text} »`,
    `Ces mots ${b.subj("me", "nous", "nous")} rappellent pourquoi ${b.subj("j'ai choisi", "nous avons choisi", "on a choisi")} ${ctx.practice} : accompagner chacun, à son rythme, avec attention.`,
  ];
  return draft(ctx, {
    pillar: "avis",
    topic: `Avis Google de ${review.authorName}`,
    format: "static",
    template: "avis",
    // Template rendu en texte simple : pas de marqueur de gras ; citation par phrases entières
    slides: [reviewSlide(review)],
    hook,
    development,
    tags: ["#AvisClient", "#Merci"],
    sourceRefs: [review.id],
    review: { rating: review.rating },
    k,
  });
}

function newArticlePost(ctx: Ctx, slot: SocialSlot, k: number): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const id = articleRefId(slot.articleId ?? "");
  // Article absent du brief : le créneau reste libre (annoncer un autre article serait faux)
  const article = brief.articles.find((a) => a.id === id);
  if (!article) return undefined;
  const site = b.subj("mon site", "notre site", "le site");
  // Le titre dispose de tout ce que la première ligne (125 caractères) laisse au-delà du préfixe et du suffixe
  const prefix = `Nouvel article sur ${site} : « `;
  const suffix = " » 📝";
  const hook = `${prefix}${truncateAtWord(article.title, 125 - prefix.length - suffix.length)}${suffix}`;
  const development = [
    wholeText(article.excerpt || article.lead),
    `Bonne lecture ! ${capitalize(b.yourPl)} retours sont toujours les bienvenus.`,
  ];
  return draft(ctx, {
    pillar: "nouvel_article",
    topic: `Nouvel article — ${articleTitle(article.title, 52)}`,
    format: "static",
    template: "photo-titre",
    slides: [slide(articleTitle(article.title), body(article.excerpt || article.lead, 160), { badge: SOCIAL_NEW_ARTICLE_BADGE, imageRef: article.photoId })],
    hook,
    development,
    tags: ["#NouvelArticle", "#Blog"],
    sourceRefs: [article.id],
    k,
  });
}

function postFor(ctx: Ctx, pillar: SocialPillar, k: number, format: SocialFormat): SocialPostDraft | undefined {
  switch (pillar) {
    case "specialite":
      return specialitePost(ctx, k, format);
    case "conseil":
      return conseilPost(ctx, k, format);
    case "article":
      return articlePost(ctx, k, format);
    case "idee_recue":
      return ideeRecuePost(ctx, k, format);
    case "coulisses":
      return coulissesPost(ctx, k, format);
    case "infos_pratiques":
      return infosPost(ctx, k, format);
    case "projection":
      return projectionPost(ctx, k, format);
    case "avis":
      return format === "static" ? avisPost(ctx, k) : projectionPost(ctx, k, format);
    case "nouvel_article":
      return undefined;
  }
}

// ─── Mois ────────────────────────────────────────────────────────────────────

export type MockSocialMonthInput = {
  /** "YYYY-MM" */
  month: string;
  slots: SocialSlot[];
  recentTopics: string[];
};

const CAROUSEL_PILLARS: readonly SocialPillar[] = ["conseil", "article"];
const STORY_EXCLUDED: readonly SocialPillar[] = ["conseil", "article", "avis"];

/**
 * Un contenu par créneau : piliers disponibles en rotation (jamais deux fois
 * de suite le même, au plus un avis), carrousels sur conseil/article, une
 * story sur le 4e créneau de cadence dès 6 créneaux.
 */
/** Au-delà d'un tour complet des piliers : ceux dont le contenu varie d'un créneau à l'autre. */
const WRAP_PILLARS: readonly SocialPillar[] = ["specialite", "idee_recue", "projection", "conseil"];

export function mockSocialMonth(brief: SocialSiteBrief, input: MockSocialMonthInput): SocialPlan {
  // Les articles annoncés par un créneau « nouvel_article » ne sont pas repris ailleurs dans le mois
  const announced = input.slots
    .filter((s) => s.kind === "nouvel_article")
    .map((s) => brief.articles.find((a) => a.id === articleRefId(s.articleId ?? ""))?.title ?? "")
    .filter((t) => t !== "");
  const seed = socialSeed(brief, input.month);
  const ctx = makeCtx(brief, [...input.recentTopics, ...announced], seed);
  const rotated = rotatePillars(brief, input.month);
  const cadence = input.slots.filter((s) => s.kind === "cadence");
  const n = cadence.length;

  // Séquence des piliers de cadence
  const pillars: SocialPillar[] = [];
  let avisUsed = false;
  const wrap = WRAP_PILLARS.filter((p) => rotated.includes(p));
  for (let k = 0; k < n; k++) {
    let pillar =
      k < rotated.length
        ? (rotated[k] ?? "projection")
        : (wrap[(k - rotated.length) % Math.max(1, wrap.length)] ?? "projection");
    if (pillar === "avis") {
      if (avisUsed) pillar = "projection";
      avisUsed = true;
    }
    const previous = pillars[k - 1];
    if (previous === pillar) {
      pillar = rotated.find((p) => p !== previous && p !== "avis") ?? pillar;
    }
    pillars.push(pillar);
  }

  // Formats : carrousels (conseil, article ; sans article, le 1er specialite dès 6 créneaux), 1 story
  const formats: SocialFormat[] = pillars.map((p) => (CAROUSEL_PILLARS.includes(p) ? "carousel" : "static"));
  if (n >= 6 && formats.filter((f) => f === "carousel").length < 2) {
    const extra = pillars.findIndex((p, k) => p === "specialite" && formats[k] === "static");
    if (extra >= 0) formats[extra] = "carousel";
  }
  if (n >= 6) {
    const storyAt = pillars.findIndex((p, k) => k >= 3 && !STORY_EXCLUDED.includes(p) && formats[k] === "static");
    if (storyAt >= 0) formats[storyAt] = "story";
  }

  const posts: SocialPostDraft[] = [];
  let k = 0;
  input.slots.forEach((slot, index) => {
    let post: SocialPostDraft | undefined;
    if (slot.kind === "nouvel_article") {
      post = newArticlePost(ctx, slot, index);
    } else {
      const pillar = pillars[k] ?? "projection";
      const format = formats[k] ?? "static";
      post = postFor(ctx, pillar, k, format) ?? projectionPost(ctx, k, format);
      k += 1;
    }
    if (post) posts.push({ ...post, slot: index, accentRole: ACCENTS[(seed + index) % ACCENTS.length] ?? "primary" });
  });
  return { posts };
}

// ─── Requête ─────────────────────────────────────────────────────────────────

export type MockSocialRequestInput = {
  topic: string;
  format: SocialFormat;
  accentHex: string | null;
  /** "YYYY-MM-DD" */
  scheduledFor: string;
  recentTopics: string[];
};

/** Mots trop courants pour rapprocher une demande d'un élément du site. */
const MATCH_STOPWORDS = new Set([
  "pour", "dans", "avec", "sans", "vous", "votre", "nous", "notre", "cette", "comme", "plus", "tout", "tous",
  "toute", "mais", "leur", "elle", "sont", "etre", "avoir", "fait", "faire", "bien", "tres", "aussi", "chez",
  "entre", "apres", "avant", "deja", "encore", "toujours", "jamais", "peut", "depuis", "sous", "vers", "dire",
  "parler", "carrousel", "story", "post", "visuel", "contenu", "publication", "idee", "recue", "version",
  "mois", "semaine", "jour", "petit", "petite", "grand", "grande", "dont", "quoi", "lors", "premiere", "premier",
  "quelques", "simple", "simples", "seance", "seances", "rendez", "prends", "prendre", "mettre", "envie",
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !MATCH_STOPWORDS.has(w)),
  );
}

function commonWords(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n;
}

type Match = { kind: "specialty" | "article" | "faq"; index: number; score: number };

/** Élément du site le plus proche de la demande (mots communs ≥ 4 lettres, sans accents). */
function bestMatch(brief: SocialSiteBrief, topic: string): Match | undefined {
  const asked = words(topic);
  let best: Match | undefined;
  const consider = (kind: Match["kind"], index: number, label: string) => {
    const score = commonWords(asked, words(label));
    if (score > 0 && (!best || score > best.score)) best = { kind, index, score };
  };
  brief.home.specialties.forEach((s, i) => consider("specialty", i, `${s.title} ${s.excerpt}`));
  brief.articles.forEach((a, i) => consider("article", i, a.title));
  brief.home.faq.forEach((f, i) => consider("faq", i, f.question));
  return best;
}

function keywordPillar(topic: string): SocialPillar | undefined {
  const t = topic.toLowerCase();
  if (/\bavis\b|t[ée]moignage/.test(t)) return "avis";
  if (/rendez-vous|\brdv\b|adresse|tarif|horaire|prix|cabinet|r[èe]glement/.test(t)) return "infos_pratiques";
  if (/s[ée]ance|d[ée]roul|coulisse/.test(t)) return "coulisses";
  return undefined;
}

function accentFromWords(topic: string): SocialPostDraft["accentRole"] {
  const t = topic.toLowerCase();
  if (/sombre|profond/.test(t)) return "deep";
  if (/fonc[ée]/.test(t)) return "primaryDark";
  if (/dou(x|ce)|clair|pastel|l[ée]ger/.test(t)) return "soft";
  return "primary";
}

/** Demande adaptée : vocabulaire interdit ou information absente du site. */
function noteFor(brief: SocialSiteBrief, topic: string): string | undefined {
  const t = topic.toLowerCase();
  const infos = `${brief.home.infoCards.map((c) => c.text).join(" ")} ${brief.home.contact?.note ?? ""}`.toLowerCase();
  if (/samedi|dimanche|horaire|soir|week-end/.test(t) && !/samedi|dimanche|horaire|soir|week-end/.test(infos)) {
    return "Nous avons adapté votre demande : les horaires n'étant pas sur votre site, le contenu invite à vous contacter sans citer de jour.";
  }
  if (/tarif|prix|€/.test(t) && !/€/.test(infos)) {
    return "Nous avons adapté votre demande : les tarifs n'étant pas sur votre site, le contenu invite à vous contacter sans citer de montant.";
  }
  if (/promo|r[ée]duction|offre|gratuit|avant\s*\/\s*apr[èe]s|gu[ée]ri|soign|trait/.test(t)) {
    return "Nous avons adapté votre demande : certaines formulations ne sont pas autorisées en communication bien-être, nous avons reformulé dans l'esprit.";
  }
  return undefined;
}

/**
 * Un contenu relié à l'élément du site le plus proche de la demande
 * (spécialité, article, question fréquente), sinon par mots-clés (avis,
 * infos pratiques, coulisses), sinon « projection ». Format imposé.
 */
export function mockSocialRequest(brief: SocialSiteBrief, input: MockSocialRequestInput): SocialPlan {
  const seed = hash31(`${brief.practitioner.city}|${brief.siteName}|${input.scheduledFor}|${input.topic}`);
  const ctx = makeCtx(brief, input.recentTopics, seed);
  const keyword = keywordPillar(input.topic);
  // Un mot-clé explicite (avis, rendez-vous, séance…) l'emporte sur un rapprochement faible
  const found = bestMatch(brief, input.topic);
  const match = found && (found.score >= 2 || !keyword) ? found : undefined;
  const { format } = input;

  let post: SocialPostDraft | undefined;
  /** Demande « avis » adaptée : aucun avis exploitable, ou format sans template « avis » */
  let avisNote: string | undefined;
  if (match?.kind === "specialty") {
    post = specialitePost({ ...ctx, seed: match.index, recent: [] }, 0, format);
  } else if (match?.kind === "article") {
    const article = brief.articles[match.index];
    const scoped = { ...ctx, seed: 0, recent: [] };
    post =
      format === "carousel" || !article?.exerciseSteps.length
        ? articlePost({ ...scoped, seed: (match.index - 1 + brief.articles.length) % brief.articles.length }, 0, format)
        : conseilPost({ ...scoped, seed: match.index }, 0, format);
  } else if (match?.kind === "faq") {
    post = ideeRecuePost({ ...ctx, seed: match.index, recent: [] }, 0, format);
  } else if (keyword === "avis") {
    if (brief.siteType !== "client" || brief.reviews.length === 0) {
      avisNote =
        "Nous avons adapté votre demande : aucun avis Google exploitable n'est relié à votre site, le contenu met donc en avant votre accompagnement.";
    } else if (format !== "static") {
      avisNote = `Nous avons adapté votre demande : les avis Google se présentent en visuel unique, ${format === "story" ? "cette story" : "ce carrousel"} met donc en avant votre accompagnement.`;
    } else {
      post = avisPost(ctx, 0);
    }
  } else if (keyword === "infos_pratiques") {
    post = infosPost(ctx, 0, format, { invite: true });
  } else if (keyword === "coulisses") {
    post = coulissesPost(ctx, 0, format);
  }
  post ??= projectionPost(ctx, 0, format);

  const note = avisNote ?? noteFor(brief, input.topic);
  return {
    posts: [
      {
        ...post,
        accentRole: accentFromWords(input.topic),
        ...(note ? { note } : {}),
      },
    ],
  };
}
