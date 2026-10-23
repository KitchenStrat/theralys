/**
 * Brief de site pour la génération des contenus réseaux sociaux : une vue
 * compacte et sans HTML du site (accueil, pages de motifs, articles, avis,
 * photos) que le modèle reçoit comme seule source autorisée.
 *
 * Fonction pure, testée sans base : le studio (`apps/studio/lib/social/brief.ts`)
 * fait les requêtes puis appelle `buildSocialBrief`. Les types d'entrée sont
 * structurels (sous-ensembles des lignes drizzle) pour ne pas dépendre de
 * `@theralys/db`.
 */

import type { Section, SiteTheme } from "./content";
import { futureBodyText } from "./content";
import { DEFAULT_SOCIAL_VOICE, type SocialSourceRef, type SocialVoice } from "./social";
import { plainText, stripEmoji, truncateAtWord } from "./social-text";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SocialPhotoKind = "hero" | "about" | "future" | "motif" | "article";

export type SocialPhoto = {
  /** "p1".."p20" — seul identifiant transmis au modèle (`imageRef`) */
  id: string;
  kind: SocialPhotoKind;
  orientation: "portrait" | "landscape";
  /** Vrai uniquement pour les photos téléversées par le client (Blob Vercel) */
  portraitSafe: boolean;
  hint: string;
};

/** Structure éditoriale d'un article (cf. ARTICLE_STRUCTURE), extraite du markdown. */
export type ArticleOutline = {
  lead?: string;
  signs: string[];
  quote?: string;
  contributions: string[];
  exerciseIntro?: string;
  exerciseSteps: string[];
  whenToConsult: string[];
  faq: { question: string; answer: string }[];
};

export type SocialBriefArticle = {
  /** "article:<uuid>" */
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** "YYYY-MM-DD" */
  publishAt?: string;
  /** Article planifié, pas encore en ligne (« à paraître le … ») */
  isUpcoming: boolean;
  photoId?: string;
  lead: string;
  signs: string[];
  quote?: string;
  contributions: string[];
  exerciseIntro?: string;
  exerciseSteps: string[];
  whenToConsult: string[];
  faq: { question: string; answer: string }[];
};

export type SocialSiteBrief = {
  practitioner: {
    firstName: string;
    lastName: string;
    profession: string;
    practiceName: string;
    city: string;
    gender: "feminin" | "masculin";
  };
  voice: SocialVoice;
  siteType: "demo" | "client";
  siteName: string;
  /** siteUrl(site) sans protocole */
  domain: string;
  hasBookingUrl: boolean;
  google?: { rating: number; reviewCount: number };
  home: {
    hero?: { badge?: string; title: string; paragraphs: string[]; stats: { value: string; label: string }[] };
    highlights: { id: string; title: string; text?: string }[];
    specialties: { id: string; slug: string; title: string; excerpt: string; pageId?: string; photoId?: string }[];
    future?: { id: "section:home:future"; title: string; lines: string[] };
    about?: { id: "section:home:about"; title: string; paragraphs: string[]; credentials: string[] };
    infoCards: { id: "section:home:infos"; title: string; text: string }[];
    process: { id: "section:home:process"; title: string; description: string }[];
    faq: { id: string; question: string; answer: string }[];
    contact?: { id: "section:home:contact"; address?: string; note?: string };
  };
  motifPages: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    headings: string[];
    photoId?: string;
    faq: { id: string; question: string; answer: string }[];
  }[];
  articles: SocialBriefArticle[];
  /** Sites clients uniquement, note ≥ 4, texte 40-240 caractères, « Prénom I. » */
  reviews: { id: string; authorName: string; rating: number; text: string }[];
  photos: SocialPhoto[];
};

