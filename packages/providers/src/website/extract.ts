/**
 * D'une page HTML à son texte principal : titre, description, intertitres et
 * blocs de texte propres. Module pur (cheerio, analyse seule) : aucun script
 * de la page n'est exécuté, aucune ressource n'est chargée.
 *
 * Ce texte sert à comprendre l'activité du praticien, puis il est donné à un
 * modèle de langage. Deux exigences en découlent :
 * - ne garder que le contenu propre à la page (menus, pieds de page,
 *   bandeaux de cookies et formulaires se répètent partout et n'apprennent
 *   rien) ;
 * - écarter ce qu'un visiteur ne voit pas (texte masqué par attribut ou par
 *   style en ligne, texte réservé aux lecteurs d'écran, caractères
 *   invisibles) : c'est là qu'on glisserait des consignes destinées au
 *   modèle. Le masquage par feuille de style ne se voit pas sans moteur de
 *   rendu : ce nettoyage réduit le risque, il ne le supprime pas — le texte
 *   reste une donnée non fiable pour la suite.
 */

import type { CheerioAPI } from "cheerio/slim";
import { EXTERNAL_SITE_LIMITS } from "@theralys/shared";
import { type DomElement, type DomNode, closestElement, eachText, isElement, isTextNode, isWithin, loadMarkup, textOf } from "./dom";
import { cleanLine, cleanLineMax, joinBlocks } from "./text";

/**
 * Analyse le HTML d'une page (analyseur tolérant, sans exécution). Lève
 * `MarkupTooComplexError` pour un document trop imbriqué ou trop touffu
 * (voir dom.ts). Le document rendu n'est jamais modifié par la suite.
 */
export function loadDocument(html: string): CheerioAPI {
  return loadMarkup(html);
}

export type ExtractedPage = {
  title: string;
  description?: string;
  /** Titres h1 à h3 du contenu, dans l'ordre */
  headings: string[];
  /** Texte principal, une ligne par bloc, borné à EXTERNAL_SITE_LIMITS.pageChars */
  text: string;
  /** Langue déclarée par la page (`<html lang>`) */
  language?: string;
};

const TITLE_MAX = 200;
/** Texte brut lu dans la balise <title> avant nettoyage (un titre démesuré n'est pas lu en entier). */
const TITLE_RAW_MAX = 2_000;
const DESCRIPTION_MAX = 320;
const HEADING_MAX = 160;
const HEADINGS_MAX = 40;
/** Profondeur d'imbrication parcourue : au-delà, le sous-arbre est ignoré (le garde-fou de dom.ts refuse déjà ces documents). */
const DEPTH_MAX = 400;
const META_REFRESH_MAX = 2_048;
/** Longueur de texte au-delà de laquelle deux contenus principaux se valent : inutile de mesurer plus loin. */
const MAIN_TEXT_CAP = 50_000;

/** Ce qui n'est jamais du texte de la page : en-tête du document, code, médias, formulaires, navigation, encarts, fenêtres modales. */
const NOISE = [
  "head, title, script, style, noscript, template, iframe, frame, object, embed, svg, canvas, math, video, audio, map",
  "form, button, input, select, textarea, datalist, dialog",
  "nav, aside, [role='navigation'], [role='search'], [role='complementary'], [role='dialog'], [role='alertdialog'], [aria-modal='true']",
  // Fil d'Ariane, liens d'évitement, colonnes latérales et commentaires de visiteurs (contenu de tiers)
  ".breadcrumb, .breadcrumbs, [aria-label*='breadcrumb' i], [aria-label*='fil d' i], .skip-link, .skip-to-content",
  "#sidebar, .sidebar, .widget-area, #comments, .comments-area, .comment-list, .comment-respond",
].join(", ");

/** Masqué par attribut. */
const HIDDEN_ATTRIBUTES = "[hidden], [aria-hidden='true']";

/** Classes usuelles du texte réservé aux lecteurs d'écran, et contenu conditionnel masqué de Webflow. */
const HIDDEN_CLASSES = new Set([
  "sr-only",
  "sr-only-focusable",
  "screen-reader-text",
  "screen-reader-only",
  "screen-reader",
  "screen-readers-only",
  "visually-hidden",
  "visually-hidden-focusable",
  "visuallyhidden",
  "show-for-sr",
  "u-sr-only",
  "u-visually-hidden",
  "u-hidden-visually",
  "assistive-text",
  "element-invisible",
  "a11y-hidden",
  "w-condition-invisible",
]);

