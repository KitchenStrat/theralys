/**
 * Décodage des entités HTML et XML (`&eacute;`, `&#233;`, `&amp;`) d'un texte
 * ou d'une valeur d'attribut. Module pur.
 *
 * Pourquoi un décodeur à nous, alors que l'analyseur HTML sait décoder : son
 * décodeur (entities 7) peut, sur une suite fabriquée (`&Mu";`), avaler des
 * caractères de structure — un guillemet, un chevron. L'analyseur ne découpe
 * alors plus le document comme le prévoit le garde-fou (markup-guard), qui
 * cesse d'être fiable. Les documents sont donc analysés sans décodage, puis
 * décodés ici, texte par texte : une erreur de décodage ne peut plus changer
 * que les caractères d'un texte, jamais la structure du document.
 *
 * Couverture : entités numériques (avec la table Windows-1252 pour 128 à
 * 159, comme les navigateurs), entités nommées de HTML 4 (Latin-1, grec,
 * ponctuation, symboles) et quelques noms courants de HTML 5. Un nom inconnu
 * est laissé tel quel : le texte reste lisible, rien n'est inventé.
 */

/** Où se trouve le texte à décoder : les règles diffèrent (entités sans point-virgule final, noms reconnus). */
export type EntityContext = "text" | "attribute" | "xml";

/** Latin-1, de 160 (`nbsp`) à 255 (`yuml`), dans l'ordre des codes. */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml".split(
    " ",
  );
/** Grec, majuscules à partir de 913 (« - » : code sans lettre) et minuscules à partir de 945. */
const GREEK_UPPER = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega".split(" ");
const GREEK_LOWER = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega".split(" ");
/** Les autres : « nom:code ». */
const OTHERS = [
  "amp:38 lt:60 gt:62 quot:34 apos:39 AMP:38 LT:60 GT:62 QUOT:34 COPY:169 REG:174",
  "OElig:338 oelig:339 Scaron:352 scaron:353 Yuml:376 fnof:402 circ:710 tilde:732 thetasym:977 upsih:978 piv:982",
  "ensp:8194 emsp:8195 emsp13:8196 emsp14:8197 numsp:8199 puncsp:8200 thinsp:8201 hairsp:8202 ZeroWidthSpace:8203 zwnj:8204 zwj:8205 lrm:8206 rlm:8207 hyphen:8208 dash:8208",
  "ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 rsquor:8217 sbquo:8218 lsquor:8218 ldquo:8220 rdquo:8221 rdquor:8221 bdquo:8222 ldquor:8222 dagger:8224 Dagger:8225 bull:8226 bullet:8226 nldr:8229 hellip:8230 mldr:8230",
  "permil:8240 prime:8242 Prime:8243 lsaquo:8249 rsaquo:8250 oline:8254 frasl:8260 euro:8364 image:8465 weierp:8472 real:8476 trade:8482 TRADE:8482 alefsym:8501",
  "larr:8592 uarr:8593 rarr:8594 darr:8595 harr:8596 crarr:8629 lArr:8656 uArr:8657 rArr:8658 dArr:8659 hArr:8660",
  "forall:8704 part:8706 exist:8707 empty:8709 nabla:8711 isin:8712 notin:8713 ni:8715 prod:8719 sum:8721 minus:8722 lowast:8727 radic:8730 prop:8733 infin:8734 ang:8736 and:8743 or:8744 cap:8745 cup:8746 int:8747",
  "there4:8756 sim:8764 cong:8773 asymp:8776 ne:8800 equiv:8801 le:8804 ge:8805 sub:8834 sup:8835 nsub:8836 sube:8838 supe:8839 oplus:8853 otimes:8855 perp:8869 sdot:8901",
  "lceil:8968 rceil:8969 lfloor:8970 rfloor:8971 lang:10216 rang:10217 loz:9674 phone:9742 star:9734 starf:9733 female:9792 male:9794 spades:9824 clubs:9827 hearts:9829 diams:9830 check:10003 checkmark:10003 cross:10007",
  "Tab:9 NewLine:10 excl:33 num:35 dollar:36 percnt:37 lpar:40 rpar:41 ast:42 plus:43 comma:44 period:46 sol:47 colon:58 semi:59 equals:61 quest:63 commat:64",
  "lsqb:91 lbrack:91 bsol:92 rsqb:93 rbrack:93 Hat:94 lowbar:95 grave:96 lcub:123 lbrace:123 verbar:124 vert:124 rcub:125 rbrace:125 NonBreakingSpace:160 centerdot:183 CenterDot:183",
].join(" ");