export type SocialBriefInput = {
  site: {
    id: string;
    name: string;
    type: "demo" | "client";
    theme: SiteTheme;
    bookingUrl: string | null;
    /** siteUrl(site) — avec protocole */
    url: string;
  };
  prospect: {
    firstName: string;
    lastName: string;
    profession: string;
    city: string;
    gender: "feminin" | "masculin";
    googleRating: number | null;
    googleReviewCount: number | null;
  } | null;
  pages: {
    id: string;
    type: string;
    slug: string;
    title: string;
    metaDescription: string | null;
    sections: Section[];
  }[];
  articles: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    content: string;
    imageUrl: string | null;
    status: string;
    publishAt: Date | string | null;
  }[];
  reviews: { id: string; authorName: string; rating: number; text: string }[];
  voice: SocialVoice | null;
  /** ex. « la sophrologie » (resolveProfession(profession).practiceName) */
  practiceName: string;
  /** Instant de référence pour `isUpcoming` (défaut : maintenant) */
  now?: Date;
};

export type SocialBriefResult = {
  brief: SocialSiteBrief;
  /** id photo → URL (jamais transmis au modèle) */
  photosById: Record<string, string>;
  /** id de source → libellé/lien affichés au praticien */
  refsById: Record<string, SocialSourceRef>;
};

/** Plafond de taille du brief sérialisé (≈ 7 000 tokens). */
export const SOCIAL_BRIEF_MAX_CHARS = 28_000;
export const SOCIAL_BRIEF_MAX_PHOTOS = 20;

export const REQUEST_SOURCE_REF: SocialSourceRef = {
  kind: "request",
  id: "request",
  label: "Votre demande",
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/** Texte brut tronqué au mot (+ « … »). */
export function clip(text: string | null | undefined, max: number): string {
  return truncateAtWord(plainText(text).replace(/\n+/g, " "), max);
}

function clipLines(text: string | null | undefined, max: number, count: number): string[] {
  return plainText(text)
    .split("\n")
    .map((l) => l.replace(/^-\s+/, "").trim())
    .filter((l) => l !== "")
    .slice(0, count)
    .map((l) => truncateAtWord(l, max));
}

/** Photo téléversée par le client (Blob Vercel) : peut représenter le praticien. */
export function portraitSafeUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Orientation devinée depuis l'URL (paramètres Pexels w/h), paysage par défaut. */
export function photoOrientation(url: string): SocialPhoto["orientation"] {
  try {
    const params = new URL(url).searchParams;
    if (params.get("orientation") === "portrait") return "portrait";
    const w = Number(params.get("w"));
    const h = Number(params.get("h"));
    if (w > 0 && h > 0 && h > w) return "portrait";
  } catch {
    // data:URI ou URL invalide : paysage
  }
  return "landscape";
}

export type PhotoCatalog = {
  /** Enregistre une photo (dédoublonnée par URL) et renvoie son id, ou undefined si absente/pleine. */
  add(url: string | null | undefined, kind: SocialPhotoKind, hint: string): string | undefined;
  readonly photos: SocialPhoto[];
  readonly byId: Record<string, string>;
};

/** Catalogue des photos du site : ids « p1 ».. transmis au modèle, URLs gardées côté serveur. */
export function photoCatalog(max = SOCIAL_BRIEF_MAX_PHOTOS): PhotoCatalog {
  const photos: SocialPhoto[] = [];
  const byId: Record<string, string> = {};
  const byUrl = new Map<string, string>();
  return {
    photos,
    byId,
    add(url, kind, hint) {
      if (!url) return undefined;
      const known = byUrl.get(url);
      if (known) return known;
      if (photos.length >= max) return undefined;
      const id = `p${photos.length + 1}`;
      byUrl.set(url, id);
      byId[id] = url;
      photos.push({
        id,
        kind,
        orientation: photoOrientation(url),
        portraitSafe: portraitSafeUrl(url),
        hint: truncateAtWord(hint, 80),
      });
      return id;
    },
  };
}

export function sourceRefKind(id: string): SocialSourceRef["kind"] {
  if (id === "request") return "request";
  if (id.startsWith("page:")) return "page";
  if (id.startsWith("article:")) return "article";
  if (id.startsWith("review:")) return "review";
  return "section";
}

const GENERIC_REF_LABEL: Record<SocialSourceRef["kind"], string> = {
  section: "Votre site",
  page: "Page de votre site",
  article: "Article de votre blog",
  review: "Avis Google",
  request: "Votre demande",
};

/** Référence enrichie (libellé/lien) depuis `refsById`, sinon un libellé générique. */
export function describeSourceRef(
  id: string,
  refsById?: Record<string, SocialSourceRef>,
): SocialSourceRef {
  const known = refsById?.[id];
  if (known) return known;
  const kind = sourceRefKind(id);
  return { kind, id, label: GENERIC_REF_LABEL[kind] };
}

/** « Marie Lefèvre » → « Marie L. » ; « Marie L. » inchangé. */
function initialedName(name: string): string {
  const parts = stripEmoji(name).trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const firstCap = first.charAt(0).toUpperCase() + first.slice(1);
  const last = parts[1];
  if (!last) return firstCap;
  return `${firstCap} ${last.charAt(0).toUpperCase()}.`;
}

/** Texte en alphabet latin (étendu) — rejette cyrillique, arabe, han… */
function isLatinText(text: string): boolean {
  return !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text);
}