/**
 * Style en ligne qui masque l'élément : non affiché, invisible, rogné à
 * rien ou renvoyé hors de l'écran. `opacity: 0` n'en fait pas partie : les
 * constructeurs de sites le posent sur le contenu qu'ils font apparaître au
 * défilement.
 */
const HIDDEN_STYLE = /(?:^|;)(?:display:none|visibility:(?:hidden|collapse)|text-indent:-\d{3,}|(?:left|right|top|bottom|margin-left|margin-top):-\d{4,}|clip:rect\((?:[01](?:px)?,?){4}\)|clip-path:inset\((?:50|100)%\))/;

/** L'élément est-il masqué par son style en ligne ? */
export function isHiddenByStyle(style: string | undefined): boolean {
  if (!style) return false;
  return HIDDEN_STYLE.test(style.toLowerCase().replace(/!important/g, "").replace(/\s+/g, ""));
}

/**
 * Blocs de témoignages et d'avis, reconnus à leur identifiant ou à leur
 * classe : ce sont les propos de tiers, souvent sur leur santé. Ils ne
 * servent pas à décrire l'activité et ne sont donc pas lus (collecte minimale).
 */
const TESTIMONIAL_NAME = /testimonial|t[eé]moignage|(?:^|[-_\s])(?:avis|reviews?|livre-?d-?or)(?:[-_\s]|$)/i;

/** Bandeaux de cookies et de consentement des outils connus. */
const KNOWN_COOKIE_BANNERS = [
  "#tarteaucitronRoot, #tarteaucitronAlertBig, #axeptio_overlay, #didomi-host, #onetrust-consent-sdk, #CybotCookiebotDialog, #cookie-law-info-bar, #cookie-notice",
  "#cmplz-cookiebanner-container, .cmplz-cookiebanner, #moove_gdpr_cookie_info_bar, .cc-window, .cky-consent-container, #cookiescript_injected, .sqs-cookie-banner-v2, #BorlabsCookieBox, #usercentrics-root, .iubenda-cs-container",
].join(", ");
/** Bandeaux reconnus à leur nom seulement : retirés s'ils sont courts (un nom de classe trompeur ne doit pas emporter la page). */
const NAMED_COOKIE_BANNERS = "[id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [id*='gdpr' i], [class*='gdpr' i], [id*='rgpd' i], [class*='rgpd' i]";
const NAMED_BANNER_TEXT_MAX = 1_200;

