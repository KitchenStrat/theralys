/**
 * Quelles pages lire, et dans quel ordre. Module pur : liens de la page
 * d'accueil et du plan de site, classement de chaque page d'après son adresse
 * et le texte de son lien, choix des pages les plus utiles au profil.
 *
 * Douze pages au plus sont lues : il faut donc viser juste. Ce qui décrit le
 * praticien passe d'abord (à propos, spécialités, prestations, tarifs,
 * contact, questions fréquentes, rendez-vous), puis une page de blog pour le
 * ton. Ce qui n'apprend rien sur son activité ou ne lui appartient pas n'est
 * pas lu : pages légales, panier, compte, recherche, flux, fichiers, archives,
 * pages de témoignages (propos de tiers, souvent sur leur santé).
 */

import type { CheerioAPI } from "cheerio/slim";
import { bareHost, type ExternalPageKind } from "@theralys/shared";
import { type DomElement, type DomNode, firstDescendant, hasClass, isElement, loadMarkup, textOf } from "./dom";
import { isHiddenByStyle } from "./extract";
import { MarkupTooComplexError } from "./markup-guard";
import { cleanLineMax, foldText } from "./text";

/** Périmètre de la lecture : le site (avec ou sans « www. ») et, si l'adresse donnée a un chemin, ce chemin et ce qu'il contient. */
export type SiteScope = {
  /** Origine servie par le site (`https://www.mon-cabinet.fr`) : toutes les pages sont demandées sur elle */
  origin: string;
  /** Chemin de base sans barre finale (`""` pour la racine, `/mon-cabinet` pour un site hébergé sous un chemin) */
  basePath: string;
  /** Chemin de la page d'accueil réellement servie (`/`, `/accueil/`) */
  homePath: string;
};

/** Où le lien a été trouvé : menu ou en-tête, corps de page, pied de page, plan de site. */
export type LinkArea = "nav" | "main" | "footer" | "sitemap";

export type PageLink = { url: string; text: string; area: LinkArea };

export type PageCandidate = {
  /** Adresse à demander, sur l'origine du site, sans ancre */
  url: string;
  /** Clé de dédoublonnage */
  key: string;
  kind: ExternalPageKind;
  area: LinkArea;
  /** Rang de découverte (ordre du document) */
  order: number;
};

// ─── Adresses ────────────────────────────────────────────────────────────────

const INDEX_FILE = /\/(?:index|default|home|accueil)\.(?:html?|php|aspx?)$/i;

const trimPath = (path: string): string => path.replace(/\/{2,}/g, "/").replace(INDEX_FILE, "/").replace(/\/+$/, "");

/** Clé d'une page : hôte sans « www. » et chemin sans barre finale ni fichier d'index. Deux écritures d'une même page ont la même clé. */
export function pageKey(url: URL): string {
  let path = trimPath(url.pathname);
  try {
    path = decodeURI(path);
  } catch {
    // Encodage illisible : chemin gardé tel quel
  }
  return `${bareHost(url.hostname)}${path}`;
}

/** L'adresse est-elle sur le site et sous son chemin de base ? */
export function isInScope(url: URL, scope: SiteScope): boolean {
  if (bareHost(url.hostname) !== bareHost(new URL(scope.origin).hostname)) return false;
  const path = trimPath(url.pathname);
  return scope.basePath === "" || path === scope.basePath || path.startsWith(`${scope.basePath}/`);
}

// ─── Classement ──────────────────────────────────────────────────────────────

/** Mot ou expression entier d'une forme repliée (`qui-suis-je`, `tarifs`). */
const words = (alternatives: string): RegExp => new RegExp(`(?:^|-)(?:${alternatives})(?:-|$)`);

