/**
 * Garde-fou avant l'analyse d'un document : profondeur d'imbrication de ses
 * balises. Module pur.
 *
 * Pourquoi : l'analyseur HTML (htmlparser2, celui de cheerio) tient la pile
 * des balises ouvertes de telle façon que son temps de calcul croît comme le
 * carré de la profondeur. Un document piégé de 3 Mo — 200 000 `<div>` jamais
 * fermées — l'occupe près d'une minute, pendant laquelle rien d'autre ne
 * tourne dans le processus : ni les délais de la lecture, ni les autres
 * requêtes servies par la même instance. Une vraie page dépasse rarement
 * cent niveaux. On mesure donc la profondeur d'abord, en un seul passage
 * linéaire, et on n'analyse pas ce qui dépasse la limite.
 *
 * La mesure rejoue pas à pas le découpage et les règles de l'analyseur
 * (balises sans contenu, fermetures implicites, balises auto-fermantes des
 * dessins vectoriels, contenu brut des scripts, et jusqu'à ses
 * particularités) : sous-estimer laisserait passer un document piégé,
 * surestimer écarterait de vraies pages. Un test compare la mesure à la
 * profondeur réellement produite par l'analyseur sur des milliers de
 * documents tirés au hasard ; il échouera si l'analyseur change de règles.
 */

/** Profondeur admise : très au-delà des vraies pages, très en deçà de ce qui ralentit l'analyseur. */
export const MAX_NESTING_DEPTH = 400;

/** Document trop imbriqué pour être analysé sans risque. */
export class DocumentTooDeepError extends Error {
  constructor() {
    super("document trop imbriqué");
    this.name = "DocumentTooDeepError";
  }
}