const NAMED = new Map<string, number>();
LATIN1.forEach((name, index) => NAMED.set(name, 160 + index));
GREEK_UPPER.forEach((name, index) => {
  if (name !== "-") NAMED.set(name, 913 + index);
});
GREEK_LOWER.forEach((name, index) => NAMED.set(name, 945 + index));
for (const pair of OTHERS.split(" ")) {
  const [name, code] = pair.split(":");
  if (name && code) NAMED.set(name, Number(code));
}
const XML_NAMED = new Map<string, number>([
  ["amp", 38],
  ["lt", 60],
  ["gt", 62],
  ["quot", 34],
  ["apos", 39],
]);
/** Noms que HTML décode aussi sans point-virgule final (`&eacute`, `&amp`) : Latin-1 et quelques autres. */
const LEGACY = new Set<string>([...LATIN1, "amp", "lt", "gt", "quot", "AMP", "LT", "GT", "QUOT", "COPY", "REG"]);
const LEGACY_NAME_MAX = 6;
const NAME_MAX = 32;
/** Codes 128 à 159 : lus comme du Windows-1252 (`&#146;` est une apostrophe sur les vieux sites), comme le font les navigateurs. */
const WINDOWS_1252 = [8364, 129, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 141, 381, 143, 144, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 157, 382, 376];
const REPLACEMENT = String.fromCodePoint(0xfffd);

const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;
const isAlnum = (code: number): boolean => isDigit(code) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);

function charOf(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return REPLACEMENT;
  return String.fromCodePoint(code >= 128 && code <= 159 ? WINDOWS_1252[code - 128]! : code);
}

/**
 * Décode les entités d'un texte. Ce qui n'est pas une entité reconnue est
 * rendu tel quel.
 * - `text` : contenu d'une page HTML ; les entités anciennes se décodent même
 *   sans point-virgule (`caf&eacute` → « café »).
 * - `attribute` : valeur d'attribut HTML ; sans point-virgule, pas de
 *   décodage devant « = » ou une lettre (`?a=1&copy=2` reste une adresse).
 * - `xml` : point-virgule obligatoire, cinq noms seulement.
 */
export function decodeEntities(value: string, context: EntityContext = "text"): string {
  let at = value.indexOf("&");
  if (at === -1) return value;
  const length = value.length;
  let out = "";
  let last = 0;
  while (at !== -1 && at + 1 < length) {
    let decoded: string | undefined;
    let end = at + 1;
    if (value.charCodeAt(end) === 0x23) {
      // Numérique : &#233; ou &#xE9;
      end++;
      const hex = (value.charCodeAt(end) | 0x20) === 0x78;
      if (hex) end++;
      const digitsStart = end;
      let code = 0;
      for (; end < length; end++) {
        const c = value.charCodeAt(end);
        const lower = c | 0x20;
        const digit = isDigit(c) ? c - 0x30 : hex && lower >= 0x61 && lower <= 0x66 ? lower - 0x57 : -1;
        if (digit === -1) break;
        code = Math.min(code * (hex ? 16 : 10) + digit, 0x110000);
      }
      const terminated = value.charCodeAt(end) === 0x3b;
      if (end > digitsStart && (terminated || context !== "xml")) {
        decoded = charOf(code);
        if (terminated) end++;
      }
    } else {
      // Nommée : &eacute;
      while (end < length && end - at <= NAME_MAX && isAlnum(value.charCodeAt(end))) end++;
      const name = value.slice(at + 1, end);
      const code = value.charCodeAt(end) === 0x3b ? (context === "xml" ? XML_NAMED : NAMED).get(name) : undefined;
      if (code !== undefined) {
        decoded = charOf(code);
        end++;
      } else if (context !== "xml") {
        // Sans point-virgule : le plus long nom ancien en tête (`&notit;` se lit « ¬it; », comme dans un navigateur)
        for (let size = Math.min(name.length, LEGACY_NAME_MAX); size >= 2 && decoded === undefined; size--) {
          const prefix = name.slice(0, size);
          if (!LEGACY.has(prefix)) continue;
          const next = value.charCodeAt(at + 1 + size);
          if (context === "attribute" && (next === 0x3d || isAlnum(next))) break;
          decoded = charOf(NAMED.get(prefix)!);
          end = at + 1 + size;
        }
      }
    }
    if (decoded === undefined) {
      at = value.indexOf("&", at + 1);
      continue;
    }
    out += value.slice(last, at) + decoded;
    last = end;
    at = value.indexOf("&", end);
  }
  return last === 0 ? value : out + value.slice(last);
}