function stripProtocol(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
}

function section<T extends Section["type"]>(
  sections: Section[],
  type: T,
): Extract<Section, { type: T }> | undefined {
  return sections.find((s): s is Extract<Section, { type: T }> => s.type === type);
}

// ─── Structure d'un article ──────────────────────────────────────────────────

type MdSection = { level: number; title: string; lines: string[] };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET_RE = /^\s*[-*•]\s+/;
const NUMBERED_RE = /^\s*\d{1,2}[.)]\s+/;
const QUOTE_RE = /^\s*>\s?/;

function splitMarkdown(markdown: string): { preamble: string[]; sections: MdSection[] } {
  const preamble: string[] = [];
  const sections: MdSection[] = [];
  let current: MdSection | null = null;
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = HEADING_RE.exec(raw);
    if (heading) {
      current = { level: heading[1]!.length, title: heading[2]!.trim(), lines: [] };
      sections.push(current);
      continue;
    }
    (current ? current.lines : preamble).push(raw);
  }
  return { preamble, sections };
}

function isPlainLine(line: string): boolean {
  return (
    line.trim() !== "" && !BULLET_RE.test(line) && !NUMBERED_RE.test(line) && !QUOTE_RE.test(line)
  );
}

/** Paragraphes (lignes de texte consécutives), hors listes et citations. */
function paragraphsOf(lines: string[]): string[] {
  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) out.push(buffer.join(" "));
    buffer = [];
  };
  for (const line of lines) {
    if (isPlainLine(line)) buffer.push(line.trim());
    else flush();
  }
  flush();
  return out;
}

function listOf(lines: string[], marker: RegExp): string[] {
  return lines.filter((l) => marker.test(l)).map((l) => l.replace(marker, "").trim());
}

function quoteOf(lines: string[]): string | undefined {
  const line = lines.find((l) => QUOTE_RE.test(l));
  if (!line) return undefined;
  const text = plainText(line.replace(QUOTE_RE, ""))
    .replace(/^[*_]+|[*_]+$/g, "")
    .replace(/^[«"“]\s*|\s*[»"”]$/g, "")
    .trim();
  return text === "" ? undefined : text;
}

const EXERCISE_RE = /exercice/i;
const WHEN_RE = /quand\s+consulter/i;
const FAQ_RE = /questions?\s+fr[ée]quentes?|\bfaq\b/i;

/**
 * Extrait la structure éditoriale d'un article (ARTICLE_STRUCTURE) de façon
 * tolérante : accroche, signes, citation, apports, exercice (intro + étapes),
 * quand consulter, FAQ. Les champs absents sont omis, les listes vides.
 */
