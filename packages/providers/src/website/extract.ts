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

import { load, type CheerioAPI } from "cheerio/slim";
import { EXTERNAL_SITE_LIMITS } from "@theralys/shared";
import { cleanLine, cleanLineMax, joinBlocks } from "./text";

/** Nœud du document analysé (les types de l'analyseur ne sont pas exportés par cheerio : ils sont déduits). */
export type DomNode = ReturnType<ReturnType<CheerioAPI["root"]>["contents"]>[number];
export type DomElement = Extract<DomNode, { attribs: Record<string, string> }>;

export const isElement = (node: DomNode): node is DomElement => "attribs" in node;
const isTextNode = (node: DomNode): node is Extract<DomNode, { data: string }> => (node.type as string) === "text";

/** Analyse le HTML (analyseur tolérant, sans exécution). Le document rendu est modifié par `extractPage` : relever liens et faits avant. */
export function loadDocument(html: string): CheerioAPI {
  return load(html);
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
const DESCRIPTION_MAX = 320;
const HEADING_MAX = 160;
const HEADINGS_MAX = 40;
/** Profondeur d'imbrication parcourue : au-delà, le sous-arbre est ignoré (document pathologique). */
const DEPTH_MAX = 400;

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

/** Texte brut d'un sous-arbre, sur une ligne à nettoyer (titres, cellules de tableau, mesures de longueur). */
function inlineText(node: DomNode, depth = 0): string {
  if (isTextNode(node)) return node.data;
  if (!isElement(node) || depth > DEPTH_MAX) return "";
  if (node.name === "br") return " ";
  let out = "";
  let previousWasElement = false;
  for (const child of node.children) {
    const piece = inlineText(child, depth + 1);
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

function hasBlockChild(node: DomElement, depth = 0): boolean {
  if (depth > 6) return true;
  return node.children.some((child) => isElement(child) && (child.name === "br" || BLOCK_TAGS.has(child.name) || hasBlockChild(child, depth + 1)));
}

/**
 * Parcourt le contenu et le rend en blocs : un bloc par paragraphe, titre,
 * élément de liste (préfixé « - ») ou ligne de tableau (cellules séparées
 * par « | » : les grilles de tarifs restent lisibles).
 */
function collectBlocks(roots: readonly DomNode[]): { blocks: string[]; headings: string[]; hasMainTitle: boolean } {
  const blocks: string[] = [];
  const headings: string[] = [];
  let hasMainTitle = false;
  let buffer = "";
  /** Un élément de liste est ouvert et son premier bloc de texte n'est pas encore sorti */
  let bullet = false;

  const push = (line: string, prefix = ""): void => {
    if (line !== "" && /[\p{L}\p{N}]/u.test(line)) blocks.push(`${prefix}${line}`);
  };
  const flush = (): void => {
    const line = cleanLine(buffer);
    buffer = "";
    if (line === "") return;
    push(line, bullet ? "- " : "");
    bullet = false;
  };

  const walk = (node: DomNode, depth: number): void => {
    if (isTextNode(node)) {
      buffer += node.data;
      return;
    }
    if (!isElement(node) || depth > DEPTH_MAX) return;
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
      const line = cleanLineMax(inlineText(node), HEADING_MAX);
      if (line === "") return;
      push(line);
      if (heading[1] === "1") hasMainTitle = true;
      if (Number(heading[1]) <= 3 && headings.length < HEADINGS_MAX && !headings.includes(line)) headings.push(line);
      return;
    }
    if (tag === "tr") {
      const cells = node.children.filter((child): child is DomElement => isElement(child) && (child.name === "td" || child.name === "th"));
      // Ligne de données : une ligne de texte. Tableau de mise en page (cellules à paragraphes) : parcours ordinaire.
      if (cells.length > 0 && !cells.some((cell) => hasBlockChild(cell))) {
        flush();
        const row = cells.map((cell) => cleanLine(inlineText(cell))).filter((cell) => cell !== "");
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
        if (previousWasElement && !BLOCK_TAGS.has(child.name) && buffer !== "" && !/\s$/.test(buffer)) buffer += " ";
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
    if ($(element).closest("noscript").length > 0) continue;
    const match = /^\s*(\d{1,3})\s*[;,]\s*(?:url\s*=\s*)?["']?\s*([^"'\s][^"']*?)\s*["']?\s*$/i.exec($(element).attr("content") ?? "");
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
 * Extrait le texte principal de la page. Modifie le document reçu (les
 * éléments écartés en sont retirés).
 */
export function extractPage($: CheerioAPI, pageUrl: string): ExtractedPage {
  const description = cleanLineMax(metaContent($, "description", "og:description"), DESCRIPTION_MAX);
  const language = documentLanguage($);
  // Titre du document : celui d'une image vectorielle (<svg><title>) n'en est pas un
  const documentTitle = cleanLine(
    $("title")
      .filter((_, element) => $(element).closest("svg").length === 0)
      .first()
      .text(),
  );
  const fallbackTitle = metaContent($, "og:title");
  const lengthOf = (node: DomNode): number => cleanLine(inlineText(node)).length;

  // Un nom de classe ne doit pas emporter la page : le corps, le contenu principal et ce qui porte le titre restent
  const isStructural = (element: DomElement): boolean => ["html", "body", "main", "article"].includes(element.name) || $(element).find("main, article, h1").length > 0;

  // 1. Ce qui n'est pas du texte de page, puis ce qu'un visiteur ne voit pas
  $(NOISE).remove();
  $(HIDDEN_ATTRIBUTES).not("html, body").remove();
  $("[style], [class], [id]").each((_, element) => {
    if (element.name === "html" || element.name === "body") return;
    const className = element.attribs.class ?? "";
    if (isHiddenByStyle(element.attribs.style) || className.split(/\s+/).some((name) => HIDDEN_CLASSES.has(name.toLowerCase()))) $(element).remove();
    else if (TESTIMONIAL_NAME.test(`${element.attribs.id ?? ""} ${className}`) && !isStructural(element)) $(element).remove();
  });
  $(KNOWN_COOKIE_BANNERS).not("html, body").remove();
  $(NAMED_COOKIE_BANNERS).each((_, element) => {
    if (!isStructural(element) && lengthOf(element) <= NAMED_BANNER_TEXT_MAX) $(element).remove();
  });

  // 2. En-tête et pied de page du site : retirés, sauf l'en-tête qui porte le titre de la page
  const body = $("body").first();
  // Document sans balise <body> (fragment, HTML minimal) : tout le document tient lieu de corps
  const scopeNodes: DomNode[] = body.length > 0 ? body.toArray() : $.root().contents().toArray();
  const scope = $(scopeNodes);
  scope.find("footer, [role='contentinfo']").remove();
  scope.find("header, [role='banner']").each((_, element) => {
    const inContent = $(element).parents("main, [role='main'], article, section").length > 0;
    if (!inContent && $(element).find("h1").length === 0) $(element).remove();
  });

  // 3. Contenu principal : la balise <main> quand elle porte l'essentiel du texte, sinon tout le corps
  const scopeLength = scopeNodes.reduce((sum, node) => sum + lengthOf(node), 0);
  const main = scope
    .find("main, [role='main']")
    .toArray()
    .map((element) => ({ element, length: lengthOf(element) }))
    .sort((a, b) => b.length - a.length)[0];
  const useMain = main !== undefined && (main.length >= 200 || main.length >= scopeLength * 0.5);
  let roots = scopeNodes;
  if (useMain) {
    // Un en-tête gardé hors de <main> porte le titre et l'accroche : il précède le contenu
    const heroes = scope
      .find("header, [role='banner']")
      .toArray()
      .filter((element) => $(element).find("h1").length > 0 && $(element).closest(main.element).length === 0 && $(main.element).closest(element).length === 0);
    roots = [...heroes, main.element];
  }

  const collected = collectBlocks(roots);
  let blocks = collected.blocks;
  const headings = collected.headings;
  if (useMain && !collected.hasMainTitle) {
    // Titre de page placé hors du contenu principal (bandeau de titre de certains thèmes) : repris en tête
    const outside = scope.find("h1").first().get(0);
    const line = outside ? cleanLineMax(inlineText(outside), HEADING_MAX) : "";
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
