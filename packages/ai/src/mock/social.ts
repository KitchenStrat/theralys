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
 *
 * Variété : chaque pilier dispose d'au moins trois accroches, colorées par la
 * famille de pratique (sophrologie, hypnose…) et servies à tour de rôle dans
 * le mois ; un contenu du mois s'ouvre sur une accroche saisonnière
 * (SEASONAL_HOOKS) ; jamais deux fois le même sujet ni la même spécialité
 * dans un mois (clés de `subjectKeys`, comme `finalizePlan`).
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
  monthContext,
  rotatePillars,
  socialSeed,
  type MonthContext,
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
  subjectKeys,
  type SocialPlan,
  type SocialPostDraft,
  type SocialSlideDraft,
} from "../social";
import { voiceBricks, type VoiceBricks } from "../voice";
import { exerciseFor, practiceFamily, type PracticeFamily } from "./exercises";
import { deArticle, elideDe, withArticle } from "./french";

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
  /** Famille de pratique : accroches et exercice propres au métier */
  family: PracticeFamily;
  city: string;
  /** Sujets récents (studio) et articles annoncés dans le mois, en minuscules */
  recent: string[];
  /** Sujets déjà pris dans le mois en cours (topics et libellés des sources), en minuscules */
  monthUsed: string[];
  seed: number;
  /** Consignes du praticien interprétées par le mock */
  wishes: MockWishes;
  /** Contexte du mois planifié (saison, repères) ; absent pour une demande */
  month?: MonthContext;
  /** Accroches déjà servies par pilier dans le mois : la suivante est toujours différente */
  hookUse: Map<string, number>;
  /** Accroche saisonnière encore à placer (une par mois, sur le premier contenu qui s'y prête) */
  seasonalPending: boolean;
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

function makeCtx(brief: SocialSiteBrief, recent: string[], seed: number, month?: string): Ctx {
  const { firstName, profession, practiceName, city } = brief.practitioner;
  const ctx = month ? monthContext(month) : undefined;
  return {
    brief,
    b: voiceBricks(brief.voice),
    first: firstName,
    profession,
    professionLower: profession.toLowerCase(),
    practice: practiceName,
    practiceCap: capitalize(practiceName),
    family: practiceFamily(profession),
    city,
    recent: recent.map((t) => t.toLowerCase()),
    monthUsed: [],
    seed,
    wishes: parseMockWishes(brief.instructions),
    ...(ctx ? { month: ctx } : {}),
    hookUse: new Map(),
    seasonalPending: ctx !== undefined,
  };
}

/** État du contexte qui évolue au fil du mois (pour annuler un essai de contenu rejeté). */
type CtxState = { monthUsed: number; hookUse: Map<string, number>; seasonalPending: boolean };

function saveState(ctx: Ctx): CtxState {
  return { monthUsed: ctx.monthUsed.length, hookUse: new Map(ctx.hookUse), seasonalPending: ctx.seasonalPending };
}

function restoreState(ctx: Ctx, state: CtxState): void {
  ctx.monthUsed.length = state.monthUsed;
  ctx.hookUse = state.hookUse;
  ctx.seasonalPending = state.seasonalPending;
}

// ─── Aides texte ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
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