export function parseArticleOutline(markdown: string): ArticleOutline {
  const { preamble, sections } = splitMarkdown(markdown);
  const outline: ArticleOutline = {
    signs: [],
    contributions: [],
    exerciseSteps: [],
    whenToConsult: [],
    faq: [],
  };

  const leadSource = paragraphsOf(preamble)[0] ?? paragraphsOf(sections[0]?.lines ?? [])[0];
  if (leadSource) outline.lead = clip(leadSource, 300);

  const exercise = sections.find((s) => EXERCISE_RE.test(s.title));
  const when = sections.find((s) => WHEN_RE.test(s.title));
  const faq = sections.find((s) => FAQ_RE.test(s.title));
  const topical = sections.filter(
    (s) =>
      s.level <= 2 &&
      s !== exercise &&
      s !== when &&
      s !== faq &&
      !(s.level === 1 && s === sections[0]),
  );
  const [understand, bring] = topical;

  if (understand) {
    const signs = listOf(understand.lines, BULLET_RE);
    outline.signs = (signs.length > 0 ? signs : listOf(understand.lines, NUMBERED_RE))
      .slice(0, 6)
      .map((s) => clip(s, 160));
  }
  const quote = quoteOf([...preamble, ...sections.flatMap((s) => s.lines)]);
  if (quote) outline.quote = truncateAtWord(quote, 200);

  const bringSource = bring ?? understand;
  const numbered = bringSource ? listOf(bringSource.lines, NUMBERED_RE) : [];
  const bringBullets = bring ? listOf(bring.lines, BULLET_RE) : [];
  outline.contributions = (numbered.length > 0 ? numbered : bringBullets)
    .slice(0, 5)
    .map((s) => clip(s, 160));

  if (exercise) {
    const intro = paragraphsOf(exercise.lines)[0];
    if (intro) outline.exerciseIntro = clip(intro, 200);
    const steps = listOf(exercise.lines, NUMBERED_RE);
    outline.exerciseSteps = (steps.length > 0 ? steps : listOf(exercise.lines, BULLET_RE))
      .slice(0, 7)
      .map((s) => clip(s, 160));
  }

  if (when) {
    const items = listOf(when.lines, BULLET_RE);
    outline.whenToConsult = (items.length > 0 ? items : listOf(when.lines, NUMBERED_RE))
      .slice(0, 4)
      .map((s) => clip(s, 160));
  }

  if (faq) {
    const items: { question: string; answer: string }[] = [];
    let question: string | null = null;
    let answer: string[] = [];
    const flush = () => {
      if (question && answer.length > 0) items.push({ question, answer: answer.join(" ") });
      question = null;
      answer = [];
    };
    for (const line of faq.lines) {
      const bold = /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
      if (bold) {
        flush();
        question = bold[1]!.trim();
      } else if (question && isPlainLine(line)) {
        answer.push(line.trim());
      }
    }
    flush();
    // Variante : questions en sous-titres « ### … ? » après la section FAQ
    const faqIndex = sections.indexOf(faq);
    for (const sub of sections.slice(faqIndex + 1)) {
      if (sub.level <= faq.level) break;
      const first = paragraphsOf(sub.lines)[0];
      if (first) items.push({ question: sub.title, answer: first });
    }
    outline.faq = items
      .slice(0, 3)
      .map((it) => ({ question: clip(it.question, 160), answer: clip(it.answer, 220) }));
  }

  return outline;
}

// ─── Brief ───────────────────────────────────────────────────────────────────

/** Repli quand le site n'a pas de prospect : « Prénom Nom, métier à Ville ». */
function practitionerFromSiteName(name: string, accord: "feminin" | "masculin") {
  const m = /^(\S+)\s+([^,]+),\s*(.+?)\s+à\s+(.+)$/u.exec(name.trim());
  return {
    firstName: m?.[1] ?? name.trim(),
    lastName: m?.[2] ?? "",
    profession: m ? m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1) : "",
    city: m?.[4] ?? "",
    gender: accord,
  };
}

