/**
 * Du texte d'un document (HTML d'une page, XML d'un plan de site) à un arbre
 * interrogeable — sans risque pour le processus. Un document venu d'un site
 * tiers peut être fabriqué pour épuiser l'analyseur ou les parcours ; il
 * passe donc par quatre étapes :
 * 1. le garde-fou (markup-guard) mesure le document et refuse ce qui est trop
 *    imbriqué ou trop touffu, avant toute analyse ;
 * 2. l'analyse (cheerio, htmlparser2) se fait sans décodage des entités :
 *    c'est à cette condition que l'analyseur découpe le document exactement
 *    comme le garde-fou l'a mesuré (voir entities.ts) ;
 * 3. un parcours de l'arbre décode les entités des textes et des attributs,
 *    et revérifie les bornes (second filet, si l'analyseur venait à changer) ;
 * 4. un document fait de milliers d'éléments à la racine (page sans balise
 *    `<html>`) reçoit un élément racine unique : chercher dans un document
 *    coûte, chez cheerio, le carré du nombre d'éléments à la racine.
 *
 * Pour la même raison, ce module fournit les parcours dont les autres ont
 * besoin (ancêtres, descendants, texte borné) : `find`, `closest` et
 * `parents` de cheerio coûtent trop cher sur un document piégé. Les
 * recherches par sélecteur depuis la racine (`$("a[href]")`) restent
 * linéaires et sont les seules utilisées.
 *
 * Aucun script n'est exécuté, aucune ressource n'est chargée.
 */

import { load, type CheerioAPI } from "cheerio/slim";
import { decodeEntities } from "./entities";
import { assertParsable, MARKUP_LIMITS, MarkupTooComplexError } from "./markup-guard";

/** Nœud du document analysé (les types de l'analyseur ne sont pas exportés par cheerio : ils sont déduits). */
export type DomNode = ReturnType<ReturnType<CheerioAPI["root"]>["contents"]>[number];
/** Élément (balise), avec ses attributs et ses enfants. */
export type DomElement = Extract<DomNode, { attribs: Record<string, string> }>;
/** Texte, commentaire ou déclaration : tout nœud qui porte une donnée ; `isTextNode` distingue le texte. */
export type DomText = Extract<DomNode, { data: string }>;

/** Le nœud est-il un élément ? (seuls les éléments ont des attributs) */
export const isElement = (node: DomNode): node is DomElement => "attribs" in node;
/** Le nœud est-il du texte de la page ? (ni commentaire, ni déclaration) */
export const isTextNode = (node: DomNode): node is DomText => (node.type as string) === "text";

/** Éléments dont le contenu est du texte brut : l'analyseur n'y décode pas les entités. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "xmp"]);
/** Éléments à la racine au-delà desquels le document reçoit un élément racine unique. */
const ROOT_ELEMENTS_MAX = 8;
/** Nom de l'élément racine ajouté : celui d'aucune balise HTML, pour ne répondre à aucun sélecteur. */
export const ROOT_WRAPPER = "x-document";

/**
 * Analyse un document et rend l'arbre interrogeable. Lève
 * `MarkupTooComplexError` si le document dépasse les bornes de ce qu'on
 * accepte d'analyser. `xml` : règles XML (plan de site).
 */
