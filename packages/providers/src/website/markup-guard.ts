/**
 * Garde-fou avant l'analyse d'un document venu d'un site tiers : profondeur
 * d'imbrication de ses balises et nombre de nœuds qu'il produira. Module pur.
 *
 * Pourquoi : l'analyseur HTML (htmlparser2, celui de cheerio) tient la pile
 * des balises ouvertes de telle façon que son temps de calcul croît comme le
 * carré de la profondeur. Un document piégé de 3 Mo — 200 000 `<div>` jamais
 * fermées — l'occupe près d'une minute, pendant laquelle rien d'autre ne
 * tourne dans le processus : ni les délais de la lecture, ni les autres
 * requêtes servies par la même instance. De même, 5 Mo de `<p>` à la suite
 * produisent 1,7 million de nœuds et plusieurs centaines de Mo de mémoire.
 * Une vraie page dépasse rarement cent niveaux et quelques milliers de
 * balises. On mesure donc d'abord, en un seul passage linéaire, et on
 * n'analyse pas ce qui dépasse les bornes.
 *
 * La mesure est une transcription, état par état, de l'automate de découpage
 * de l'analyseur (`Tokenizer`) et de sa gestion de la pile (`Parser`),
 * particularités comprises : une réécriture « dans l'esprit » sous-estimerait
 * certains documents et laisserait passer un piège (ainsi `<tmp>`, que
 * l'analyseur traite comme une balise à contenu brut). Les entités (`&amp;`)
 * sont ignorées : elles ne consomment jamais de caractère de structure. Un
 * test compare la mesure à ce que produit réellement l'analyseur sur des
 * milliers de documents tirés au hasard ; il échouera si l'analyseur change
 * de règles, et il faudra alors reporter le changement ici.
 */

/** Bornes d'un document analysable : très au-delà des vraies pages, très en deçà de ce qui met l'analyseur à genoux. */
export const MARKUP_LIMITS = {
  /** Niveaux d'imbrication des balises */
  depth: 400,
  /** Nœuds hors texte : balises, commentaires, déclarations */
  nodes: 200_000,
} as const;

/** Ce que l'analyseur produira pour un document. */
export type MarkupMeasure = {
  /** Plus grande profondeur d'un élément (1 : enfant direct du document) */
  depth: number;
  /** Nœuds hors texte : éléments, commentaires, déclarations, sections CDATA */
  nodes: number;
};

/** Document trop imbriqué ou trop touffu pour être analysé sans risque. */
export class MarkupTooComplexError extends Error {
  readonly reason: "depth" | "nodes";
  constructor(reason: "depth" | "nodes") {
    super(reason === "depth" ? "document trop imbriqué" : "document trop touffu");
    this.name = "MarkupTooComplexError";
    this.reason = reason;
  }
}

// --- Tables de l'analyseur (htmlparser2 10, Parser) : elles doivent rester les siennes ---