const BLOCK_TAGS = new Set(["address", "article", "blockquote", "body", "caption", "center", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "legend", "li", "main", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
const HEADING_TAG = /^h([1-6])$/;

/**
 * Sous-arbres écartés du texte (bruit, contenu masqué, bandeaux) : leurs
 * racines sont notées ici et les parcours les sautent. Le document n'est pas
 * modifié — retirer un à un cent mille éléments masqués d'un document piégé
 * coûterait le carré de leur nombre.
 */
type Dropped = ReadonlySet<DomNode>;

/** Texte brut d'un sous-arbre, sur une ligne à nettoyer (titres, cellules de tableau). */
function inlineText(node: DomNode, dropped: Dropped, depth = 0): string {
  if (isTextNode(node)) return node.data;
  if (!isElement(node) || depth > DEPTH_MAX || dropped.has(node)) return "";
  if (node.name === "br") return " ";
  let out = "";
  let previousWasElement = false;
  for (const child of node.children) {
    const piece = inlineText(child, dropped, depth + 1);
    if (isElement(child)) {
      // Deux éléments voisins sont séparés à l'affichage (marges, cellules) : sans espace, leurs mots se colleraient
      const separated = BLOCK_TAGS.has(child.name);
      out += separated || previousWasElement ? ` ${piece}` : piece;
      if (separated) out += " ";
      previousWasElement = true;
    } else {
      out += piece;
      if (isTextNode(child) && child.data.trim() !== "") previousWasElement = false;
    }
  }
  return out;
}

function hasBlockChild(node: DomElement, dropped: Dropped, depth = 0): boolean {
  if (depth > 6) return true;
  return node.children.some((child) => isElement(child) && !dropped.has(child) && (child.name === "br" || BLOCK_TAGS.has(child.name) || hasBlockChild(child, dropped, depth + 1)));
}

/**
 * Parcourt le contenu et le rend en blocs : un bloc par paragraphe, titre,
 * élément de liste (préfixé « - ») ou ligne de tableau (cellules séparées
 * par « | » : les grilles de tarifs restent lisibles).
 */
function collectBlocks(roots: readonly DomNode[], dropped: Dropped): { blocks: string[]; headings: string[]; hasMainTitle: boolean } {
  const blocks: string[] = [];
  const headings: string[] = [];
  let hasMainTitle = false;
  let buffer = "";
  /**
   * Le tampon finit-il par une espace ? Tenu à jour à chaque ajout : relire
   * la fin du tampon obligerait le moteur à le recopier à chaque fois, et des
   * milliers d'éléments à la suite coûteraient le carré de leur nombre.
   */
  let endsWithSpace = false;
  /** Un élément de liste est ouvert et son premier bloc de texte n'est pas encore sorti */
  let bullet = false;

  const push = (line: string, prefix = ""): void => {
    if (line !== "" && /[\p{L}\p{N}]/u.test(line)) blocks.push(`${prefix}${line}`);
  };
  const flush = (): void => {
    const line = cleanLine(buffer);
    buffer = "";
    endsWithSpace = false;
    if (line === "") return;
    push(line, bullet ? "- " : "");
    bullet = false;
  };
  const append = (data: string): void => {
    if (data === "") return;
    buffer += data;
    endsWithSpace = /\s/.test(data.charAt(data.length - 1));
  };

  const walk = (node: DomNode, depth: number): void => {
    if (isTextNode(node)) {
      append(node.data);
      return;
    }
    if (!isElement(node) || depth > DEPTH_MAX || dropped.has(node)) return;
    const tag = node.name;
    if (tag === "br" || tag === "hr") {
      flush();
      return;
    }
    const heading = HEADING_TAG.exec(tag);
    if (heading) {
      flush();
      // Un titre dans un élément de liste n'est pas une puce, et le texte qui le suit non plus
      bullet = false;
      const line = cleanLineMax(inlineText(node, dropped), HEADING_MAX);
      if (line === "") return;
      push(line);
      if (heading[1] === "1") hasMainTitle = true;
      if (Number(heading[1]) <= 3 && headings.length < HEADINGS_MAX && !headings.includes(line)) headings.push(line);
      return;
    }
    if (tag === "tr") {
      const cells = node.children.filter((child): child is DomElement => isElement(child) && (child.name === "td" || child.name === "th"));
      // Ligne de données : une ligne de texte. Tableau de mise en page (cellules à paragraphes) : parcours ordinaire.
      if (cells.length > 0 && !cells.some((cell) => hasBlockChild(cell, dropped))) {
        flush();
        const row = cells.map((cell) => cleanLine(inlineText(cell, dropped))).filter((cell) => cell !== "");
        push(row.join(" | "));
        return;
      }
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    if (tag === "li") bullet = true;
    let previousWasElement = false;
    for (const child of node.children) {
      if (isElement(child)) {
        // Deux éléments en ligne accolés (boutons, liens) sont séparés à l'affichage
        if (previousWasElement && !BLOCK_TAGS.has(child.name) && buffer.length > 0 && !endsWithSpace) append(" ");
        previousWasElement = true;
      } else if (isTextNode(child) && child.data.trim() !== "") previousWasElement = false;
      walk(child, depth + 1);
    }
    if (block) flush();
    if (tag === "li") bullet = false;
  };

  for (const root of roots) walk(root, 0);
  flush();
  return { blocks, headings, hasMainTitle };
}

/** Retire les blocs répétés : deux fois de suite, ou repris plus loin à l'identique pour un bloc long (versions bureau et mobile d'une même section, carrousels). */
function dropRepeats(blocks: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    if (out[out.length - 1] === block) continue;
    if (block.length >= 30) {
      if (seen.has(block)) continue;
      seen.add(block);
    }
    out.push(block);
  }
  return out;
}

/** Contenu d'une balise meta par nom ou propriété (première valeur non vide, dans l'ordre des noms donnés). */
export function metaContent($: CheerioAPI, ...names: string[]): string {
  for (const name of names) {
    for (const element of $(`meta[name="${name}" i], meta[property="${name}" i]`).toArray()) {
      const content = cleanLine($(element).attr("content") ?? "");
      if (content !== "") return content;
    }
  }
  return "";
}

/** Langue déclarée par le document, sous forme courte (« fr », « fr-FR ») ; `undefined` si absente ou illisible. */
export function documentLanguage($: CheerioAPI): string | undefined {
  const root = $("html").first();
  const raw = (root.attr("lang") || root.attr("xml:lang") || metaContent($, "og:locale")).trim().replace(/_/g, "-");
  const [primary, ...rest] = raw.split("-");
  if (!primary || !/^[a-z]{2,3}$/i.test(primary)) return undefined;
  const region = rest.find((part) => /^[a-z]{2}$/i.test(part));
  return region ? `${primary.toLowerCase()}-${region.toUpperCase()}` : primary.toLowerCase();
}

/**
 * Redirection par balise meta (`<meta http-equiv="refresh" content="0; url=…">`)
 * vers une autre adresse, quand elle est immédiate (5 secondes au plus) : de
 * vieux sites redirigent ainsi leur page d'accueil. Celle d'un bloc
 * `<noscript>` est ignorée (elle ne vaut que sans JavaScript).
 */
export function metaRefreshTarget($: CheerioAPI, pageUrl: string): string | null {
  for (const element of $("meta[http-equiv='refresh' i]").toArray()) {
    if (!isElement(element) || closestElement(element, (ancestor) => ancestor.name === "noscript") !== null) continue;
    const content = element.attribs.content ?? "";
    // Valeur démesurée : pas une redirection (et l'expression ci-dessous ne doit pas s'y attarder)
    if (content.length > META_REFRESH_MAX) continue;
    const match = /^\s*(\d{1,3})\s*[;,]\s*(?:url\s*=\s*)?["']?\s*([^"'\s][^"']*?)\s*["']?\s*$/i.exec(content);
    if (!match || Number(match[1]) > 5) continue;
    try {
      const target = new URL(match[2]!, pageUrl);
      target.hash = "";
      const current = new URL(pageUrl);
      current.hash = "";
      if (target.href !== current.href) return target.href;
    } catch {
      // Destination illisible : ignorée
    }
  }
  return null;
}

/**
 * Extrait le texte principal de la page. Le document reçu n'est pas
 * modifié : ce qui est écarté est seulement noté, et sauté par les parcours.
 */
export function extractPage($: CheerioAPI, pageUrl: string): ExtractedPage {
  const description = cleanLineMax(metaContent($, "description", "og:description"), DESCRIPTION_MAX);
  const language = documentLanguage($);
  // Titre du document : celui d'une image vectorielle (<svg><title>) n'en est pas un
  const titleElement = $("title")
    .toArray()
    .find((element) => closestElement(element, (ancestor) => ancestor.name === "svg") === null);
  const documentTitle = titleElement ? cleanLine(textOf(titleElement, TITLE_RAW_MAX)) : "";
  const fallbackTitle = metaContent($, "og:title");

  const dropped = new Set<DomNode>();
  /** Écarte des éléments — jamais le document entier, quels que soient ses attributs */
  const drop = (elements: readonly DomNode[]): void => {
    for (const element of elements) if (isElement(element) && element.name !== "html" && element.name !== "body") dropped.add(element);
  };
  const isDropped = (node: DomNode): boolean => {
    for (let current: DomNode | null = node; current !== null; current = current.parent) if (dropped.has(current)) return true;
    return false;
  };
  /** Éléments qui contiennent, hors de ce qui est écarté, l'un des éléments désignés. */
  const ancestorsOf = (selector: string): Set<DomNode> => {
    const marked = new Set<DomNode>();
    for (const element of $(selector).toArray()) {
      if (isDropped(element)) continue;
      for (let current: DomNode | null = element.parent; current !== null && !marked.has(current); current = current.parent) marked.add(current);
    }
    return marked;
  };
  const cleanLengths = new Map<DomNode, number>();
  /**
   * Longueur du texte gardé d'un sous-arbre, comptée jusqu'à `cap` (au-delà,
   * peu importe de combien). Chaque texte n'est nettoyé qu'une fois, même
   * mesuré depuis plusieurs de ses ancêtres.
   */
  const visibleLength = (root: DomNode, cap: number): number => {
    let total = 0;
    eachText(
      root,
      (text) => {
        let length = cleanLengths.get(text);
        if (length === undefined) {
          length = cleanLine(text.data).length;
          cleanLengths.set(text, length);
        }
        if (length > 0) total += length + 1;
        return total <= cap;
      },
      (node) => dropped.has(node),
    );
    // Une espace sépare deux textes : la dernière, comptée en trop, est retirée — sauf si la borne a arrêté le compte
    return total > cap ? total : Math.max(0, total - 1);
  };

  // 1. Ce qui n'est pas du texte de page, puis ce qu'un visiteur ne voit pas
  drop($(NOISE).toArray());
  drop($(HIDDEN_ATTRIBUTES).toArray());
  // Un nom de classe ne doit pas emporter la page : le corps, le contenu principal et ce qui porte le titre restent
  let titled = ancestorsOf("main, article, h1");
  const isStructural = (element: DomElement): boolean => ["html", "body", "main", "article"].includes(element.name) || titled.has(element);
  for (const element of $("[style], [class], [id]").toArray()) {
    const className = element.attribs.class ?? "";
    if (isHiddenByStyle(element.attribs.style) || className.split(/\s+/).some((name) => HIDDEN_CLASSES.has(name.toLowerCase()))) drop([element]);
    else if (TESTIMONIAL_NAME.test(`${element.attribs.id ?? ""} ${className}`) && !isStructural(element)) drop([element]);
  }
  drop($(KNOWN_COOKIE_BANNERS).toArray());
  titled = ancestorsOf("main, article, h1");
  for (const element of $(NAMED_COOKIE_BANNERS).toArray()) {
    if (!isStructural(element) && visibleLength(element, NAMED_BANNER_TEXT_MAX) <= NAMED_BANNER_TEXT_MAX) drop([element]);
  }

  // 2. En-tête et pied de page du site : écartés, sauf l'en-tête qui porte le titre de la page
  const body = $("body").get(0);
  // Document sans balise <body> (fragment, HTML minimal) : tout le document tient lieu de corps
  const scopeNodes: DomNode[] = body ? [body] : $.root().contents().toArray();
  /** Éléments du corps désignés par le sélecteur, dans l'ordre du document. */
  const inBody = (selector: string): DomElement[] =>
    $(selector)
      .toArray()
      .filter((element): element is DomElement => isElement(element) && (body === undefined || (element !== body && isWithin(element, body))));
  drop(inBody("footer, [role='contentinfo']"));
  const withTitle = ancestorsOf("h1");
  const isContentContainer = (element: DomElement): boolean => element.name === "main" || element.name === "article" || element.name === "section" || element.attribs.role === "main";
  for (const element of inBody("header, [role='banner']")) {
    const inContent = closestElement(element.parent, isContentContainer) !== null;
    if (!inContent && !withTitle.has(element)) drop([element]);
  }

  // 3. Contenu principal : la balise <main> quand elle porte l'essentiel du texte, sinon tout le corps
  const main = inBody("main, [role='main']")
    .filter((element) => !isDropped(element))
    .map((element) => ({ element, length: visibleLength(element, MAIN_TEXT_CAP) }))
    .sort((a, b) => b.length - a.length)[0];
  // Un <main> court n'est retenu que s'il porte la moitié du texte de la page : inutile alors de mesurer celle-ci au-delà de 400 caractères
  const useMain = main !== undefined && (main.length >= 200 || main.length * 2 >= scopeNodes.reduce((sum, node) => sum + visibleLength(node, 400), 0));
  let roots = scopeNodes;
  if (useMain) {
    // Un en-tête gardé hors de <main> porte le titre et l'accroche : il précède le contenu
    const heroes = inBody("header, [role='banner']").filter((element) => withTitle.has(element) && !isDropped(element) && !isWithin(element, main.element) && !isWithin(main.element, element));
    roots = [...heroes, main.element];
  }

  const collected = collectBlocks(roots, dropped);
  let blocks = collected.blocks;
  const headings = collected.headings;
  if (useMain && !collected.hasMainTitle) {
    // Titre de page placé hors du contenu principal (bandeau de titre de certains thèmes) : repris en tête
    const outside = inBody("h1").find((element) => !isDropped(element));
    const line = outside ? cleanLineMax(inlineText(outside, dropped), HEADING_MAX) : "";
    if (line !== "") {
      blocks = [line, ...blocks];
      if (!headings.includes(line)) headings.unshift(line);
    }
  }

  const text = joinBlocks(dropRepeats(blocks), EXTERNAL_SITE_LIMITS.pageChars);
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "";
  }
  const title = cleanLineMax(documentTitle || fallbackTitle || headings[0] || host, TITLE_MAX);
  return { title, ...(description !== "" ? { description } : {}), headings: headings.slice(0, HEADINGS_MAX), text, ...(language ? { language } : {}) };
}