const LEGAL = words("mentions-legales|mentions|legal|legales|cgv|cgu|conditions-generales(?:-de-vente|-d-utilisation)?|conditions-d-utilisation|politique-de-confidentialite|confidentialite|privacy(?:-policy)?|politique-(?:de|des)-cookies|cookies?|rgpd|gdpr|donnees-personnelles|terms(?:-of-(?:service|use)|-and-conditions)?|imprint|impressum|credits|plan-du-site|sitemap|accessibilite");
const FAQ = words("faq|foire-aux-questions|questions-frequentes|questions-reponses|vos-questions|questions");
const PRICING = words("tarifs?|tarification|prix|honoraires|pricing|prices?|rates|fees");
const CONTACT = words("contact|contacts|contactez-moi|contactez-nous|me-contacter|nous-contacter|coordonnees|acces|plan-d-acces|venir-au-cabinet|ou-me-trouver|ou-nous-trouver|infos-pratiques|informations-pratiques|horaires|localisation|find-us|directions");
const BOOKING = words("rdv|rendez-vous|prise-de-rdv|reservation|reservations|reserver|booking|book-now|book|appointments?|agenda");
const ABOUT = words(
  "a-propos|apropos|qui-suis-je|qui-sommes-nous|presentation|mon-parcours|parcours|biographie|bio|about|about-me|about-us|mon-histoire|notre-histoire|ma-demarche|mon-approche|ma-philosophie|la-praticienne|le-praticien|la-therapeute|le-therapeute|votre-praticienne?|votre-therapeute|l-equipe|equipe|team|mes-formations|formations-et-diplomes|diplomes",
);
const BLOG = words("blog|le-blog|actualites|actus?|articles|news|journal");
const SERVICES = words("prestations?|services?|seances?|accompagnements?|soins|specialites?|therapies|consultations?|ateliers?|stages?|formules|offres|methodes?|techniques|pratiques|domaines-d-intervention|champs-d-intervention|pour-qui|deroulement");
/** Disciplines et motifs de consultation des praticiens du bien-être : une page à ce nom est une page de spécialité. */
const SPECIALTY = words(
  [
    "sophrologie|sophrologue|hypnose|hypnotherapie|hypnotherapeute|naturopathie|naturopathe|reflexologie|reflexologue|massages?|reiki|osteopathie|osteopathe|psychotherapie|psychotherapeute|psychologue|psychologie|psychanalyse|psychopraticien(?:ne)?",
    "kinesiologie|kinesiologue|shiatsu|yoga|pilates|meditation|pleine-conscience|mindfulness|coaching|coach|emdr|eft|pnl|dietetique|dieteticien(?:ne)?|nutrition|nutritionniste|micronutrition|acupuncture|acupression|ayurveda|aromatherapie|phytotherapie|fleurs-de-bach",
    "magnetisme|magnetiseur|energetique|lithotherapie|art-therapie|musicotherapie|sexologie|sexotherapie|therapie-de-couple|therapie-familiale|tcc|gestalt|relaxation|qi-gong|tai-chi|chiropraxie|chiropracteur|etiopathie|fasciatherapie|iridologie|drainage-lymphatique|ventouses|access-bars",
    "stress|anxiete|angoisses?|sommeil|insomnies?|burn-out|burnout|depression|deuil|phobies?|addictions?|tabac|perte-de-poids|amincissement|minceur|confiance-en-soi|estime-de-soi|emotions?|douleurs?|grossesse|maternite|perinatalite|fertilite|menopause",
    "enfants?|adolescents?|ados|seniors?|entreprises?|sportifs?|preparation-mentale|examens|troubles-alimentaires|hypersensibilite|haut-potentiel|hpi|tdah|traumatismes?|trauma|digestion|allergies|migraines?|lombalgie|sciatique|nourrissons?|bebes?|femmes?-enceintes?",
  ].join("|"),
);
/** Propos de clients : pas lus (données de tiers, souvent de santé). */
const TESTIMONIALS = words("temoignages?|avis|avis-clients?|livre-d-or|testimonials?|reviews?|ils-temoignent|ils-en-parlent");
/** Pages de service du site, sans contenu sur le praticien : reconnues à un mot de l'adresse… */
const UTILITY = words("panier|cart|basket|checkout|paiement|payment|mon-compte|compte-client|my-account|connexion|login|log-in|signin|sign-in|logout|deconnexion|register|signup|sign-up|wp-admin|wp-login|wp-json|thank-you|unsubscribe|desinscription|espace-client|espace-membres?");
/** … ou au segment entier, pour les mots qui ont aussi un sens courant (« la recherche en sophrologie », « prise en compte »). */
const UTILITY_SEGMENT = /^(?:recherche|search|compte|account|commande|admin|feed|rss|atom|merci|404|newsletter|membres?)$/;
/** Autre nom de la page d'accueil. */
const HOME_SEGMENT = /^(?:accueil|home|index|bienvenue|welcome)$/;
/** Archives par étiquette, catégorie, auteur ou date. */
const ARCHIVE = words("tag|tags|etiquette|etiquettes|category|categorie|categories|author|auteur|archives?");