const VOID_ELEMENTS = new Set(["area", "base", "basefont", "br", "col", "command", "embed", "frame", "hr", "img", "input", "isindex", "keygen", "link", "meta", "param", "source", "track", "wbr"]);
const FORM_TAGS = new Set(["input", "option", "optgroup", "select", "button", "datalist", "textarea"]);
const P_TAG = new Set(["p"]);
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
  ...["p", "h1", "h2", "h3", "h4", "h5", "h6", "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "header", "hr", "main", "nav", "ol", "pre", "section", "table", "ul"].map((name): [string, ReadonlySet<string>] => [name, P_TAG]),
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

// --- Séquences et états de l'automate (htmlparser2 10, Tokenizer) ---

const codes = (text: string): readonly number[] => Array.from(text, (char) => char.charCodeAt(0));
const CDATA_START = codes("CDATA[");
const CDATA_END = codes("]]>");
const COMMENT_END = codes("-->");
const SCRIPT_END = codes("</script");
const STYLE_END = codes("</style");
const TITLE_END = codes("</title");
const TEXTAREA_END = codes("</textarea");
const XMP_END = codes("</xmp");

const TEXT = 1;
const BEFORE_TAG_NAME = 2;
const IN_TAG_NAME = 3;
const IN_SELF_CLOSING_TAG = 4;
const BEFORE_CLOSING_TAG_NAME = 5;
const IN_CLOSING_TAG_NAME = 6;
/** Aussi : déclaration, instruction de traitement, commentaire « spécial » — tout ce qui court jusqu'au prochain « > » */
const UNTIL_GT = 7;
const BEFORE_ATTRIBUTE_NAME = 8;
const IN_ATTRIBUTE_NAME = 9;
const AFTER_ATTRIBUTE_NAME = 10;
const BEFORE_ATTRIBUTE_VALUE = 11;
const IN_ATTRIBUTE_VALUE_DQ = 12;
const IN_ATTRIBUTE_VALUE_SQ = 13;
const IN_ATTRIBUTE_VALUE_NQ = 14;
const BEFORE_DECLARATION = 15;
const BEFORE_COMMENT = 18;
const CDATA_SEQUENCE = 19;
const IN_COMMENT_LIKE = 21;
const BEFORE_SPECIAL_S = 22;
const BEFORE_SPECIAL_T = 23;
const SPECIAL_START_SEQUENCE = 24;
const IN_SPECIAL_TAG = 25;

const LT = 0x3c;
const GT = 0x3e;
const SLASH = 0x2f;
const EQUALS = 0x3d;
const DASH = 0x2d;
const isSpace = (code: number): boolean => code === 0x20 || code === 0x0a || code === 0x09 || code === 0x0c || code === 0x0d;
const isAlpha = (code: number): boolean => (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);
const endsTagSection = (code: number): boolean => code === SLASH || code === GT || isSpace(code);

/**
 * Pile des balises ouvertes, tenue comme le fait l'analyseur (`Parser`) :
 * fermetures implicites, balises sans contenu, balises auto-fermantes des
 * dessins et formules, paragraphe et saut de ligne nés d'une balise fermante.
 */
class OpenTags {
  /** Plus grande profondeur d'un élément créé */
  depth = 0;
  /** Nœuds hors texte créés */
  nodes = 0;
  private readonly stack: string[] = [];
  /** Balises ouvertes par nom : évite de parcourir la pile pour une balise fermante sans balise ouvrante */
  private readonly opened = new Map<string, number>();
  /** Contexte « dessin ou formule » : son sommet dit si les balises auto-fermantes sont reconnues */
  private readonly foreign: boolean[];
  /** Balise ouvrante en cours (son élément n'existe qu'une fois refermée par « > ») */
  private tagName = "";

  constructor(private readonly xml: boolean) {
    this.foreign = [xml];
  }

  private isVoid(name: string): boolean {
    return !this.xml && VOID_ELEMENTS.has(name);
  }

  private pop(): void {
    const name = this.stack.pop();
    if (name === undefined) return;
    const count = this.opened.get(name) ?? 1;
    if (count > 1) this.opened.set(name, count - 1);
    else this.opened.delete(name);
  }

  /** Nom d'une balise ouvrante lu (tel qu'écrit dans le document). */
  open(raw: string): void {
    const name = this.xml ? raw : raw.toLowerCase();
    this.tagName = name;
    const closes = this.xml ? undefined : OPEN_IMPLIES_CLOSE.get(name);
    if (closes) while (this.stack.length > 0 && closes.has(this.stack[this.stack.length - 1]!)) this.pop();
    if (this.isVoid(name)) return;
    this.stack.push(name);
    this.opened.set(name, (this.opened.get(name) ?? 0) + 1);
    if (this.xml) return;
    if (FOREIGN_ELEMENTS.has(name)) this.foreign.push(true);
    else if (HTML_INTEGRATION_ELEMENTS.has(name)) this.foreign.push(false);
  }

  /** « > » de la balise ouvrante : son élément est créé, sous la pile s'il est sans contenu, en son sommet sinon. */
  endOpen(): void {
    this.nodes++;
    const at = this.isVoid(this.tagName) ? this.stack.length + 1 : this.stack.length;
    if (at > this.depth) this.depth = at;
    this.tagName = "";
  }

  private closeCurrent(): void {
    const name = this.tagName;
    this.endOpen();
    if (this.stack[this.stack.length - 1] === name) this.pop();
  }

  /** « /> » : reconnu en XML, dans un dessin ou une formule (balise refermée aussitôt) ; ailleurs, c'est une balise ouvrante ordinaire. */
  selfClose(): void {
    if (this.xml || this.foreign[this.foreign.length - 1] === true) this.closeCurrent();
    else this.endOpen();
  }

  /** Nom d'une balise fermante lu. */
  close(raw: string): void {
    const name = this.xml ? raw : raw.toLowerCase();
    if (!this.xml && (FOREIGN_ELEMENTS.has(name) || HTML_INTEGRATION_ELEMENTS.has(name))) this.foreign.pop();
    if (this.isVoid(name)) {
      // « </br> » produit un saut de ligne, sous la balise ouverte
      if (name === "br") this.node(this.stack.length + 1);
      return;
    }
    if ((this.opened.get(name) ?? 0) > 0) {
      // Ferme la balise de ce nom la plus récente, et tout ce qui a été ouvert depuis
      const position = this.stack.lastIndexOf(name);
      while (this.stack.length > position) this.pop();
    } else if (!this.xml && name === "p") {
      // « </p> » sans paragraphe ouvert produit un paragraphe vide
      this.open("p");
      this.closeCurrent();
    }
  }

  /** Un nœud de plus (commentaire, déclaration), ou un élément créé à la profondeur donnée. */
  node(at = 0): void {
    this.nodes++;
    if (at > this.depth) this.depth = at;
  }
}

/**
 * Mesure ce que l'analyseur produira pour ce document, sans l'analyser :
 * profondeur maximale des éléments et nombre de nœuds hors texte. Le passage
 * s'arrête dès qu'une borne est dépassée (la mesure rendue la dépasse alors).
 * `xml` : règles XML (plan de site) — ni balise sans contenu, ni fermeture
 * implicite, noms sensibles à la casse, balises auto-fermantes partout.
 */
export function measureMarkup(markup: string, opts: { xml?: boolean; maxDepth?: number; maxNodes?: number } = {}): MarkupMeasure {
  const xml = opts.xml === true;
  const maxDepth = opts.maxDepth ?? MARKUP_LIMITS.depth;
  const maxNodes = opts.maxNodes ?? MARKUP_LIMITS.nodes;
  const length = markup.length;
  const tags = new OpenTags(xml);

  // Automate de découpage (`Tokenizer`). Son état tient dans des variables locales, qu'aucune fonction ne capture : la boucle reste rapide.
  let state = TEXT;
  let index = 0;
  let sectionStart = 0;
  /** Balise à contenu brut (`script`, `style`, `title`, `textarea`, `xmp`) en cours de reconnaissance ou ouverte */
  let special = false;
  let sequence: readonly number[] = COMMENT_END;
  let sequenceIndex = 0;
  /** Ce qui court jusqu'au prochain « > » produit-il un nœud (déclaration, commentaire spécial) ? Rien pour la fin d'une balise fermante. */
  let untilGtMakesNode = false;

  // Un `continue` rend le même caractère à l'état suivant ; un `break` passe au caractère suivant.
  // Chercher plus loin un caractère absent épuise le document : `index` vaut alors -1 et la boucle s'arrête.
  while (index >= 0 && index < length && tags.depth <= maxDepth && tags.nodes <= maxNodes) {
    const c = markup.charCodeAt(index);
    switch (state) {
      case TEXT: {
        if (c !== LT) {
          index = markup.indexOf("<", index + 1);
          if (index === -1) continue;
        }
        state = BEFORE_TAG_NAME;
        sectionStart = index;
        break;
      }
      case BEFORE_TAG_NAME: {
        if (c === 0x21) state = BEFORE_DECLARATION;
        else if (c === 0x3f) {
          state = UNTIL_GT;
          untilGtMakesNode = true;
        } else if (xml ? !endsTagSection(c) : isAlpha(c)) {
          const lower = c | 0x20;
          sectionStart = index;
          if (xml) state = IN_TAG_NAME;
          else if (lower === 0x73) state = BEFORE_SPECIAL_S;
          else if (lower === 0x74 || lower === 0x78) state = BEFORE_SPECIAL_T;
          else state = IN_TAG_NAME;
        } else if (c === SLASH) state = BEFORE_CLOSING_TAG_NAME;
        else {
          state = TEXT;
          continue;
        }
        break;
      }
      case IN_TAG_NAME: {
        if (!endsTagSection(c)) break;
        tags.open(markup.slice(sectionStart, index));
        state = BEFORE_ATTRIBUTE_NAME;
        continue;
      }
      case BEFORE_SPECIAL_S: {
        const lower = c | 0x20;
        if (lower === 0x63 || lower === 0x74) {
          special = true;
          sequence = lower === 0x63 ? SCRIPT_END : STYLE_END;
          sequenceIndex = 4;
          state = SPECIAL_START_SEQUENCE;
          break;
        }
        state = IN_TAG_NAME;
        continue;
      }
      case BEFORE_SPECIAL_T: {
        // « t » ou « x » suivi de « i », « e » ou « m » : `<tmp>` ou `<xitle>` passent aussi pour des balises à contenu brut
        const lower = c | 0x20;
        if (lower === 0x69 || lower === 0x65 || lower === 0x6d) {
          special = true;
          sequence = lower === 0x69 ? TITLE_END : lower === 0x65 ? TEXTAREA_END : XMP_END;
          sequenceIndex = 4;
          state = SPECIAL_START_SEQUENCE;
          break;
        }
        state = IN_TAG_NAME;
        continue;
      }
      case SPECIAL_START_SEQUENCE: {
        const isEnd = sequenceIndex === sequence.length;
        const isMatch = isEnd ? endsTagSection(c) : (c | 0x20) === sequence[sequenceIndex];
        if (!isMatch) special = false;
        else if (!isEnd) {
          sequenceIndex++;
          break;
        }
        sequenceIndex = 0;
        state = IN_TAG_NAME;
        continue;
      }
      case BEFORE_ATTRIBUTE_NAME: {
        if (c === GT) {
          tags.endOpen();
          if (special) {
            state = IN_SPECIAL_TAG;
            sequenceIndex = 0;
          } else state = TEXT;
        } else if (c === SLASH) state = IN_SELF_CLOSING_TAG;
        else if (!isSpace(c)) state = IN_ATTRIBUTE_NAME;
        break;
      }
      case IN_SELF_CLOSING_TAG: {
        if (c === GT) {
          tags.selfClose();
          state = TEXT;
          special = false;
        } else if (!isSpace(c)) {
          state = BEFORE_ATTRIBUTE_NAME;
          continue;
        }
        break;
      }
      case IN_ATTRIBUTE_NAME: {
        if (c === EQUALS || endsTagSection(c)) {
          state = AFTER_ATTRIBUTE_NAME;
          continue;
        }
        break;
      }
      case AFTER_ATTRIBUTE_NAME: {
        if (c === EQUALS) state = BEFORE_ATTRIBUTE_VALUE;
        else if (c === SLASH || c === GT) {
          state = BEFORE_ATTRIBUTE_NAME;
          continue;
        } else if (!isSpace(c)) state = IN_ATTRIBUTE_NAME;
        break;
      }
      case BEFORE_ATTRIBUTE_VALUE: {
        if (c === 0x22) state = IN_ATTRIBUTE_VALUE_DQ;
        else if (c === 0x27) state = IN_ATTRIBUTE_VALUE_SQ;
        else if (!isSpace(c)) {
          state = IN_ATTRIBUTE_VALUE_NQ;
          continue;
        }
        break;
      }
      case IN_ATTRIBUTE_VALUE_DQ: {
        if (c !== 0x22) {
          index = markup.indexOf('"', index + 1);
          if (index === -1) continue;
        }
        state = BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case IN_ATTRIBUTE_VALUE_SQ: {
        if (c !== 0x27) {
          index = markup.indexOf("'", index + 1);
          if (index === -1) continue;
        }
        state = BEFORE_ATTRIBUTE_NAME;
        break;
      }
      case IN_ATTRIBUTE_VALUE_NQ: {
        if (isSpace(c) || c === GT) {
          state = BEFORE_ATTRIBUTE_NAME;
          continue;
        }
        break;
      }
      case BEFORE_CLOSING_TAG_NAME: {
        if (isSpace(c)) break;
        if (c === GT) state = TEXT;
        else if (xml ? !endsTagSection(c) : isAlpha(c)) {
          state = IN_CLOSING_TAG_NAME;
          sectionStart = index;
        } else {
          // « </3 … > » : un commentaire
          state = UNTIL_GT;
          untilGtMakesNode = true;
        }
        break;
      }
      case IN_CLOSING_TAG_NAME: {
        if (c !== GT && !isSpace(c)) break;
        tags.close(markup.slice(sectionStart, index));
        state = UNTIL_GT;
        untilGtMakesNode = false;
        continue;
      }
      case UNTIL_GT: {
        if (c !== GT) {
          index = markup.indexOf(">", index + 1);
          if (index === -1) continue;
        }
        if (untilGtMakesNode) tags.node();
        state = TEXT;
        break;
      }
      case BEFORE_DECLARATION: {
        // Le caractère qui suit « <! » est avalé sans être examiné : « <!> » ne ferme rien
        if (c === 0x5b) {
          state = CDATA_SEQUENCE;
          sequenceIndex = 0;
        } else if (c === DASH) state = BEFORE_COMMENT;
        else {
          state = UNTIL_GT;
          untilGtMakesNode = true;
        }
        break;
      }
      case BEFORE_COMMENT: {
        if (c === DASH) {
          state = IN_COMMENT_LIKE;
          sequence = COMMENT_END;
          // Les deux tirets de « <!-- » comptent déjà : « <!--> » est un commentaire entier
          sequenceIndex = 2;
          sectionStart = index + 1;
        } else {
          state = UNTIL_GT;
          untilGtMakesNode = true;
        }
        break;
      }
      case CDATA_SEQUENCE: {
        if (c === CDATA_START[sequenceIndex]) {
          if (++sequenceIndex === CDATA_START.length) {
            state = IN_COMMENT_LIKE;
            sequence = CDATA_END;
            sequenceIndex = 0;
            sectionStart = index + 1;
          }
          break;
        }
        sequenceIndex = 0;
        state = UNTIL_GT;
        untilGtMakesNode = true;
        continue;
      }
      case IN_COMMENT_LIKE: {
        if (c === sequence[sequenceIndex]) {
          if (++sequenceIndex === sequence.length) {
            tags.node();
            sequenceIndex = 0;
            state = TEXT;
          }
        } else if (sequenceIndex === 0) {
          index = markup.indexOf(sequence === CDATA_END ? "]" : "-", index + 1);
          if (index === -1) continue;
          sequenceIndex = 1;
        } else if (c !== sequence[sequenceIndex - 1]) sequenceIndex = 0;
        break;
      }
      case IN_SPECIAL_TAG: {
        if (sequenceIndex === sequence.length) {
          if (c === GT || isSpace(c)) {
            // Fin du contenu brut : « </nom » est lu comme une balise fermante
            special = false;
            sectionStart = index - sequence.length + 2;
            state = IN_CLOSING_TAG_NAME;
            continue;
          }
          sequenceIndex = 0;
        }
        // Comparaison de l'analyseur, telle quelle : insensible à la casse, et donc à quelques caractères de contrôle
        if ((c | 0x20) === sequence[sequenceIndex]) sequenceIndex += 1;
        else if (sequenceIndex !== 0) sequenceIndex = Number(c === LT);
        else if (sequence !== TITLE_END) {
          index = markup.indexOf("<", index + 1);
          if (index === -1) continue;
          sequenceIndex = 1;
        }
        break;
      }
    }
    index++;
  }
  // Document lu jusqu'au bout : un commentaire ou une section CDATA jamais refermés donnent tout de même un nœud ; une balise jamais refermée n'en donne pas
  if ((index < 0 || index >= length) && state === IN_COMMENT_LIKE && sectionStart < length) tags.node();
  return { depth: tags.depth, nodes: tags.nodes };
}

/** Lève `MarkupTooComplexError` si le document dépasse les bornes de ce qu'on accepte d'analyser. */
export function assertParsable(markup: string, opts: { xml?: boolean } = {}): void {
  const measure = measureMarkup(markup, opts);
  if (measure.depth > MARKUP_LIMITS.depth) throw new MarkupTooComplexError("depth");
  if (measure.nodes > MARKUP_LIMITS.nodes) throw new MarkupTooComplexError("nodes");
}