/** Phrase terminée : « . » ajouté s'il manque une ponctuation finale. */
function ended(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Première phrase, terminée par un point. */
function firstSentence(text: string): string {
  return ended((sentences(text)[0] ?? inline(text)).replace(/\s*[:;,]$/, ""));
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

/** Vrai si aucun des sujets de `taken` ne contient ce libellé. */
function freshIn(taken: readonly string[], label: string): boolean {
  const key = label.toLowerCase();
  return key === "" || !taken.some((t) => t.includes(key));
}

/**
 * Choix stable d'un élément : seuls les éléments citables (texte conforme),
 * d'abord ceux absents des sujets récents et du mois en cours, puis ceux
 * seulement absents des sujets récents, puis par graine.
 */
function pick<T>(ctx: Ctx, candidates: readonly T[], k: number, labelOf: (item: T) => string, textOf: (item: T) => string = labelOf): T | undefined {
  const items = candidates.filter((item) => compliant(textOf(item)));
  if (items.length === 0) return undefined;
  const notRecent = items.filter((item) => freshIn(ctx.recent, labelOf(item)));
  const notUsed = notRecent.filter((item) => freshIn(ctx.monthUsed, labelOf(item)));
  const pool = notUsed.length > 0 ? notUsed : notRecent.length > 0 ? notRecent : items;
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

/** « la sophrologie » → « sophrologie » ; « cette pratique de bien-être » → « bien-être ». */
function practiceBare(practice: string): string {
  return practice.replace(/^(cette pratique de|les|la|le|l['’])\s*/i, "");
}

/** « la sophrologie » → « #Sophrologie » ; « cette pratique de bien-être » → « #BienEtre ». */
function practiceTag(practice: string): string {
  return camelHashtag(practiceBare(practice));
}

/**
 * « votre sophrologue » / « ton hypnothérapeute » / « ta masseuse bien-être » :
 * possessif accordé au lecteur et au genre du praticien (« ton » devant une
 * voyelle, même au féminin).
 */
function yourProfession(ctx: Ctx): string {
  const feminine = ctx.brief.practitioner.gender === "feminin" && !/^[aeiouyàâäéèêëîïôöùûüœh]/i.test(ctx.professionLower);
  return `${feminine ? ctx.b.yourAdjF : ctx.b.yourAdj} ${ctx.professionLower}`;
}

/** « un exercice de sophrologie », « un exercice d'auto-hypnose », « une pause bien-être », « un exercice de respiration ». */
const EXERCISE_LABEL: Record<PracticeFamily, string> = {
  sophrologie: "un exercice de sophrologie",
  hypnose: "un exercice d'auto-hypnose",
  naturopathie: "une pause bien-être",
  massage: "un exercice de respiration",
  osteopathie: "un exercice de respiration",
  reflexologie: "un exercice de respiration",
  reiki: "un exercice de respiration",
  autre: "un exercice de respiration",
};

/** Photo qui peut représenter le praticien ou son cabinet (téléversée par le client) : « à propos » d'abord. */
function portraitPhoto(brief: SocialSiteBrief): string | undefined {
  const safe = brief.photos.filter((p) => p.portraitSafe);
  return (safe.find((p) => p.kind === "about") ?? safe[0])?.id;
}

// ─── Accroches ───────────────────────────────────────────────────────────────

/** Première ligne d'une légende (prompt : ≤ 125 caractères). */
const HOOK_MAX = 125;

/** Première variante qui tient dans la première ligne, sinon la plus courte. */
function fit(...candidates: string[]): string {
  return candidates.find((c) => c.length <= HOOK_MAX) ?? candidates.reduce((a, b) => (a.length <= b.length ? a : b));
}

type Shorten = (text: string, max: number) => string;

/**
 * « Titre. Suite. » qui tient dans la première ligne : le titre (phrase
 * terminée) est raccourci par `shorten` (articleTitle, shortLine) au budget
 * que la suite lui laisse — jamais un mot coupé en « … » quand une
 * proposition entière tient.
 */
function leadThenTail(lead: string, tail: string, shorten: Shorten): string {
  const full = `${ended(lead)} ${tail}`;
  if (full.length <= HOOK_MAX) return full;
  const budget = Math.max(20, HOOK_MAX - tail.length - 2);
  return `${ended(shorten(lead, budget))} ${tail}`;
}

/** « Préfixe : titre suffixe » qui tient dans la première ligne (titre raccourci par `shorten`). */
function prefixThenLead(prefix: string, lead: string, suffix: string, shorten: Shorten): string {
  const full = `${prefix}${lead}${suffix}`;
  if (full.length <= HOOK_MAX) return full;
  const budget = Math.max(20, HOOK_MAX - prefix.length - suffix.length);
  return `${prefix}${shorten(lead, budget)}${suffix}`;
}

/**
 * Variante d'accroche d'un pilier : l'ordre des variantes tourne avec la
 * graine, puis chaque usage du mois prend la suivante — deux contenus du même
 * pilier dans un mois n'ouvrent jamais de la même façon, et deux mois (ou
 * deux sites) n'ouvrent pas sur la même variante.
 */
function hookVariant(ctx: Ctx, key: string, variants: readonly string[]): string {
  const use = ctx.hookUse.get(key) ?? 0;
  ctx.hookUse.set(key, use + 1);
  return variants[(ctx.seed + use) % variants.length] ?? variants[0] ?? "";
}

/** Une phrase sur la pratique, propre à sa famille (≤ 80 caractères). */
const FAMILY_LINE: Record<PracticeFamily, (ctx: Ctx) => string> = {
  sophrologie: () => "avec la sophrologie, le souffle et le corps deviennent des points d'appui.",
  hypnose: (ctx) => `en hypnose, on s'appuie sur les ressources que ${ctx.b.reader("vous avez", "tu as")} déjà en ${ctx.b.reader("vous", "toi")}.`,
  naturopathie: () => "en naturopathie, on regarde l'hygiène de vie dans son ensemble.",
  massage: () => "sur la table, le corps relâche ce que la tête n'arrive pas à poser.",
  osteopathie: () => "en ostéopathie, on écoute d'abord ce que le corps a à dire.",
  reflexologie: () => "en réflexologie, tout commence par les pieds, et le reste du corps suit.",
  reiki: () => "avec le reiki, on laisse le calme s'installer, sans rien forcer.",
  autre: (ctx) => `avec ${ctx.practice}, on avance à ${ctx.b.yourAdj} rythme, sans rien forcer.`,
};

/** Piliers dont la légende peut s'ouvrir sur l'accroche saisonnière (jamais un avis, un article ni une question). */
const SEASONAL_PILLARS: readonly SocialPillar[] = ["specialite", "projection", "conseil", "coulisses", "infos_pratiques"];

/**
 * Accroches saisonnières par mois (1 à 12), accordées à la voix : saison et
 * repères du mois en France (MONTH_CONTEXT), sans date ni événement précis.
 * Choisie par graine (site + mois) : un même mois ne s'ouvre pas de la même
 * façon d'une année sur l'autre.
 */
export const SEASONAL_HOOKS: Record<number, readonly ((ctx: Ctx) => string)[]> = {
  1: [
    (c) => `Nouvelle année : pas de résolution impossible, juste l'envie de prendre un peu soin de ${c.b.reader("vous", "toi")}. ❄️`,
    (c) => `Jours courts, froid dehors : janvier invite à ralentir et à ${c.b.reader("vous", "te")} poser, sans pression. ❄️`,
  ],
  2: [
    (c) => `Au cœur de l'hiver, la fatigue de saison se fait sentir : un bon moment pour ${c.b.reader("vous offrir", "t'offrir")} une vraie pause. ☕`,
    (c) => `Février, vacances d'hiver pour certains, rythme chargé pour d'autres : et ${c.b.reader("vous", "toi")}, où en ${c.b.reader("êtes-vous", "es-tu")} ? ☕`,
  ],
  3: [
    (c) => `Le printemps arrive, la lumière revient : l'occasion de repartir du bon pied, à ${c.b.yourAdj} rythme. 🌸`,
    () => "Changement d'heure, journées qui s'allongent : le corps a parfois besoin d'un coup de pouce pour suivre. 🌸",
  ],
  4: [
    (c) => `La nature repart, et ${c.b.reader("vous", "toi")} ? Avril est une belle période pour ${c.b.reader("vous", "te")} remettre en mouvement en douceur. 🌱`,
    (c) => `Vacances de printemps ou pas, c'est le moment de faire de la place à ce qui ${c.b.reader("vous", "te")} fait du bien. 🌱`,
  ],
  5: [
    (c) => `Les beaux jours s'installent : et si mai devenait le mois où ${c.b.you} ${c.b.reader("preniez", "prenais")} enfin un peu de temps pour ${c.b.reader("vous", "toi")} ? ☀️`,
    () => "Examens en vue, échéances qui approchent : quelques repères simples pour aborder le jour J plus posément. ☀️",
  ],
  6: [
    () => "Bac, brevet, partiels : juin met la pression à toute la famille. Respirer un peu avant le jour J, ça compte. 📚",
    () => "L'été approche, les journées s'allongent : un bon moment pour faire le point et alléger ce qui pèse. 📚",
  ],
  7: [
    (c) => `L'été est là, le rythme ralentit : et si ${c.b.you} en ${c.b.reader("profitiez", "profitais")} pour ${c.b.reader("vous", "te")} retrouver vraiment ? 🌞`,
    () => "Chaleur, vacances, temps long : juillet invite à lever le pied et à écouter ce que le corps demande. 🌞",
  ],
  8: [
    () => "Au cœur de l'été, le corps apprécie la pause : de quoi arriver à la rentrée avec un peu plus d'air. 🌻",
    () => "Préparer la rentrée en douceur, ça commence maintenant, sans rien forcer. 🌻",
  ],
  9: [
    (c) => `C'est la rentrée : nouveau rythme, nouvelles échéances. Et si ${c.b.you} ${c.b.reader("gardiez", "gardais")} une place pour ${c.b.reader("vous", "toi")} dans l'agenda ? 🍂`,
    () => "Septembre, ses bonnes résolutions et son agenda qui se remplit : commencer par souffler est une bonne idée. 🍂",
  ],
  10: [
    () => "L'automne s'installe et la lumière baisse : le moment idéal pour cultiver le calme, chez soi comme au cabinet. 🍁",
    () => "Changement d'heure, journées plus courtes : le corps met parfois quelques jours à suivre. On en parle ? 🍁",
  ],
  11: [
    (c) => `Les jours raccourcissent, l'énergie baisse : novembre est le mois où prendre soin de ${c.b.reader("vous", "toi")} compte vraiment. 🍂`,
    (c) => `Pluie, froid, envie de cocooning : et si ${c.b.you} ${c.b.reader("profitiez", "profitais")} de novembre pour ralentir un peu ? 🍂`,
  ],
  12: [
    () => "Les fêtes approchent, l'agenda se remplit : s'accorder une pause avant la fin de l'année, c'est déjà un cadeau. ✨",
    () => "Décembre, l'heure des bilans : un moment pour regarder le chemin parcouru, avec bienveillance. ✨",
  ],
};

/** Accroche saisonnière du mois (par graine), ou undefined hors d'un mois planifié. */
function seasonalHook(ctx: Ctx): string | undefined {
  const variants = ctx.month ? SEASONAL_HOOKS[ctx.month.month] : undefined;
  if (!variants || variants.length === 0) return undefined;
  return variants[ctx.seed % variants.length]?.(ctx);
}

/** Accroches saisonnières possibles d'un mois (« YYYY-MM ») pour ce site, accordées à sa voix — tests et aperçu. */
export function seasonalHookVariants(month: string, brief: SocialSiteBrief): string[] {
  const ctx = makeCtx(brief, [], 0, month);
  return (ctx.month ? (SEASONAL_HOOKS[ctx.month.month] ?? []) : []).map((variant) => variant(ctx));
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
 * [Accroche saisonnière, sur le premier contenu du mois qui s'y prête] →
 * accroche du pilier (≤ 125 caractères, 1 emoji) → développement →
 * [prudence] → [question finale si les consignes le demandent] → ligne
 * « lien dans ma bio » → signature « Prénom, métier à Ville » (même structure
 * que le prompt live).
 */
function caption(ctx: Ctx, hook: string, development: string[], pillar: SocialPillar, k = 0): string {
  const dev = development.filter((p) => p.trim() !== "");
  const seasonal = ctx.seasonalPending && SEASONAL_PILLARS.includes(pillar) ? seasonalHook(ctx) : undefined;
  if (seasonal) ctx.seasonalPending = false;
  const mentionsCare = /sommeil|douleur/i.test([seasonal ?? "", hook, ...dev].join(" "));
  const prudent = pillar === "conseil" || pillar === "article" || mentionsCare;
  return [
    ...(seasonal ? [truncateAtWord(seasonal, HOOK_MAX)] : []),
    truncateAtWord(hook, HOOK_MAX),
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
  const familyLine = FAMILY_LINE[ctx.family](ctx);
  // Trois ouvertures, colorées par la pratique ; « Un temps pour vous… parlons de » ne sert qu'une fois par mois
  const subject = capitalize(withArticle(lower));
  const hook = hookVariant(ctx, "specialite", [
    fit(
      `Un temps pour ${toi}, rien que pour ${toi} : parlons ${deArticle(lower)} avec ${ctx.practice}. 🌿`,
      `Un temps pour ${toi}, rien que pour ${toi} : parlons ${deArticle(lower)}. 🌿`,
    ),
    fit(
      `${subject}, ça ${b.reader("vous", "te")} parle ? ${capitalize(familyLine)} 🌿`,
      `${subject} : ${familyLine} 🌿`,
      `${subject}, ça ${b.reader("vous", "te")} parle ? 🌿`,
    ),
    fit(
      `Et si on regardait ${withArticle(lower)} autrement, avec ${ctx.practice} ? Un chemin à ${b.yourAdj} rythme, séance après séance. 🌿`,
      `${subject} avec ${ctx.practice} : un chemin à ${b.yourAdj} rythme, séance après séance. 🌿`,
      `${subject}, autrement : un chemin à ${b.yourAdj} rythme, séance après séance. 🌿`,
      `${subject}, autrement ? 🌿`,
    ),
  ]);
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
  // Une vraie photo (page de la spécialité) plutôt qu'une carte illustrée dès qu'elle existe
  const template: SocialTemplate = photo ? "photo-titre" : "affirmation";
  return draft(ctx, {
    ...base,
    format,
    template,
    slides: [slide(title(spec.title), body(firstSentence(spec.excerpt), 200), { badge, imageRef: photo })],
  });
}

/** Hashtag thématique de l'exercice mock, par famille de pratique. */
const EXERCISE_TAG: Partial<Record<PracticeFamily, string>> = {
  sophrologie: "#RespirationAbdominale",
  hypnose: "#Ancrage",
  naturopathie: "#PauseBienEtre",
};

function conseilPost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft {
  const { brief, b } = ctx;
  const article = pick(
    ctx,
    brief.articles.filter((a) => a.exerciseSteps.length >= 2),
    k,
    (a) => a.title,
    (a) => [a.title, a.exerciseIntro ?? "", ...a.exerciseSteps].join("\n"),
  );
  const fromArticle = article !== undefined && article.exerciseSteps.length >= 2;
  // Sans article : l'exercice propre à la famille de pratique (respiration abdominale, ancrage 5-4-3-2-1, pause hydratation…)
  const exercise = exerciseFor(ctx.profession, brief.voice);
  const steps = (fromArticle ? article.exerciseSteps : exercise.steps).slice(0, 5);
  const intro = fromArticle
    ? article.exerciseIntro
      ? firstSentence(article.exerciseIntro)
      : `Un exercice tiré de l'article « ${article.title} ».`
    : firstSentence(exercise.intro.replace(/\s*:$/, "."));
  const refs = fromArticle ? [article.id] : ["section:home:hero"];
  const site = b.subj("mon site", "notre site", "le site");
  // « un exercice de sophrologie », « un exercice d'auto-hypnose », « une pause bien-être »… : l'accroche dit la pratique
  const label = EXERCISE_LABEL[ctx.family];
  const named = fromArticle ? `${capitalize(label)} tiré de l'article « ${articleTitle(article.title, 50)} »` : capitalize(exercise.name);

  const hook = hookVariant(ctx, "conseil", [
    `Trois minutes, les yeux fermés : ${label} à glisser dans ${b.yourAdjF} journée. 🧘`,
    fit(
      `${named} : un repère simple à tester dès ce soir, sans rien préparer. 🧘`,
      `${named}, à tester dès ce soir. 🧘`,
      `${capitalize(label)} tiré de l'article, à tester dès ce soir. 🧘`,
    ),
    `Besoin de souffler entre deux rendez-vous ? Voici ${label} à refaire autant de fois que nécessaire. 🧘`,
  ]);
  const development = fromArticle
    ? [
        intro,
        `${capitalize(b.reader("Vous le retrouverez", "Tu le retrouveras"))} en détail dans l'article « ${article.title} », sur ${site}. Un repère simple, à refaire dès que le besoin s'en fait sentir.`,
      ]
    : [
        intro,
        `C'est un repère simple que ${b.subj("je propose", "nous proposons", "on propose")} souvent en séance, à refaire chez ${b.reader("vous", "toi")} dès que le besoin s'en fait sentir.`,
      ];
  const tags = ["#ExerciceDuJour", fromArticle ? "#Respiration" : (EXERCISE_TAG[ctx.family] ?? "#Respiration")];
  const topic = fromArticle ? "Un exercice simple à faire chez soi" : `Un exercice simple : ${exercise.name}`;
  const base = { pillar: "conseil" as const, topic, hook, development, tags, sourceRefs: refs, k };
  const coverPhoto = (fromArticle ? article.photoId : undefined) ?? brief.photos.find((p) => p.kind === "hero")?.id;

  if (format === "carousel") {
    const pages = steps.map((s, i) => stepSlide(s, i));
    const cover = slide(
      fromArticle ? `${capitalize(numberWord(pages.length))} étapes pour relâcher la pression` : title(capitalize(exercise.name)),
      body(intro, 160),
      { imageRef: coverPhoto },
    );
    return draft(ctx, { ...base, format, template: "carrousel-etapes", slides: [cover, ...pages] });
  }
  if (format === "story") {
    return draft(ctx, {
      ...base,
      format,
      template: "story-rappel",
      slides: [slide("Un exercice simple à tester", body(`${steps[0]} ${steps[1]}`, 200), { imageRef: fromArticle ? article.photoId : undefined })],
    });
  }
  return draft(ctx, {
    ...base,
    format,
    template: "liste-conseils",
    slides: [slide(`Un exercice en ${numberWord(Math.min(3, steps.length))} étapes`, bulletBody(steps, 200))],
  });
}

function articlePost(ctx: Ctx, k: number, format: SocialFormat): SocialPostDraft | undefined {
  const { brief, b } = ctx;
  const article = pick(ctx, brief.articles, k + 1, (a) => a.title, (a) => [a.title, a.lead, a.excerpt, ...a.signs, ...a.contributions, ...a.whenToConsult].join("\n"));
  if (!article) return undefined;
  const site = b.subj("mon site", "notre site", "le site");
  const blog = b.subj("mon blog", "notre blog", "le blog");
  // Titre entier quand il tient dans la première ligne, sinon raccourci proprement (question ou proposition, jamais un mot coupé)
  const bare = practiceBare(ctx.practice);
  const hook = hookVariant(ctx, "article", [
    leadThenTail(article.title, `Le point de vue de ${yourProfession(ctx)}, en quelques lignes. 📖`, articleTitle),
    prefixThenLead(`À lire sur ${blog} ${elideDe(bare)} : `, article.title, " 📖", articleTitle),
    leadThenTail(article.title, `Trois idées à retenir, côté ${bare}. 📖`, articleTitle),
  ]);
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
  const bare = practiceBare(ctx.practice);
  const asked = title(faq.question, 160);
  const hook = hookVariant(ctx, "idee_recue", [
    prefixThenLead("« ", asked, ` » : une question qui revient souvent en ${bare}. 💬`, title),
    prefixThenLead(`On ${b.subj("me", "nous", "nous")} demande souvent, en ${bare} : « `, asked, " » 💬", title),
    prefixThenLead("« ", asked, ` » Bonne question : voici une réponse simple, côté ${bare}. 💬`, title),
  ]);
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
  const toi = b.reader("vous", "toi");
  const seance = `une séance ${elideDe(practiceBare(ctx.practice))}`;
  const hook = hookVariant(ctx, "coulisses", [
    `Comment se passe ${seance} ? Petit tour en coulisses. ✨`,
    `Beaucoup ${b.subj("me", "nous", "nous")} demandent à quoi ressemble ${seance}. Voici le déroulé, étape par étape. ✨`,
    fit(
      `Pousser la porte du cabinet, s'installer, respirer : ${seance}, c'est d'abord un temps pour ${toi}. ✨`,
      `Pousser la porte, s'installer, respirer : ${seance}, c'est d'abord un temps pour ${toi}. ✨`,
    ),
  ]);
  const development = [
    `${capitalize(process.map((s) => lowerFirst(s.title)).join(", "))} : ${numberWord(process.length)} temps pour ${b.reader("vous poser", "te poser")}, à ${b.yourAdj} rythme.`,
    about?.paragraphs[0]
      ? wholeText(about.paragraphs[0])
      : `${capitalize(b.subj(b.reader("Je vous explique", "Je t'explique"), b.reader("Nous vous expliquons", "Nous t'expliquons"), b.reader("On vous explique", "On t'explique")))} chaque étape, et rien n'est jamais forcé.`,
  ];
  const tags = ["#Coulisses", "#Seance"];
  const base = { pillar: "coulisses" as const, topic: "Comment se passe une séance ?", hook, development, tags, sourceRefs: refs, k };
  // Photo du cabinet ou du praticien (téléversée par le client) : une vraie photo plutôt qu'une carte
  const photo = portraitPhoto(brief);
  const summary = `${capitalize(numberWord(process.length))} temps, à ${b.yourAdj} rythme, sans rien à préparer.`;

  if (format === "carousel") {
    return draft(ctx, {
      ...base,
      format,
      template: "carrousel-etapes",
      slides: [
        slide("Comment se passe une séance ?", body(summary, 160), { imageRef: photo }),
        ...process.slice(0, 5).map((s) => slide(title(s.title), body(s.description, 160))),
      ],
    });
  }
  if (format === "story") {
    return draft(ctx, {
      ...base,
      format,
      template: "story-rappel",
      slides: [slide("Comment se passe une séance ?", body(process[0]?.description ?? "", 200), { imageRef: photo })],
    });
  }
  if (photo) {
    return draft(ctx, {
      ...base,
      format,
      template: "photo-titre",
      slides: [slide("Comment se passe une séance ?", body(summary, 200), { badge: `${ctx.profession} à ${ctx.city}`, imageRef: photo })],
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
  const seance = `première séance ${elideDe(practiceBare(ctx.practice))}`;
  const hook = hookVariant(ctx, "infos_pratiques", [
    `Les infos pratiques avant ${b.yourAdjF} ${seance}, en un coup d'œil. 📌`,
    `Une ${seance} se prépare sans stress : voici l'essentiel à savoir avant de venir. 📌`,
    `${b.reader("Vous hésitez", "Tu hésites")} encore ? Les questions pratiques que l'on pose le plus à ${yourProfession(ctx)}, et leurs réponses. 📌`,
  ]);
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
  const headline = inline(future?.title ?? hero?.title ?? `Et si ${b.you} ${b.reader("preniez", "prenais")} soin de ${b.reader("vous", "toi")} ?`);
  // Titre entier quand il tient dans la première ligne, sinon raccourci à une proposition (shortLine)
  const hook = hookVariant(ctx, "projection", [
    leadThenTail(headline, `Pas à pas, avec ${ctx.practice}. 🌱`, shortLine),
    leadThenTail(headline, `Un pas après l'autre, sans pression, avec ${yourProfession(ctx)}. 🌱`, shortLine),
    leadThenTail(headline, `Avec ${ctx.practice}, c'est un chemin qui se fait ensemble. 🌱`, shortLine),
  ]);
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
  const me = b.subj("me", "nous", "nous");
  const bare = practiceBare(ctx.practice);
  const hook = hookVariant(ctx, "avis", [
    `Merci ${review.authorName} pour ce retour qui ${me} touche, et qui parle si bien de ${ctx.practice}. 💛`,
    `Un mot de ${review.authorName} sur ${b.subj("mes", "nos", "nos")} séances ${elideDe(bare)}, qui fait chaud au cœur. 💛`,
    `${review.authorName} a pris le temps d'écrire ces quelques lignes après une séance ${elideDe(bare)}, et ça compte beaucoup. 💛`,
  ]);
  const development = [
    `« ${review.text} »`,
    `Ces mots ${me} rappellent pourquoi ${b.subj("j'ai choisi", "nous avons choisi", "on a choisi")} ${ctx.practice} : accompagner chacun, à son rythme, avec attention.`,
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
 * Au-delà d'un tour complet des piliers : ceux dont le contenu varie d'un
 * créneau à l'autre (une autre spécialité, une autre question, l'autre face
 * de la projection). Le pilier « conseil » n'en fait pas partie : un seul
 * exercice par mois.
 */
const WRAP_PILLARS: readonly SocialPillar[] = ["specialite", "idee_recue", "projection"];

export type MockSocialOptions = { variant?: "social" | "google" };

/**
 * Libellés d'un contenu accepté, mémorisés pour le reste du mois (`pick` les
 * évite) : son sujet, puis les titres de spécialité, d'article, la question
 * fréquente ou l'auteur d'avis de ses sources.
 */
function labelsOf(brief: SocialSiteBrief, post: SocialPostDraft): string[] {
  const labels = [post.topic];
  const faqs = [...brief.home.faq, ...brief.motifPages.flatMap((p) => p.faq)];
  for (const id of post.sourceRefs) {
    const spec = brief.home.specialties.find((s) => s.id === id || s.pageId === id);
    if (spec) labels.push(spec.title);
    const article = brief.articles.find((a) => a.id === id);
    if (article) labels.push(article.title);
    const faq = faqs.find((f) => f.id === id);
    if (faq) labels.push(faq.question);
    const review = brief.reviews.find((r) => r.id === id);
    if (review) labels.push(review.authorName);
  }
  return labels.map((l) => l.toLowerCase());
}

/**
 * Un contenu par créneau : piliers disponibles en rotation (jamais deux fois
 * de suite le même, au plus un avis), carrousels sur conseil/article, une
 * story sur le 4e créneau de cadence dès 6 créneaux. Jamais deux fois le même
 * sujet ni la même spécialité dans le mois : un contenu dont les clés
 * (`subjectKeys`) sont déjà prises est annulé et le créneau essaie un autre
 * pilier (WRAP_PILLARS), avant de retomber sur une projection.
 */
export function mockSocialMonth(brief: SocialSiteBrief, input: MockSocialMonthInput, opts: MockSocialOptions = {}): SocialPlan {
  const google = opts.variant === "google";
  // Les articles annoncés par un créneau « nouvel_article » ne sont pas repris ailleurs dans le mois
  const announced = input.slots
    .filter((s) => s.kind === "nouvel_article")
    .map((s) => brief.articles.find((a) => a.id === articleRefId(s.articleId ?? ""))?.title ?? "")
    .filter((t) => t !== "");
  const seed = socialSeed(brief, input.month);
  const ctx = makeCtx(brief, [...input.recentTopics, ...announced], seed, input.month);
  const rotated = rotatePillars(brief, input.month, google ? "google" : "social");
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
  // Fiche Google : un seul visuel par post, jamais de carrousel ni de story
  const formats: SocialFormat[] = pillars.map((p) => (!google && CAROUSEL_PILLARS.includes(p) ? "carousel" : "static"));
  if (!google && n >= 6 && formats.filter((f) => f === "carousel").length < 2) {
    const extra = pillars.findIndex((p, k) => p === "specialite" && formats[k] === "static");
    if (extra >= 0) formats[extra] = "carousel";
  }
  if (!google && n >= 6) {
    const storyAt = pillars.findIndex((p, k) => k >= 3 && !STORY_EXCLUDED.includes(p) && formats[k] === "static");
    if (storyAt >= 0) formats[storyAt] = "story";
  }

  const posts: SocialPostDraft[] = [];
  /** Clés de sujet déjà prises dans le mois (sujet normalisé, sources de spécialité) */
  const taken = new Set<string>();
  const isFree = (post: SocialPostDraft) => !subjectKeys(post).some((key) => taken.has(key));
  const accept = (post: SocialPostDraft, index: number) => {
    posts.push({ ...post, slot: index, accentRole: ACCENTS[(seed + index) % ACCENTS.length] ?? "primary" });
    for (const key of subjectKeys(post)) taken.add(key);
    ctx.monthUsed.push(...labelsOf(brief, post));
  };

  let k = 0;
  input.slots.forEach((slot, index) => {
    if (slot.kind === "nouvel_article") {
      const post = newArticlePost(ctx, slot, index);
      if (post) accept(post, index);
      return;
    }
    const planned = pillars[k] ?? "projection";
    const format = formats[k] ?? "static";
    const previous = posts.at(-1)?.pillar;
    const candidates = [...new Set<SocialPillar>([planned, ...wrap.filter((p) => p !== planned && p !== previous), "projection"])];
    let chosen: SocialPostDraft | undefined;
    for (const pillar of candidates) {
      const state = saveState(ctx);
      const post = postFor(ctx, pillar, k, format);
      if (post && isFree(post)) {
        chosen = post;
        break;
      }
      restoreState(ctx, state);
    }
    // Plus aucun sujet libre : projection quand même (finalizePlan écarte le doublon, le créneau reste libre)
    accept(chosen ?? projectionPost(ctx, k, format), index);
    k += 1;
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
  /** Instructions propres à ce contenu (régénération) : lues avant les consignes permanentes */
  instructions?: string;
};

/**
 * Consignes lues par le mock pour une demande : les instructions du contenu
 * d'abord (leurs hashtags passent en premier), puis les consignes permanentes.
 */
export function mergedMockInstructions(input: Pick<MockSocialRequestInput, "instructions">, brief: SocialSiteBrief): string | undefined {
  const parts = [input.instructions, brief.instructions].filter((t): t is string => typeof t === "string" && t.trim() !== "");
  return parts.length > 0 ? parts.join("\n") : undefined;
}

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
  const ctx: Ctx = { ...makeCtx(brief, input.recentTopics, seed), wishes: parseMockWishes(mergedMockInstructions(input, brief)) };
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