const FILE_EXTENSION = /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|zip|rar|7z|gz|docx?|xlsx?|pptx?|odt|ods|csv|txt|rtf|xml|json|rss|atom|ics|vcf|mp3|mp4|m4a|m4v|mov|avi|wmv|webm|ogg|wav|css|js|mjs|map|woff2?|ttf|eot|apk|exe|dmg)$/i;
const PAGE_EXTENSION = /\.(?:html?|php|aspx?|jsp)$/i;
const SYSTEM_PATH = /^\/(?:wp-admin|wp-login\.php|wp-json|wp-content|wp-includes|xmlrpc\.php|cdn-cgi|_next|static|assets|api)(?:\/|$)/i;
const PAGINATION = /\/(?:page|p)\/\d+\/?$/i;
const DATE_PATH = /\/(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/|$)/;

type Classification = { kind: ExternalPageKind; skip: boolean };

function classifyWords(folded: string): ExternalPageKind | null {
  if (folded === "") return null;
  if (LEGAL.test(folded)) return "legal";
  if (FAQ.test(folded)) return "faq";
  if (PRICING.test(folded)) return "pricing";
  if (CONTACT.test(folded)) return "contact";
  if (BOOKING.test(folded)) return "booking";
  if (ABOUT.test(folded)) return "about";
  if (BLOG.test(folded)) return "blog";
  if (SPECIALTY.test(folded)) return "specialty";
  if (SERVICES.test(folded)) return "services";
  return null;
}

/**
 * Nature d'une page d'après son adresse et le texte du lien qui y mène, et
 * s'il faut l'écarter de la lecture (`skip`) : hors du site, fichier, adresse
 * à paramètres, page de service, archive, page légale, article, témoignages.
 * L'adresse prime sur le texte du lien (« En savoir plus » ne dit rien) ; le
 * texte décide quand l'adresse est muette (`/page-3`).
 */
export function classifyPage(url: URL, linkText: string, scope: SiteScope): Classification {
  const skip = (kind: ExternalPageKind = "other"): Classification => ({ kind, skip: true });
  if (url.protocol !== "https:" && url.protocol !== "http:") return skip();
  if (!isInScope(url, scope)) return skip();
  const path = trimPath(url.pathname);
  // Une adresse à paramètres n'est pas lue — pas même « /?page_id=12 », qui n'est pas la page d'accueil
  if (url.search !== "") return skip();
  if (path === scope.basePath || path === trimPath(scope.homePath)) return { kind: "home", skip: false };
  if (FILE_EXTENSION.test(path) || SYSTEM_PATH.test(path) || PAGINATION.test(url.pathname)) return skip();

  const segments = path
    .slice(scope.basePath.length)
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => {
      try {
        return foldText(decodeURIComponent(segment).replace(PAGE_EXTENSION, ""));
      } catch {
        return foldText(segment.replace(PAGE_EXTENSION, ""));
      }
    });
  const last = segments[segments.length - 1] ?? "";
  const parents = segments.slice(0, -1);
  const text = foldText(linkText);

  if (segments.length === 1 && HOME_SEGMENT.test(last)) return { kind: "home", skip: false };
  if (segments.some((segment) => UTILITY.test(segment) || UTILITY_SEGMENT.test(segment) || ARCHIVE.test(segment))) return skip();
  if (segments.some((segment) => TESTIMONIALS.test(segment)) || (classifyWords(last) === null && TESTIMONIALS.test(text))) return skip();
  if (LEGAL.test(last)) return skip("legal");
  // Sous une rubrique de blog, ou dans une arborescence datée : un article
  if (parents.some((segment) => BLOG.test(segment)) || DATE_PATH.test(`${path}/`)) return skip("article");

  const fromPath = classifyWords(last);
  if (fromPath !== null) return { kind: fromPath, skip: false };
  // Page rangée sous une rubrique de prestations (« /soins/massage-du-dos ») : une spécialité
  if (parents.some((segment) => SERVICES.test(segment))) return { kind: "specialty", skip: false };
  const fromText = classifyWords(text);
  if (fromText === "legal") return skip("legal");
  if (fromText !== null) return { kind: fromText, skip: false };
  const fromParents = parents.map(classifyWords).find((kind) => kind !== null && kind !== "legal");
  return { kind: fromParents === "specialty" ? "specialty" : "other", skip: false };
}

// ─── Liens d'une page ────────────────────────────────────────────────────────

const LINK_TEXT_MAX = 120;
const LINKS_MAX = 400;
/** Liens examinés au plus par page (une vraie page en compte rarement mille), et longueur au-delà de laquelle une adresse n'en est plus une. */
const ANCHORS_MAX = 5_000;
const HREF_MAX = 2_048;
/** Texte brut lu dans un lien avant nettoyage. */
const LINK_RAW_TEXT_MAX = 2_000;

