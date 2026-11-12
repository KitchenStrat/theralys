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

/** Ce qui n'est jamais du texte de la page : code, médias, formulaires, navigation, encarts, fenêtres modales. */
const NOISE = [
  "script, style, noscript, template, iframe, frame, object, embed, svg, canvas, math, video, audio, map",
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

/** Style en ligne qui masque l'élément : non affiché, invisible, rogné à rien ou renvoyé hors de l'écran. */
const HIDDEN_STYLE = /(?:^|;)(?:display:none|visibility:(?:hidden|collapse)|text-indent:-\d{3,}|(?:left|right|top|bottom|margin-left|margin-top):-\d{4,}|clip:rect\(0(?:px)?[, ]0(?:px)?[, ]0(?:px)?[, ]0(?:px)?\)|clip-path:inset\((?:50|100)%\))/;

/** L'élément est-il masqué par son style en ligne ? */
export function isHiddenByStyle(style: string | undefined): boolean {
  if (!style) return false;
  return HIDDEN_STYLE.test(style.toLowerCase().replace(/\s+/g, "").replace(/!important/g, ""));
}

/** Bandeaux de cookies et de consentement : outils connus, puis noms d'usage. */
const COOKIE_BANNERS = [
  "#tarteaucitronRoot, #tarteaucitronAlertBig, #axeptio_overlay, #didomi-host, #onetrust-consent-sdk, #CybotCookiebotDialog, #cookie-law-info-bar, #cookie-notice",
  "#cmplz-cookiebanner-container, .cmplz-cookiebanner, #moove_gdpr_cookie_info_bar, .cc-window, .cky-consent-container, #cookiescript_injected, .sqs-cookie-banner-v2, #BorlabsCookieBox, #usercentrics-root, .iubenda-cs-container",
  "[id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [id*='gdpr' i], [class*='gdpr' i], [id*='rgpd' i], [class*='rgpd' i]",
].join(", ");

const BLOCK_TAGS = new Set(["address", "article", "blockquote", "body", "caption", "center", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "legend", "li", "main", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
const HEADING_TAG = /^h([1-6])$/;

/** Texte brut d'un sous-arbre, sur une ligne (titres, cellules de tableau). */
function inlineText(node: DomNode, depth = 0): string {
  if (isTextNode(node)) return node.data;
  if (!isElement(node) || depth > DEPTH_MAX) return "";
  if (node.name === "br") return " ";
  let out = "";
  for (const child of node.children) {
    const piece = inlineText(child, depth + 1);
    // Deux éléments voisins sont séparés à l'affichage (marges, cellules) : sans espace, leurs mots se colleraient
    out += isElement(child) && out !== "" && !/\s$/.test(out) && BLOCK_TAGS.has(child.name) ? ` ${piece}` : piece;
    if (isElement(child) && BLOCK_TAGS.has(child.name)) out += " ";
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
function collectBlocks(roots: readonly DomNode[]): { blocks: string[]; headings: string[] } {
  const blocks: string[] = [];
  const headings: string[] = [];
  let buffer = "";
  /** Un élément de liste est ouvert et son premier bloc de texte n'est pas encore sorti */
  let bullet = false;

  const push = (line: string, opts: { bullet?: boolean } = {}): void => {
    if (line === "" || !/[\p{L}\p{N}]/u.test(line)) return;
    blocks.push(opts.bullet ? `- ${line}` : line);
  };
  const flush = (): void => {
    const line = cleanLine(buffer);
    buffer = "";
    if (line === "") return;
    push(line, { bullet });
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
      const line = cleanLineMax(inlineText(node), HEADING_MAX);
      bullet = false;
      if (line !== "") {
        push(line);
        if (Number(heading[1]) <= 3 && headings.length < HEADINGS_MAX && !headings.includes(line)) headings.push(line);
      }
      return;
    }
    if (tag === "tr") {
      const cells = node.children.filter((child): child is DomElement => isElement(child) && (child.name === "td" || child.name === "th"));
      // Ligne de données : une ligne de texte. Tableau de mise en page (cellules à paragraphes) : parcours ordinaire.
      if (cells.length > 0 && !cells.some((cell) => hasBlockChild(cell))) {
        flush();
        push(
          cells
            .map((cell) => cleanLine(inlineText(cell)))
            .filter((cell) => cell !== "")
            .join(" | "),
        );
        return;
      }
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    if (tag === "li") bullet = true;
    let previousWasElement = false;
    for (const child of node.children) {
      // Deux éléments en ligne accolés (boutons, liens d'un menu) sont séparés à l'affichage
      if (isElement(child) && previousWasElement && !BLOCK_TAGS.has(child.name) && buffer !== "" && !/\s$/.test(buffer)) buffer += " ";
      walk(child, depth + 1);
      if (isElement(child)) previousWasElement = true;
      else if (isTextNode(child) && child.data.trim() !== "") previousWasElement = false;
    }
    if (block) flush();
    if (tag === "li") bullet = false;
  };

  for (const root of roots) walk(root, 0);
  flush();
  return { blocks, headings };
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

/** Contenu d'une balise meta par nom ou propriété (première valeur non vide). */
export function metaContent($: CheerioAPI, ...names: string[]): string {
  for (const name of names) {
    const selector = `meta[name="${name}" i], meta[property="${name}" i]`;
    for (const element of $(selector).toArray()) {
      const content = cleanLine($(element).attr("content") ?? "");
      if (content !== "") return content;
    }
  }
  return "";
}

/** Langue déclarée par le document, sous forme courte (« fr », « fr-FR ») ; `undefined` si absente ou illisible. */
export function documentLanguage($: CheerioAPI): string | undefined {
  const raw = ($("html").first().attr("lang") ?? $("html").first().attr("xml:lang") ?? metaContent($, "og:locale")).trim().replace("_", "-");
  const match = /^([a-z]{2,3})(?:-([a-z]{2}|\d{3}))?$/i.exec(raw);
  if (!match) return undefined;
  return match[2] ? `${match[1]!.toLowerCase()}-${match[2].toUpperCase()}` : match[1]!.toLowerCase();
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

/** L'élément structure-t-il la page (corps, contenu principal, ou porteur du titre) ? Un nom de classe trompeur ne doit pas le faire retirer. */
function isStructural($: CheerioAPI, element: DomElement): boolean {
  return ["html", "body", "main", "article"].includes(element.name) || $(element).find("main, article, h1").length > 0;
}

/**
 * Extrait le texte principal de la page. Modifie le document reçu (les
 * éléments écartés en sont retirés).
 */
export function extractPage($: CheerioAPI, pageUrl: string): ExtractedPage {
  const description = cleanLineMax(metaContent($, "description", "og:description"), DESCRIPTION_MAX);
  const language = documentLanguage($);
  const ogTitle = metaContent($, "og:title");

  // 1. Ce qui n'est pas du texte de page, puis ce qu'un visiteur ne voit pas
  $(NOISE).remove();
  $(HIDDEN_ATTRIBUTES).not("html, body").remove();
  $("[style], [class]").each((_, element) => {
    if (element.name === "html" || element.name === "body") return;
    const classes = (element.attribs.class ?? "").split(/\s+/);
    if (isHiddenByStyle(element.attribs.style) || classes.some((name) => HIDDEN_CLASSES.has(name.toLowerCase()))) $(element).remove();
  });
  $(COOKIE_BANNERS).each((_, element) => {
    if (!isStructural($, element)) $(element).remove();
  });

  // 2. En-tête et pied de page du site : retirés, sauf l'en-tête qui porte le titre de la page
  const body = $("body").first();
  const scope = body.length > 0 ? body : $.root();
  scope.find("footer, [role='contentinfo']").remove();
  scope.find("header, [role='banner']").each((_, element) => {
    const inContent = $(element).parents("main, [role='main'], article, section").length > 0;
    if (!inContent && $(element).find("h1").length === 0) $(element).remove();
  });

  // 3. Contenu principal : la balise <main> quand elle porte l'essentiel du texte, sinon tout le corps
  const lengthOf = (node: DomNode): number => cleanLine(inlineText(node)).length;
  const scopeNodes: DomNode[] = scope.toArray();
  const scopeLength = scopeNodes.reduce((sum, node) => sum + lengthOf(node), 0);
  let roots: DomNode[] = scopeNodes;
  const main = scope
    .find("main, [role='main']")
    .toArray()
    .map((element) => ({ element, length: lengthOf(element) }))
    .sort((a, b) => b.length - a.length)[0];
  if (main && (main.length >= 200 || main.length >= scopeLength * 0.5)) {
    // Un en-tête gardé hors de <main> porte le titre et l'accroche : il précède le contenu
    const heroes = scope
      .find("header, [role='banner']")
      .toArray()
      .filter((element) => $(element).closest(main.element).length === 0 && $(main.element).closest(element).length === 0);
    roots = [...heroes, main.element];
  }

  const collected = collectBlocks(roots);
  let blocks = collected.blocks;
  const headings = collected.headings;
  // Titre de page placé hors du contenu principal (bandeau de titre de certains thèmes) : repris en tête
  if (roots !== scopeNodes && $(roots).find("h1").length === 0) {
    const outside = cleanLineMax(inlineText(scope.find("h1").first().get(0) ?? { type: "text", data: "" } as unknown as DomNode), HEADING_MAX);
    if (outside !== "") {
      blocks = [outside, ...blocks];
      if (!headings.includes(outside)) headings.unshift(outside);
    }
  }

  const text = joinBlocks(dropRepeats(blocks), EXTERNAL_SITE_LIMITS.pageChars);
  const documentTitle = cleanLine($("title").first().text());
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "";
  }
  const title = cleanLineMax(documentTitle || ogTitle || headings[0] || host, TITLE_MAX);
  return { title, ...(description !== "" ? { description } : {}), headings: headings.slice(0, HEADINGS_MAX), text, ...(language ? { language } : {}) };
}