export function loadMarkup(markup: string, opts: { xml?: boolean } = {}): CheerioAPI {
  const xml = opts.xml === true;
  assertParsable(markup, { xml });
  const $ = load(markup, { xml: { xmlMode: xml, decodeEntities: false } });

  // Décodage des entités et second filet, en un parcours sans récursion
  const nodes: DomNode[] = $.root().contents().toArray();
  const depths: number[] = nodes.map(() => 1);
  let count = 0;
  for (let node = nodes.pop(); node !== undefined; node = nodes.pop()) {
    const depth = depths.pop() ?? 1;
    if (isTextNode(node)) {
      if (node.data.includes("&")) node.data = decodeEntities(node.data, xml ? "xml" : "text");
      continue;
    }
    // Commentaires, déclarations, sections CDATA : leur contenu est littéral
    if (!isElement(node)) continue;
    if (depth > MARKUP_LIMITS.depth) throw new MarkupTooComplexError("depth");
    if (++count > MARKUP_LIMITS.nodes) throw new MarkupTooComplexError("nodes");
    for (const name of Object.keys(node.attribs)) {
      const value = node.attribs[name];
      if (typeof value === "string" && value.includes("&")) node.attribs[name] = decodeEntities(value, xml ? "xml" : "attribute");
    }
    if (!xml && RAW_TEXT_ELEMENTS.has(node.name)) continue;
    for (const child of node.children) {
      nodes.push(child);
      depths.push(depth + 1);
    }
  }

  // Élément racine unique pour les documents qui n'en ont pas
  const root = $.root().get(0);
  if (root && root.children.filter(isElement).length > ROOT_ELEMENTS_MAX) {
    const wrapper = load(`<${ROOT_WRAPPER}></${ROOT_WRAPPER}>`).root().contents().get(0);
    if (wrapper && isElement(wrapper)) {
      wrapper.children = root.children;
      for (const child of wrapper.children) child.parent = wrapper;
      wrapper.parent = root;
      wrapper.prev = null;
      wrapper.next = null;
      root.children = [wrapper];
    }
  }
  return $;
}

/**
 * Parcourt un sous-arbre dans l'ordre du document. `visit` rend `"skip"`
 * pour ne pas descendre sous le nœud, `"stop"` pour arrêter là. Le parcours
 * suit les liens de l'arbre (premier enfant, voisin suivant, parent) : ni
 * récursion ni file d'attente, et l'arrêt est immédiat.
 */
export function walkTree(root: DomNode, visit: (node: DomNode) => "skip" | "stop" | void): void {
  let node: DomNode = root;
  for (;;) {
    const step = visit(node);
    if (step === "stop") return;
    if (step !== "skip" && "children" in node && node.children.length > 0) {
      node = node.children[0]!;
      continue;
    }
    while (node !== root && node.next === null && node.parent !== null) node = node.parent;
    if (node === root || node.next === null) return;
    node = node.next;
  }
}

/** Parcourt les textes d'un sous-arbre, jusqu'à ce que `visit` rende `false`. `skip` écarte des sous-arbres entiers. */
export function eachText(root: DomNode, visit: (text: DomText) => boolean, skip?: (node: DomNode) => boolean): void {
  walkTree(root, (node) => {
    if (skip?.(node)) return "skip";
    if (isTextNode(node) && !visit(node)) return "stop";
    return undefined;
  });
}

/**
 * Texte d'un sous-arbre, arrêté dès que `max` caractères sont réunis : lire
 * le texte d'un lien ou d'un titre ne doit pas coûter la taille de la page
 * (éléments imbriqués d'un document piégé).
 */
export function textOf(root: DomNode, max: number, skip?: (node: DomNode) => boolean): string {
  let out = "";
  eachText(
    root,
    (text) => {
      out += text.data.length > max ? text.data.slice(0, max) : text.data;
      return out.length < max;
    },
    skip,
  );
  return out.length > max ? out.slice(0, max) : out;
}

/** Plus proche ancêtre — ou le nœud lui-même — qui satisfait `test`. */
export function closestElement(node: DomNode | null, test: (element: DomElement) => boolean): DomElement | null {
  for (let current = node; current !== null; current = current.parent) if (isElement(current) && test(current)) return current;
  return null;
}

/** `node` est-il `container` ou l'un de ses descendants ? */
export function isWithin(node: DomNode, container: DomNode): boolean {
  for (let current: DomNode | null = node; current !== null; current = current.parent) if (current === container) return true;
  return false;
}

/** Premier descendant, dans l'ordre du document, qui satisfait `test` ; la recherche s'arrête après `maxNodes` nœuds. */
export function firstDescendant(root: DomElement, test: (element: DomElement) => boolean, maxNodes = 500): DomElement | null {
  let found: DomElement | null = null;
  let seen = 0;
  walkTree(root, (node) => {
    if (++seen > maxNodes) return "stop";
    if (node !== root && isElement(node) && test(node)) {
      found = node;
      return "stop";
    }
    return undefined;
  });
  return found;
}

/** L'élément porte-t-il cette classe ? (comparaison exacte, comme un sélecteur CSS) */
export function hasClass(element: DomElement, name: string): boolean {
  const value = element.attribs.class;
  return value !== undefined && value.includes(name) && value.split(/\s+/).includes(name);
}
