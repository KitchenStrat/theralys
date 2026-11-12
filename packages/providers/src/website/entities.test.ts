import { describe, expect, it } from "vitest";
import { decodeEntities } from "./entities";
import { cpuNow, sinceMs } from "./test-timing";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

describe("decodeEntities — texte d'une page", () => {
  it("entités nommées usuelles : lettres accentuées, ponctuation française, symboles", () => {
    expect(decodeEntities("Ost&eacute;opathe &agrave; Lyon &ndash; s&eacute;ances &amp; tarifs")).toBe("Ostéopathe à Lyon – séances & tarifs");
    expect(decodeEntities("&laquo;&nbsp;L&rsquo;&oelig;il&nbsp;&raquo; &hellip; 60&nbsp;&euro; &copy; &lt;b&gt; &quot;x&quot; &apos;y&apos;")).toBe(`«${cp(160)}L’œil${cp(160)}» … 60${cp(160)}€ © <b> "x" 'y'`);
    expect(decodeEntities("&Eacute;t&eacute;, &Ccedil;a, &OElig;uvre, No&euml;l, ma&icirc;tre, &ucirc;, &Agrave;")).toBe("Été, Ça, Œuvre, Noël, maître, û, À");
  });

  it("tables : Latin-1 de 160 à 255, grec, noms anciens tous connus", () => {
    expect(decodeEntities("&nbsp;&iexcl;&yuml;&thorn;&szlig;&times;&divide;&frac12;")).toBe(cp(160, 161, 255, 254, 223, 215, 247, 189));
    expect(decodeEntities("&Alpha;&Rho;&Sigma;&Omega;&alpha;&rho;&sigmaf;&sigma;&omega;&pi;&mu;")).toBe(cp(913, 929, 931, 937, 945, 961, 962, 963, 969, 960, 956));
    expect(decodeEntities("&rarr;&larr;&bull;&middot;&deg;&trade;&reg;&mdash;&lsquo;&ldquo;&rdquo;&thinsp;&check;")).toBe(cp(8594, 8592, 8226, 183, 176, 8482, 174, 8212, 8216, 8220, 8221, 8201, 10003));
  });

  it("entités numériques, décimales et hexadécimales, avec ou sans point-virgule", () => {
    expect(decodeEntities("caf&#233; caf&#xE9; caf&#Xe9; l&#8217;&#x153;il &#128512; &#x1F33F;")).toBe(`café café café l’œil ${cp(128512)} ${cp(0x1f33f)}`);
    expect(decodeEntities("&#233 et &#xe9 ; &#38;amp;")).toBe("é et é ; &amp;");
  });

  it("codes 128 à 159 : lus comme du Windows-1252 (vieux sites)", () => {
    expect(decodeEntities("l&#146;&#156;il &#150; 60&#128; &#133; &#147;x&#148;")).toBe("l’œil – 60€ … “x”");
  });

  it("codes impossibles : caractère de remplacement, jamais d'exception", () => {
    const replacement = cp(0xfffd);
    expect(decodeEntities("&#0; &#xD800; &#x110000; &#99999999999999999999; &#xFFFFFFFFFFFFFFFFFFFF;")).toBe(`${replacement} ${replacement} ${replacement} ${replacement} ${replacement}`);
  });

  it("ce qui n'est pas une entité reste tel quel", () => {
    for (const text of ["", "sans entité", "R&D", "a & b", "&", "&&", "&;", "&#;", "&#x;", "&#xg;", "&inconnue;", "&hellip sans point-virgule", "&Mu!;", '&Mu";', "&alpha1;", "AT&T; &t;", "fin &", "fin &#", "fin &am"]) {
      expect(decodeEntities(text), text).toBe(text);
    }
  });

  it("noms anciens : décodés même sans point-virgule, au plus long nom reconnu", () => {
    expect(decodeEntities("caf&eacute tr&egraves bien &copy 2026 &amp co &lt&gt")).toBe("café très bien © 2026 & co <>");
    expect(decodeEntities("&notit; &notin; &ampere; &eacutee")).toBe(`¬it; ${cp(8713)} &ere; ée`);
  });

  it("casse respectée : &Eacute; n'est pas &eacute;, &EACUTE; n'existe pas", () => {
    expect(decodeEntities("&Eacute;&eacute;&EACUTE;&AMP;&amp;&Amp;")).toBe("Éé&EACUTE;&&&Amp;");
  });

  it("un seul passage : le résultat d'un décodage n'est pas redécodé", () => {
    expect(decodeEntities("&amp;eacute; &amp;amp; &#38;lt;")).toBe("&eacute; &amp; &lt;");
  });
});

describe("decodeEntities — valeur d'attribut", () => {
  it("les paramètres d'une adresse ne sont pas pris pour des entités", () => {
    const href = "/recherche?a=1&copy=2&amp=3&reg=x&lt=4&section=5";
    expect(decodeEntities(href, "attribute")).toBe(href);
    expect(decodeEntities("/page?a=1&amp;b=2&#38;c=3", "attribute")).toBe("/page?a=1&b=2&c=3");
    // Dans le texte, la règle des navigateurs décode le nom ancien même devant « = »
    expect(decodeEntities("a=1&copy=2", "text")).toBe("a=1©=2");
  });

  it("sans point-virgule, décodé seulement devant autre chose qu'une lettre, un chiffre ou « = »", () => {
    expect(decodeEntities("caf&eacute; caf&eacute caf&eacute!", "attribute")).toBe("café café café!");
    expect(decodeEntities("&eacutex &eacute1 &eacute=", "attribute")).toBe("&eacutex &eacute1 &eacute=");
  });

  it("intitulés et descriptions", () => {
    expect(decodeEntities("Cabinet d&#39;ost&eacute;opathie &amp; de bien-&ecirc;tre", "attribute")).toBe("Cabinet d'ostéopathie & de bien-être");
  });
});

describe("decodeEntities — XML", () => {
  it("cinq noms, entités numériques, point-virgule obligatoire", () => {
    expect(decodeEntities("https://a.fr/?a=1&amp;b=2 &lt;x&gt; &quot;y&quot; &apos;z&apos; &#233; &#xE9;", "xml")).toBe(`https://a.fr/?a=1&b=2 <x> "y" 'z' é é`);
    for (const text of ["&eacute;", "&amp", "&#233", "&nbsp;", "&AMP;"]) expect(decodeEntities(text, "xml"), text).toBe(text);
  });
});

describe("decodeEntities — robustesse", () => {
  it("texte long et truffé d'esperluettes : un passage, quelques millisecondes", () => {
    const text = "a&b&amp;c&#233;&eacute&unknown;&".repeat(100_000);
    const start = cpuNow();
    const decoded = decodeEntities(text);
    expect(sinceMs(start)).toBeLessThan(2_000);
    expect(decoded.startsWith("a&b&céé&unknown;&a&b&céé&unknown;&")).toBe(true);
  });

  it("nom démesuré : pas une entité", () => {
    const text = `&${"a".repeat(100_000)};`;
    expect(decodeEntities(text)).toBe(text);
    // Un nom ancien en tête d'une longue suite de lettres reste décodé, comme dans un navigateur
    expect(decodeEntities(`&amp${"a".repeat(1_000)}`)).toBe(`&${"a".repeat(1_000)}`);
  });
});