// Tables de l'analyseur (htmlparser2 10) : elles doivent rester les siennes.
const VOID_ELEMENTS = new Set(["area", "base", "basefont", "br", "col", "command", "embed", "frame", "hr", "img", "input", "isindex", "keygen", "link", "meta", "param", "source", "track", "wbr"]);
const FORM_TAGS = new Set(["input", "option", "optgroup", "select", "button", "datalist", "textarea"]);
const P = new Set(["p"]);
const DD_DT = new Set(["dd", "dt"]);
const RT_RP = new Set(["rt", "rp"]);
const TABLE_SECTIONS = new Set(["thead", "tbody"]);
/** Ouvrir la balise (clé) ferme d'abord les balises de l'ensemble (valeur) qui sont au sommet de la pile. */
const OPEN_IMPLIES_CLOSE = new Map<string, ReadonlySet<string>>([
  ["tr", new Set(["tr", "th", "td"])],
  ["th", new Set(["th"])],
  ["td", new Set(["thead", "th", "td"])],
  ["body", new Set(["head", "link", "script"])],
  ["li", new Set(["li"])],
  ...["p", "h1", "h2", "h3", "h4", "h5", "h6", "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "header", "hr", "main", "nav", "ol", "pre", "section", "table", "ul"].map((name): [string, ReadonlySet<string>] => [name, P]),
  ...["select", "input", "output", "button", "datalist", "textarea"].map((name): [string, ReadonlySet<string>] => [name, FORM_TAGS]),
  ["option", new Set(["option"])],
  ["optgroup", new Set(["optgroup", "option"])],
  ["dd", DD_DT],
  ["dt", DD_DT],
  ["rt", RT_RP],
  ["rp", RT_RP],
  ["tbody", TABLE_SECTIONS],
  ["tfoot", TABLE_SECTIONS],
]);
/** Dessins vectoriels et formules : les balises auto-fermantes (`<path/>`) y sont reconnues. */
const FOREIGN_ELEMENTS = new Set(["math", "svg"]);
/** Dans un dessin ou une formule, éléments dont le contenu redevient du HTML. */
const HTML_INTEGRATION_ELEMENTS = new Set(["mi", "mo", "mn", "ms", "mtext", "annotation-xml", "foreignobject", "desc", "title"]);
/** Balises dont le contenu est du texte brut jusqu'à leur fermeture. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "title", "textarea", "xmp"]);

const LT = 0x3c;
const GT = 0x3e;
const SLASH = 0x2f;
const EQUALS = 0x3d;
const DASH = 0x2d;
const isSpace = (code: number): boolean => code === 0x20 || code === 0x0a || code === 0x09 || code === 0x0c || code === 0x0d;
const isAlpha = (code: number): boolean => (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);
const endsTagSection = (code: number): boolean => code === SLASH || code === GT || isSpace(code);

/**
 * Fin d'une balise ouvrante à partir de la fin de son nom : position du `>`
 * qui la ferme (ou la longueur du texte si elle n'est jamais fermée), et si
 * elle est auto-fermante (`/>`, espaces admis entre les deux). Un `>` dans
 * une valeur d'attribut entre guillemets ne ferme pas la balise ; un
 * guillemet dans un nom d'attribut ou une valeur sans guillemets n'ouvre rien.
 */
function scanOpenTag(markup: string, from: number): { end: number; selfClosing: boolean } {
  const length = markup.length;
  let i = from;
  for (;;) {
    while (i < length && isSpace(markup.charCodeAt(i))) i++;
    if (i >= length) return { end: length, selfClosing: false };
    const code = markup.charCodeAt(i);
    if (code === GT) return { end: i, selfClosing: false };
    if (code === SLASH) {
      i++;
      while (i < length && isSpace(markup.charCodeAt(i))) i++;
      if (markup.charCodeAt(i) === GT) return { end: i, selfClosing: true };
      continue;
    }
    // Nom d'attribut — son premier caractère est pris tel quel, fût-il « = » ou un guillemet —, puis sa valeur s'il est suivi de « = »
    i++;
    while (i < length && markup.charCodeAt(i) !== EQUALS && !endsTagSection(markup.charCodeAt(i))) i++;
    while (i < length && isSpace(markup.charCodeAt(i))) i++;
    if (markup.charCodeAt(i) !== EQUALS) continue;
    i++;
    while (i < length && isSpace(markup.charCodeAt(i))) i++;
    const quote = markup.charCodeAt(i);
    if (quote === 0x22 || quote === 0x27) {
      const close = markup.indexOf(quote === 0x22 ? '"' : "'", i + 1);
      if (close === -1) return { end: length, selfClosing: false };
      i = close + 1;
    } else {
      while (i < length && markup.charCodeAt(i) !== GT && !isSpace(markup.charCodeAt(i))) i++;
    }
  }
}

/**
 * Fin du contenu brut d'une balise (`script`, `style`…) : position du
 * caractère qui suit « </nom » — un `>` ou un espace — ou -1 si le contenu
 * court jusqu'à la fin du document. Même automate que l'analyseur, casse et
 * caractères de contrôle compris.
 */
function scanRawText(markup: string, from: number, name: string): number {
  const sequence = `</${name}`;
  const fastForward = name !== "title";
  let matched = 0;
  for (let i = from; i < markup.length; i++) {
    const code = markup.charCodeAt(i);
    if (matched === sequence.length) {
      if (code === GT || isSpace(code)) return i;
      matched = 0;
    }
    if ((code | 0x20) === sequence.charCodeAt(matched)) matched++;
    else if (matched === 0) {
      if (fastForward) {
        const next = markup.indexOf("<", i + 1);
        if (next === -1) return -1;
        i = next;
        matched = 1;
      }
    } else matched = Number(code === LT);
  }
  return -1;
}

/** Position qui suit le `>` cherché à partir de `from`, ou la fin du document. */
function afterNext(markup: string, pattern: string, from: number): number {
  const at = markup.indexOf(pattern, from);
  return at === -1 ? markup.length : at + pattern.length;
}

/**
 * Plus grande profondeur d'imbrication qu'atteindra l'analyseur sur ce
 * document (éléments du document produit), ou `limit + 1` dès qu'elle
 * dépasse `limit` — le passage s'arrête alors. `xml` : règles XML (plan de
 * site) — ni balise sans contenu, ni fermeture implicite, noms sensibles à
 * la casse, balises auto-fermantes partout.
 */
export function nestingDepth(markup: string, opts: { xml?: boolean; limit?: number } = {}): number {
  const xml = opts.xml === true;
  const limit = opts.limit ?? MAX_NESTING_DEPTH;
  const length = markup.length;
  const isTagStart = (code: number): boolean => (xml ? !endsTagSection(code) : isAlpha(code));
  const stack: string[] = [];
  /** Contexte « dessin ou formule » : son sommet dit si les balises auto-fermantes sont reconnues */
  const foreign: boolean[] = [xml];
  let max = 0;
  const reach = (depth: number): void => {
    if (depth > max) max = depth;
  };

  const closeTag = (name: string): void => {
    if (!xml && (FOREIGN_ELEMENTS.has(name) || HTML_INTEGRATION_ELEMENTS.has(name))) foreign.pop();
    if (!xml && VOID_ELEMENTS.has(name)) {
      // « </br> » produit un saut de ligne, sous la balise ouverte
      if (name === "br") reach(stack.length + 1);
      return;
    }
    // Ferme la balise de ce nom la plus récente, et tout ce qui a été ouvert depuis
    const position = stack.lastIndexOf(name);
    if (position !== -1) stack.length = position;
    // « </p> » sans paragraphe ouvert produit un paragraphe vide
    else if (!xml && name === "p") reach(stack.length + 1);
  };

  let i = 0;
  while (i < length && max <= limit) {
    const open = markup.indexOf("<", i);
    if (open === -1 || open + 1 >= length) break;
    const next = markup.charCodeAt(open + 1);

    if (next === 0x21) {
      // Déclaration, commentaire ou section CDATA. Le caractère qui suit « <! » (ou « <!- ») est avalé sans être examiné.
      const after = markup.charCodeAt(open + 2);
      if (after === 0x5b) i = markup.startsWith("CDATA[", open + 3) ? afterNext(markup, "]]>", open + 9) : afterNext(markup, ">", open + 3);
      else if (after === DASH) i = markup.charCodeAt(open + 3) === DASH ? afterNext(markup, "-->", open + 2) : afterNext(markup, ">", open + 4);
      else i = afterNext(markup, ">", open + 3);
      continue;
    }
    if (next === 0x3f) {
      i = afterNext(markup, ">", open + 2);
      continue;
    }

    if (isTagStart(next)) {
      // Balise ouvrante : son nom court jusqu'à un espace, « / » ou « > »
      let nameEnd = open + 1;
      while (nameEnd < length && !endsTagSection(markup.charCodeAt(nameEnd))) nameEnd++;
      if (nameEnd >= length) break;
      const name = xml ? markup.slice(open + 1, nameEnd) : markup.slice(open + 1, nameEnd).toLowerCase();
      const tag = scanOpenTag(markup, nameEnd);
      // Balise jamais refermée par « > » : l'analyseur l'ignore
      if (tag.end >= length) break;
      i = tag.end + 1;

      if (!xml) {
        const closes = OPEN_IMPLIES_CLOSE.get(name);
        if (closes) while (stack.length > 0 && closes.has(stack[stack.length - 1]!)) stack.pop();
      }
      if (!xml && VOID_ELEMENTS.has(name)) {
        reach(stack.length + 1);
        continue;
      }
      stack.push(name);
      reach(stack.length);
      if (!xml) {
        if (FOREIGN_ELEMENTS.has(name)) foreign.push(true);
        else if (HTML_INTEGRATION_ELEMENTS.has(name)) foreign.push(false);
      }
      if (tag.selfClosing) {
        // Reconnue dans un dessin, une formule ou en XML : refermée aussitôt. Ailleurs, c'est une balise ouvrante ordinaire.
        if (foreign[foreign.length - 1] === true) stack.pop();
        continue;
      }
      if (!xml && RAW_TEXT_ELEMENTS.has(name)) {
        const end = scanRawText(markup, i, name);
        if (end === -1) break;
        closeTag(name);
        i = afterNext(markup, ">", end);
      }
      continue;
    }

    if (next === SLASH) {
      // Balise fermante : espaces admis après « </ », nom jusqu'à un espace ou « > »
      let start = open + 2;
      while (start < length && isSpace(markup.charCodeAt(start))) start++;
      if (start >= length) break;
      const first = markup.charCodeAt(start);
      if (first === GT) {
        i = start + 1;
        continue;
      }
      if (!isTagStart(first)) {
        i = afterNext(markup, ">", start + 1);
        continue;
      }
      let nameEnd = start;
      while (nameEnd < length && markup.charCodeAt(nameEnd) !== GT && !isSpace(markup.charCodeAt(nameEnd))) nameEnd++;
      if (nameEnd >= length) break;
      closeTag(xml ? markup.slice(start, nameEnd) : markup.slice(start, nameEnd).toLowerCase());
      i = afterNext(markup, ">", nameEnd);
      continue;
    }

    // Un « < » qui n'ouvre rien : du texte
    i = open + 1;
  }
  return max > limit ? limit + 1 : max;
}

/** Lève `DocumentTooDeepError` si le document est trop imbriqué pour être analysé. */
export function assertParsable(markup: string, opts: { xml?: boolean } = {}): void {
  if (nestingDepth(markup, { ...opts, limit: MAX_NESTING_DEPTH }) > MAX_NESTING_DEPTH) throw new DocumentTooDeepError();
}