/**
 * Zone d'un élément d'après ses ancêtres : pied de page d'abord, sinon menu
 * ou en-tête, sinon corps. Chaque élément du document n'est examiné qu'une
 * fois, quel que soit le nombre de liens qu'il contient.
 */
function areaResolver(): (element: DomElement) => LinkArea {
  const known = new Map<DomNode, LinkArea>();
  const own = (element: DomElement): LinkArea => {
    const role = element.attribs.role;
    if (element.name === "footer" || role === "contentinfo") return "footer";
    if (element.name === "nav" || element.name === "header" || role === "navigation" || role === "banner" || hasClass(element, "menu") || hasClass(element, "navbar")) return "nav";
    return "main";
  };
  const merge = (inner: LinkArea, outer: LinkArea): LinkArea => (inner === "footer" || outer === "footer" ? "footer" : inner === "nav" || outer === "nav" ? "nav" : "main");
  return (element) => {
    // Remonte jusqu'à un ancêtre déjà classé, puis redescend en classant le chemin
    const path: DomElement[] = [];
    let area: LinkArea = "main";
    for (let current: DomNode | null = element; current !== null; current = current.parent) {
      const found = known.get(current);
      if (found !== undefined) {
        area = found;
        break;
      }
      if (isElement(current)) path.push(current);
    }
    for (let index = path.length - 1; index >= 0; index--) {
      area = merge(own(path[index]!), area);
      known.set(path[index]!, area);
    }
    return area;
  };
}

/**
 * Liens de la page vers d'autres pages du site (dans le périmètre), ramenés
 * sur l'origine du site, sans ancre, dans l'ordre du document. Les liens
 * marqués `nofollow` ou masqués en ligne ne sont pas suivis (ce sont souvent
 * des pièges à robots ou des pages de service). À appeler sur le document
 * intact, avant `extractPage`.
 */
export function collectLinks($: CheerioAPI, pageUrl: string, scope: SiteScope): PageLink[] {
  const links: PageLink[] = [];
  const base = $("base[href]").first().attr("href");
  let baseUrl = pageUrl;
  try {
    if (base) baseUrl = new URL(base, pageUrl).href;
  } catch {
    baseUrl = pageUrl;
  }
  const areaOf = areaResolver();
  for (const element of $("a[href]").toArray().slice(0, ANCHORS_MAX)) {
    if (links.length >= LINKS_MAX) break;
    const rawHref = element.attribs.href ?? "";
    if (rawHref.length > HREF_MAX) continue;
    const href = rawHref.trim();
    if (href === "" || href.startsWith("#") || /^(?:mailto|tel|javascript|sms|data|blob|ftp):/i.test(href)) continue;
    if (/\bnofollow\b/i.test(element.attribs.rel ?? "") || element.attribs.download !== undefined) continue;
    if (element.attribs.hidden !== undefined || isHiddenByStyle(element.attribs.style)) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !isInScope(url, scope)) continue;
    const target = new URL(`${url.pathname}${url.search}`, scope.origin);
    // Texte du lien, sinon son intitulé accessible ou le texte de remplacement de son image
    const text =
      cleanLineMax(textOf(element, LINK_RAW_TEXT_MAX), LINK_TEXT_MAX) ||
      cleanLineMax(element.attribs["aria-label"] || element.attribs.title || firstDescendant(element, (child) => child.name === "img" && child.attribs.alt !== undefined)?.attribs.alt || "", LINK_TEXT_MAX);
    links.push({ url: target.href, text, area: areaOf(element) });
  }
  return links;
}

// ─── Plan de site ────────────────────────────────────────────────────────────

const SITEMAP_ENTRIES_MAX = 500;

/**
 * Adresses d'un plan de site XML : pages (`<url><loc>`) et plans secondaires
 * (`<sitemap><loc>` d'un index). L'analyseur ne résout aucune entité externe.
 * Un plan trop imbriqué ou trop touffu pour être analysé sans risque ne donne
 * aucune adresse : le plan de site n'est qu'une aide à la découverte.
 */
export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  let $: CheerioAPI;
  try {
    $ = loadMarkup(xml, { xml: true });
  } catch (error) {
    if (error instanceof MarkupTooComplexError) return { pages: [], sitemaps: [] };
    throw error;
  }
  const read = (selector: string): string[] =>
    $(selector)
      .toArray()
      .slice(0, SITEMAP_ENTRIES_MAX)
      .map((element) => textOf(element, HREF_MAX + 1).trim())
      .filter((value) => value !== "" && value.length <= HREF_MAX);
  return { pages: read("url > loc"), sitemaps: read("sitemap > loc") };
}