export function buildSocialBrief(input: SocialBriefInput): SocialBriefResult {
  const now = input.now ?? new Date();
  const disabled = new Set(input.site.theme.disabledMotifs ?? []);
  const photos = photoCatalog();
  const refsById: Record<string, SocialSourceRef> = {};
  const ref = (kind: SocialSourceRef["kind"], id: string, label: string, href?: string): string => {
    refsById[id] = href ? { kind, id, label, href } : { kind, id, label };
    return id;
  };
  const siteHref = input.site.url;

  const voice: SocialVoice = input.voice ?? {
    ...DEFAULT_SOCIAL_VOICE,
    accord: input.prospect?.gender ?? DEFAULT_SOCIAL_VOICE.accord,
  };
  const practitioner = input.prospect
    ? {
        firstName: input.prospect.firstName,
        lastName: input.prospect.lastName,
        profession: input.prospect.profession,
        city: input.prospect.city,
        gender: input.prospect.gender,
      }
    : practitionerFromSiteName(input.site.name, voice.accord);

  // ── Accueil ──
  const homePage = input.pages.find((p) => p.type === "home");
  const sections = homePage?.sections ?? [];
  const hero = section(sections, "hero");
  const highlights = section(sections, "highlights");
  const specialties = section(sections, "specialties");
  const future = section(sections, "future");
  const about = section(sections, "about");
  const process = section(sections, "process");
  const faq = section(sections, "faq");
  const contact = section(sections, "contact");

  ref("section", "section:home:hero", "Page d'accueil", siteHref);
  photos.add(hero?.imageUrl, "hero", "Photo d'accueil (ambiance)");

  const motifPagesRaw = input.pages.filter((p) => p.type === "motif" && !disabled.has(p.slug));
  const motifBySlug = new Map(motifPagesRaw.map((p) => [p.slug, p]));

  const home: SocialSiteBrief["home"] = {
    highlights: (highlights?.items ?? []).slice(0, 4).map((it, i) => {
      const id = ref("section", `section:home:highlights:${i}`, `Point fort « ${clip(it.title, 60)} »`, siteHref);
      const text = it.text ? clip(it.text, 160) : undefined;
      return text ? { id, title: clip(it.title, 60), text } : { id, title: clip(it.title, 60) };
    }),
    specialties: (specialties?.items ?? [])
      .filter((it) => !disabled.has(it.slug))
      .slice(0, 6)
      .map((it) => {
        const id = ref("section", `section:home:specialties:${it.slug}`, `Spécialité « ${clip(it.title, 60)} »`, siteHref);
        const page = motifBySlug.get(it.slug);
        const pageHero = page ? (section(page.sections, "hero")) : undefined;
        const photoId = photos.add(pageHero?.imageUrl ?? it.imageUrl, "motif", `Page « ${it.title} »`);
        return {
          id,
          slug: it.slug,
          title: clip(it.title, 60),
          excerpt: clip(it.excerpt, 200),
          ...(page ? { pageId: `page:${page.id}` } : {}),
          ...(photoId ? { photoId } : {}),
        };
      }),
    infoCards: (about?.infoCards ?? []).slice(0, 3).map((card) => ({
      id: "section:home:infos" as const,
      title: clip(card.title, 60),
      text: truncateAtWord(plainText(card.text).replace(/\n+/g, " · "), 160),
    })),
    process: (process?.steps ?? []).slice(0, 4).map((step) => ({
      id: "section:home:process" as const,
      title: clip(step.title, 60),
      description: clip(step.description, 160),
    })),
    faq: (faq?.items ?? []).slice(0, 7).map((it, i) => ({
      id: ref("section", `section:home:faq:${i}`, `Question fréquente « ${clip(it.question, 70)} »`, siteHref),
      question: clip(it.question, 160),
      answer: clip(it.answer, 220),
    })),
  };
  if (hero) {
    const badge = hero.badge ? clip(hero.badge, 60) : undefined;
    home.hero = {
      ...(badge ? { badge } : {}),
      title: clip(hero.title, 120),
      paragraphs: hero.paragraphs.slice(0, 2).map((p) => clip(p, 280)),
      stats: (hero.stats ?? []).slice(0, 3).map((s) => ({ value: clip(s.value, 20), label: clip(s.label, 60) })),
    };
  }
  if (future) {
    ref("section", "section:home:future", `Section « ${clip(future.title, 60)} »`, siteHref);
    home.future = {
      id: "section:home:future",
      title: clip(future.title, 120),
      lines: clipLines(futureBodyText(future), 120, 5),
    };
    photos.add(future.imageUrl, "future", "Section avenir (ambiance)");
  }
  if (about) {
    ref("section", "section:home:about", `Section « ${clip(about.title, 60)} »`, siteHref);
    const plainParagraphs = about.paragraphs.map((p) => plainText(p));
    const credentials = plainParagraphs
      .flatMap((p) => p.split("\n"))
      .filter((l) => l.startsWith("- "))
      .map((l) => truncateAtWord(l.slice(2).trim(), 120))
      .slice(0, 5);
    home.about = {
      id: "section:home:about",
      title: clip(about.title, 60),
      paragraphs: plainParagraphs
        .filter((p) => !p.split("\n").every((l) => l.startsWith("- ")))
        .slice(0, 2)
        .map((p) => truncateAtWord(p.replace(/\n+/g, " "), 300)),
      credentials,
    };
    const safe = about.imageUrl ? portraitSafeUrl(about.imageUrl) : false;
    photos.add(
      about.imageUrl,
      "about",
      safe ? "À propos : portrait du praticien" : "À propos (ambiance, pas le praticien)",
    );
  }
  if (home.infoCards.length > 0) ref("section", "section:home:infos", "Infos pratiques", siteHref);
  if (home.process.length > 0) ref("section", "section:home:process", "Déroulement d'une séance", siteHref);
  if (contact) {
    ref("section", "section:home:contact", "Informations de contact", siteHref);
    const address = contact.address ? clip(contact.address, 120) : undefined;
    const note = contact.note ? clip(contact.note, 160) : undefined;
    home.contact = {
      id: "section:home:contact",
      ...(address ? { address } : {}),
      ...(note ? { note } : {}),
    };
  }

  // ── Pages de motifs ──
  const motifPages: SocialSiteBrief["motifPages"] = motifPagesRaw.slice(0, 6).map((page) => {
    const id = ref("page", `page:${page.id}`, `Page « ${clip(page.title, 60)} »`, `${siteHref.replace(/\/+$/, "")}/motifs/${page.slug}`);
    const pageHero = section(page.sections, "hero");
    const rich = section(page.sections, "richText");
    const pageFaq = section(page.sections, "faq");
    const body = rich?.body ?? "";
    const summarySource = page.metaDescription?.trim() || paragraphsOf(splitMarkdown(body).preamble)[0] || paragraphsOf(splitMarkdown(body).sections[0]?.lines ?? [])[0] || pageHero?.paragraphs[0] || "";
    const headings = splitMarkdown(body)
      .sections.filter((s) => s.level <= 3)
      .slice(0, 5)
      .map((s) => clip(s.title, 90));
    const photoId = photos.add(pageHero?.imageUrl, "motif", `Page « ${page.title} »`);
    return {
      id,
      slug: page.slug,
      title: clip(page.title, 60),
      summary: clip(summarySource, 300),
      headings,
      ...(photoId ? { photoId } : {}),
      faq: (pageFaq?.items ?? []).slice(0, 3).map((it, i) => ({
        id: ref("section", `${id}:faq:${i}`, `Question « ${clip(it.question, 70)} »`, refsById[id]?.href),
        question: clip(it.question, 160),
        answer: clip(it.answer, 220),
      })),
    };
  });

  // ── Articles ──
  const toDate = (d: Date | string | null): Date | null => {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const articles: SocialSiteBrief["articles"] = input.articles
    .filter((a) => (a.status === "published" || a.status === "scheduled") && a.content.trim() !== "")
    .map((a) => ({ ...a, date: toDate(a.publishAt) }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 8)
    .map((a) => {
      const id = ref("article", `article:${a.id}`, `Article « ${clip(a.title, 60)} »`, `/publications/${a.id}`);
      const outline = parseArticleOutline(a.content);
      const photoId = photos.add(a.imageUrl, "article", `Article « ${a.title} »`);
      const publishAt = a.date ? a.date.toISOString().slice(0, 10) : undefined;
      return {
        id,
        slug: a.slug,
        title: clip(a.title, 120),
        excerpt: clip(a.excerpt ?? outline.lead ?? "", 200),
        ...(publishAt ? { publishAt } : {}),
        isUpcoming: a.date ? a.date.getTime() > now.getTime() : false,
        ...(photoId ? { photoId } : {}),
        lead: outline.lead ?? "",
        signs: outline.signs,
        ...(outline.quote ? { quote: outline.quote } : {}),
        contributions: outline.contributions,
        ...(outline.exerciseIntro ? { exerciseIntro: outline.exerciseIntro } : {}),
        exerciseSteps: outline.exerciseSteps,
        whenToConsult: outline.whenToConsult,
        faq: outline.faq,
      };
    });

  // ── Avis (clients uniquement) ──
  const reviews: SocialSiteBrief["reviews"] =
    input.site.type === "client"
      ? input.reviews
          .filter((r) => r.rating >= 4)
          .map((r) => ({ ...r, clean: plainText(stripEmoji(r.text)).replace(/\n+/g, " ") }))
          .filter((r) => r.clean.length >= 40 && r.clean.length <= 240 && isLatinText(r.clean))
          .slice(0, 6)
          .map((r) => {
            const authorName = initialedName(r.authorName);
            const id = ref("review", `review:${r.id}`, `Avis Google de ${authorName}`);
            return { id, authorName, rating: Math.round(r.rating), text: r.clean };
          })
      : [];

  const google =
    input.prospect?.googleRating != null && input.prospect.googleRating > 0
      ? { rating: input.prospect.googleRating, reviewCount: input.prospect.googleReviewCount ?? 0 }
      : undefined;

  const brief: SocialSiteBrief = {
    practitioner: { ...practitioner, practiceName: input.practiceName },
    voice,
    siteType: input.site.type,
    siteName: input.site.name,
    domain: stripProtocol(input.site.url),
    hasBookingUrl: Boolean(input.site.bookingUrl),
    ...(google ? { google } : {}),
    home,
    motifPages,
    articles,
    reviews,
    photos: photos.photos,
  };

  // ── Plafond : articles au-delà de 6, puis avis au-delà de 3, puis headings ──
  const size = () => JSON.stringify(brief).length;
  if (size() > SOCIAL_BRIEF_MAX_CHARS && brief.articles.length > 6) {
    brief.articles = brief.articles.slice(0, 6);
  }
  if (size() > SOCIAL_BRIEF_MAX_CHARS && brief.reviews.length > 3) {
    brief.reviews = brief.reviews.slice(0, 3);
  }
  if (size() > SOCIAL_BRIEF_MAX_CHARS) {
    brief.motifPages = brief.motifPages.map((p) => ({ ...p, headings: [] }));
  }
  // Photos d'articles écartés : retirées de la liste (les ids restent stables)
  const keptArticlePhotos = new Set(brief.articles.map((a) => a.photoId).filter(Boolean));
  brief.photos = brief.photos.filter((p) => p.kind !== "article" || keptArticlePhotos.has(p.id));

  return { brief, photosById: photos.byId, refsById };
}