/** Plans secondaires d'un index à lire d'abord : ceux des pages, jamais ceux des articles, étiquettes, auteurs ou produits. */
export function pickChildSitemaps(sitemaps: readonly string[], max: number): string[] {
  // WordPress nomme le plan de ses pages « wp-sitemap-posts-page-1.xml » : le préfixe n'est pas le type de contenu
  const nameOf = (url: string): string => (url.split(/[?#]/)[0]!.split("/").pop() ?? "").replace(/^wp-sitemap-(?:posts|taxonomies)-/i, "");
  const useful = sitemaps.filter((url) => !/(?:post|article|blog|news|tag|categor|taxonom|author|user|product|produit|image|video|attachment|media|event)/i.test(nameOf(url)));
  const pagesFirst = [...useful].sort((a, b) => Number(/page/i.test(nameOf(b))) - Number(/page/i.test(nameOf(a))));
  return pagesFirst.slice(0, max);
}

// ─── Choix des pages ─────────────────────────────────────────────────────────

/** Pages de spécialité lues au plus par lecture. */
export const SPECIALTY_PAGES_MAX = 6;

/**
 * Intérêt d'une page pour le profil : la première de chaque nature d'abord
 * (à propos, spécialité, prestations, tarifs, contact, questions,
 * rendez-vous, blog), chaque page supplémentaire d'une même nature valant
 * moins — plusieurs spécialités restent devant les tarifs, mais dix pages de
 * spécialité n'évincent pas la page de contact.
 */
const KIND_SCORE: Partial<Record<ExternalPageKind, { first: number; step: number; max: number }>> = {
  about: { first: 100, step: 45, max: 2 },
  specialty: { first: 92, step: 4, max: SPECIALTY_PAGES_MAX },
  services: { first: 90, step: 30, max: 2 },
  pricing: { first: 80, step: 40, max: 1 },
  contact: { first: 76, step: 30, max: 2 },
  faq: { first: 62, step: 0, max: 1 },
  booking: { first: 52, step: 0, max: 1 },
  blog: { first: 44, step: 0, max: 1 },
  other: { first: 30, step: 6, max: 3 },
};

const AREA_RANK: Record<LinkArea, number> = { nav: 0, main: 1, footer: 2, sitemap: 3 };

/** Liens → pages candidates : une par page (clé), classée, la page d'accueil et les pages à écarter retirées. */
export function toCandidates(links: readonly PageLink[], scope: SiteScope, known: ReadonlySet<string> = new Set()): PageCandidate[] {
  const byKey = new Map<string, PageCandidate>();
  let order = 0;
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    const { kind, skip } = classifyPage(url, link.text, scope);
    if (skip || kind === "home") continue;
    const key = pageKey(url);
    if (known.has(key)) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { url: link.url, key, kind, area: link.area, order: order++ });
      continue;
    }
    // Même page citée plusieurs fois : on garde le classement le plus parlant et l'emplacement le plus en vue
    if (existing.kind === "other" && kind !== "other") existing.kind = kind;
    if (AREA_RANK[link.area] < AREA_RANK[existing.area]) existing.area = link.area;
  }
  return [...byKey.values()];
}

/**
 * Ordre de lecture des candidates, les plus utiles d'abord. Les pages
 * « autres » ne sont retenues que si elles viennent du menu ou du corps de
 * la page d'accueil (un lien de pied de page ou de plan de site sans nature
 * reconnue est rarement une page de présentation).
 */
export function planPages(candidates: readonly PageCandidate[]): PageCandidate[] {
  const perKind = new Map<ExternalPageKind, PageCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.kind === "other" && (candidate.area === "footer" || candidate.area === "sitemap")) continue;
    const list = perKind.get(candidate.kind) ?? [];
    list.push(candidate);
    perKind.set(candidate.kind, list);
  }
  const scored: { candidate: PageCandidate; score: number }[] = [];
  for (const [kind, list] of perKind) {
    const rule = KIND_SCORE[kind];
    if (!rule) continue;
    list
      .sort((a, b) => AREA_RANK[a.area] - AREA_RANK[b.area] || a.order - b.order)
      .slice(0, rule.max)
      .forEach((candidate, index) => scored.push({ candidate, score: rule.first - index * rule.step }));
  }
  return scored.sort((a, b) => b.score - a.score || a.candidate.order - b.candidate.order).map((entry) => entry.candidate);
}
