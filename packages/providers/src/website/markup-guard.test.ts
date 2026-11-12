import { load } from "cheerio/slim";
import { describe, expect, it } from "vitest";
import type { DomNode } from "./dom";
import { MARKUP_LIMITS, MarkupTooComplexError, assertParsable, measureMarkup, type MarkupMeasure } from "./markup-guard";
import { timed } from "./test-timing";

const exact = (markup: string, xml = false): MarkupMeasure => measureMarkup(markup, { xml, maxDepth: Infinity, maxNodes: Infinity });

/** Ce que l'analyseur produit réellement, avec les réglages de `loadMarkup` (sans décodage des entités). */
function parsed(markup: string, xml = false): MarkupMeasure {
  const $ = load(markup, { xml: { xmlMode: xml, decodeEntities: false } });
  let depth = 0;
  let nodes = 0;
  const pending: [DomNode, number][] = $.root()
    .contents()
    .toArray()
    .map((node): [DomNode, number] => [node, 1]);
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    const [node, at] = entry;
    if ((node.type as string) !== "text") nodes++;
    if (!("attribs" in node)) continue;
    if (at > depth) depth = at;
    for (const child of node.children) pending.push([child, at + 1]);
  }
  return { depth, nodes };
}

describe("measureMarkup — règles de l'analyseur HTML", () => {
  const cases: [string, string, MarkupMeasure][] = [
    ["document vide", "", { depth: 0, nodes: 0 }],
    ["texte seul", "bonjour < monde & co", { depth: 0, nodes: 0 }],
    ["un paragraphe", "<p>a</p>", { depth: 1, nodes: 1 }],
    ["imbrication", "<div><p><b>x", { depth: 3, nodes: 3 }],
    ["balises sans contenu : jamais empilées", "<div><br><img><hr><input>", { depth: 2, nodes: 5 }],
    ["fermeture implicite des paragraphes", "<p>a<p>b<p>c<div>d", { depth: 1, nodes: 4 }],
    ["fermeture implicite des éléments de liste et des cellules", "<ul><li>a<li>b</ul><table><tr><td>a<td>b<tr><td>c", { depth: 3, nodes: 9 }],
    ["balise fermante sans balise ouvrante : ignorée", "<div></span></section><p>", { depth: 2, nodes: 2 }],
    ["balise fermante : ferme aussi ce qui a été ouvert depuis", "<div><b><i></div><p>", { depth: 3, nodes: 4 }],
    ["« </p> » seul : un paragraphe vide ; « </br> » : un saut de ligne", "<div></p></br>", { depth: 2, nodes: 3 }],
    ["contenu brut d'un script", `<script>var a = "<div><div>";</script><b>`, { depth: 1, nodes: 2 }],
    ["contenu brut : style, titre, zone de texte", "<style><div></style><title><div></title><textarea><div></textarea><xmp><div></xmp>", { depth: 1, nodes: 4 }],
    ["fin de contenu brut insensible à la casse, espaces admis", "<script><div></SCRIPT ><b><i>", { depth: 2, nodes: 3 }],
    ["script jamais refermé : tout le reste est son contenu", "<script><div><div><div>", { depth: 1, nodes: 1 }],
    ["script auto-fermant : son contenu est lu comme des balises", "<script/><div><div>", { depth: 3, nodes: 3 }],
    ["particularité de l'analyseur : « tmp » et « xitle » passent pour du contenu brut", "<tmp><div><div></xmp><div><xitle><b></title><i>", { depth: 4, nodes: 4 }],
    ["commentaire", "<!-- <div><div> --><p>", { depth: 1, nodes: 2 }],
    ["commentaires courts « <!--> » et « <!---> »", "<!--><div><!---><p>", { depth: 2, nodes: 4 }],
    ["commentaire jamais refermé : un nœud, et plus de balises", "<p><!-- <div><div>", { depth: 1, nodes: 2 }],
    ["section CDATA, déclaration, instruction de traitement", "<!DOCTYPE html><?php echo 1 ?><![CDATA[<div>]]><p>", { depth: 1, nodes: 4 }],
    ["« <!> » ne ferme rien : la déclaration court jusqu'au « > » suivant", "<!><div><p>", { depth: 1, nodes: 2 }],
    ["« > » dans une valeur d'attribut entre guillemets", `<a title="a > b" data-x='c > d'><b>`, { depth: 2, nodes: 2 }],
    ["guillemet dans une valeur sans guillemets, attribut nommé « = »", `<svg><a x=y"z =/><b>`, { depth: 2, nodes: 3 }],
    ["balise auto-fermante : ignorée en HTML", "<div/><p/><span>", { depth: 3, nodes: 3 }],
    ["balise auto-fermante : reconnue dans un dessin", "<svg><path/><g><rect/></g></svg><div/><p>", { depth: 3, nodes: 6 }],
    ["retour au HTML dans un dessin (foreignObject)", "<svg><foreignObject><div/><p/></foreignObject><circle/><b>", { depth: 4, nodes: 6 }],
    ["balise jamais refermée par « > » : ignorée", "<div><p class='x", { depth: 1, nodes: 1 }],
    ["chevron qui n'ouvre rien", "a <3 b <> c </> d < div> <1>", { depth: 0, nodes: 0 }],
    ["« </3> » : un commentaire", "<p></3><b>", { depth: 2, nodes: 3 }],
    ["noms sans égard à la casse", "<DIV><P></div><Span>", { depth: 2, nodes: 3 }],
  ];
  for (const [label, markup, expected] of cases) {
    it(label, () => {
      expect(parsed(markup), "analyseur réel").toEqual(expected);
      expect(exact(markup)).toEqual(expected);
    });
  }
});

describe("measureMarkup — règles XML (plan de site)", () => {
  const cases: [string, string, MarkupMeasure][] = [
    ["plan de site", `<?xml version="1.0"?><urlset><url><loc>https://a.fr/</loc></url><url><loc>https://a.fr/b</loc></url></urlset>`, { depth: 3, nodes: 6 }],
    ["balises auto-fermantes partout", "<a><b/><c/><d></d></a>", { depth: 2, nodes: 4 }],
    ["ni balise sans contenu ni fermeture implicite", "<p><br><p><li><li>", { depth: 5, nodes: 5 }],
    ["noms sensibles à la casse", "<a><A></a><b>", { depth: 2, nodes: 3 }],
    ["pas de contenu brut", "<script><div></script><title><b>", { depth: 2, nodes: 4 }],
    ["tout caractère ouvre un nom de balise", "<1><_a><é>", { depth: 3, nodes: 3 }],
    ["section CDATA", "<a><![CDATA[<b><c>]]><d/></a>", { depth: 2, nodes: 3 }],
  ];
  for (const [label, markup, expected] of cases) {
    it(label, () => {
      expect(parsed(markup, true), "analyseur réel").toEqual(expected);
      expect(exact(markup, true)).toEqual(expected);
    });
  }
});

describe("measureMarkup — fidélité à l'analyseur", () => {
  // Générateur pseudo-aléatoire déterministe (mulberry32) : le test rejoue toujours les mêmes documents
  const random = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const ch = String.fromCharCode;
  const NAMES = (
    "div span p li ul ol table tr td th thead tbody tfoot a b i svg path g foreignObject title script style textarea xmp option optgroup select br img input hr h1 h2 body head link dd dt math mi desc x-custom DIV Svg P section form button rt rp main annotation-xml " +
    "tmp xitle xextarea TMP tm ti te xm xi xe s sc st scr scripts styl stylee SCRIPT sTyLe TITLE TextArea XMP x t tx sx scrip titl textare xmpp meta base output datalist pre BR linK ms mo mn mtext MATH"
  ).split(" ");
  const ATTRIBUTES = ["", "", "", ' class="a"', " hidden", ' title="a > b"', " title='x > y'", " data-x=a'b", ' data-y=a"b>', " x=y/", " a = 'q'", ' b= "w"', " /", " c=", " d='jamais fermé", ' e="', " =f", " g=h>i", ' k="l" m=n', " o='p'/", "\n\tq\n=\n'r'\n", " =", " ==", ' ="', " ='x'", " a=&amp;", ' a="&quot;>"', " a=&gt", " &", " a=b&", "/ /", " / x", "\f", "\r", ` ${ch(0x0b)}`, ` a${ch(0)}=b`, ' a="&Mu";"'];
  const TEXTS = ["texte", " ", "a < b", "x > y", "&amp;", "<", "< div", "<3", "</", "</ >", "</>", "<>", "<!", "<?", "\n", "&lt;", "&lt", "&#60;", "&#x3c", "&", "&#", "&#x", "&am", "&amp", "]]>", "-->", ch(0x1c), ch(0x0f), ch(0x1c) + ch(0x0f), "<<", "<é>", "</é>", "<1>", "</1>", "<_a>", "</_a>", "<a:b>", "</a:b>", "</ p>", "</\np>", "</p/>", "</br>", "</BR >", "</P>", "</p x='>'>", "</svg>", "</title>", "</desc>", "</mi>", "&Mu!;", "&gt>", "&apos'"];
  const RAW_ENDS = ["</script>", "</SCRIPT >", "</script/>", "</scriptx>", "</script", "</style>", "</STYLE\n>", "</title>", "</Title >", "</textarea>", "</TEXTAREA\t>", "</xmp>", "</XMP >", `${ch(0x1c)}/script>`, `<${ch(0x0f)}script>`, `${ch(0x1c)}${ch(0x0f)}style>`, `${ch(0x1c)}${ch(0x0f)}title >`, "<</script>", "</</title>", "</scr</script>", "</xmp</xmp>", "&lt;/title&gt;", "&</title>", "&amp</title>"];
  const MISC = ["<!DOCTYPE html>", "<?xml version='1.0'?>", "<!x>", "<!-", "<![CDATA[", "<!--", "<!-->", "<!--->", "<!---->", "<!--x--!>", "<!- ->", "<![CDATA[]]>", "<![cdata[ x ]]>", "<![CDATA", "<![CDATA[ ]]]>", "<!>", "<!->", "<?>", "<? ?>", "<!--x->", "<!--x--->", "<![", "<!-- <!-- --> -->", "<?php echo '<div>'; ?>", "<!DOCTYPE", "<!--x", "<![CDATA[x"];
  const SOUP = [..."<<<<>>>>////!!??--==\"\"''   \n\t&;#[]abpstxmice"];

  function document(next: () => number, size: number, soup: boolean): string {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    let out = "";
    for (let i = 0; i < size; i++) {
      const r = next();
      if (soup && r < 0.5) {
        for (let k = 1 + Math.floor(next() * 6); k > 0; k--) out += pick(SOUP);
      } else if (r < 0.4) out += `<${pick(NAMES)}${pick(ATTRIBUTES)}${next() < 0.2 ? pick(ATTRIBUTES) : ""}${next() < 0.15 ? "/" : ""}>`;
      else if (r < 0.64) out += `</${pick(NAMES)}${next() < 0.1 ? " x" : ""}>`;
      else if (r < 0.74) out += pick(TEXTS);
      else if (r < 0.78) out += `<!-- ${pick(["c", "<div>", "-->", "--", "> <p>"])} -->`;
      else if (r < 0.81) out += `<![CDATA[ ${pick(["<div>", "]]", "x"])} ]]>`;
      else if (r < 0.85) out += pick(MISC);
      else if (r < 0.88) out += `<script${pick(ATTRIBUTES)}>var a = "<div><div>"; if (a</b) {}</script>`;
      else if (r < 0.9) out += "<style>p > a { }</style>";
      else if (r < 0.92) out += `<svg><path d="M0 0"/><circle r='1' /><g><rect/></g></svg>`;
      else if (r < 0.96) out += pick(RAW_ENDS);
      else out += `<${pick(NAMES)}`;
    }
    return out;
  }

  it("six mille documents tirés au hasard : même profondeur et même nombre de nœuds que l'analyseur, en HTML comme en XML", () => {
    const different: string[] = [];
    for (let seed = 1; seed <= 6_000; seed++) {
      const next = random(seed);
      const xml = seed % 5 === 0;
      const markup = document(next, 5 + Math.floor(next() * 60), seed % 3 === 0);
      const measured = exact(markup, xml);
      const real = parsed(markup, xml);
      if (measured.depth !== real.depth || measured.nodes !== real.nodes) different.push(`graine ${seed}${xml ? " (xml)" : ""} : mesuré ${JSON.stringify(measured)}, réel ${JSON.stringify(real)} — ${JSON.stringify(markup.slice(0, 300))}`);
    }
    // Un écart signifie que l'analyseur a changé de règles : le garde-fou (markup-guard) doit être réaligné sur lui
    expect(different.slice(0, 5)).toEqual([]);
  });

  it("imbrications profondes tirées au hasard : la profondeur mesurée est celle de l'analyseur", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = random(seed * 7919);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
      let markup = "";
      for (let i = 0; i < 600; i++) markup += next() < 0.8 ? `<${pick(["div", "span", "b", "section", "ul", "li", "table", "tr", "td", "p", "a", "svg", "g"])}>` : pick(["</div>", "</span>", "</p>", "<br>", "texte", "<!-- c -->", "</ul>", "</svg>"]);
      expect(exact(markup), `graine ${seed}`).toEqual(parsed(markup));
    }
  });
});

describe("bornes d'un document analysable", () => {
  const reasonOf = (markup: string, xml = false): string | null => {
    try {
      assertParsable(markup, { xml });
      return null;
    } catch (error) {
      if (error instanceof MarkupTooComplexError) return error.reason;
      throw error;
    }
  };

  it("bornes : 400 niveaux, 100 000 nœuds hors texte", () => {
    expect(MARKUP_LIMITS).toEqual({ depth: 400, nodes: 100_000 });
    expect(reasonOf("<div>".repeat(400))).toBeNull();
    expect(reasonOf("<div>".repeat(401))).toBe("depth");
    expect(reasonOf("<br>".repeat(100_000))).toBeNull();
    expect(reasonOf("<br>".repeat(100_001))).toBe("nodes");
    expect(reasonOf("<!---->".repeat(100_001))).toBe("nodes");
    expect(reasonOf(`<p>${"<!x>".repeat(50_000)}${"<?x?>".repeat(50_000)}`)).toBe("nodes");
    expect(reasonOf("<a>".repeat(401), true)).toBe("depth");
    expect(reasonOf(`<urlset>${"<url><loc>https://a.fr/</loc></url>".repeat(40_000)}</urlset>`, true)).toBeNull();
    expect(reasonOf(`<urlset>${"<url><loc>https://a.fr/</loc></url>".repeat(50_000)}</urlset>`, true)).toBe("nodes");
  });

  it("la mesure s'arrête dès qu'une borne est dépassée", () => {
    expect(measureMarkup("<div>".repeat(1_000_000)).depth).toBe(MARKUP_LIMITS.depth + 1);
    expect(measureMarkup("<p>".repeat(1_000_000)).nodes).toBe(MARKUP_LIMITS.nodes + 1);
    expect(measureMarkup("<div>".repeat(50), { maxDepth: 10 }).depth).toBe(11);
  });

  it("une vraie page est très en deçà des bornes", () => {
    const section = `<section class="bloc"><div class="colonne"><h2>Titre</h2><p>Un <strong>paragraphe</strong> avec <a href="/lien">un lien</a>.</p><ul><li>Un</li><li>Deux</li></ul></div></section>`;
    const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Page</title></head><body><header><nav><ul><li><a href="/">Accueil</a></li></ul></nav></header><main>${section.repeat(300)}</main></body></html>`;
    const measure = measureMarkup(page);
    expect(measure.depth).toBeLessThan(12);
    expect(measure.nodes).toBeLessThan(5_000);
    expect(measure).toEqual(parsed(page));
  });

  it("documents piégés de 5 Mo : mesurés en un passage, sans jamais s'attarder", () => {
    const fill = (unit: string, bytes = 5 * 1024 * 1024): string => unit.repeat(Math.floor(bytes / unit.length));
    const hostile: Record<string, string> = {
      "imbrication sans fin": fill("<div>"),
      "paragraphes sans fin": fill("<p>"),
      "texte seul": fill("mot "),
      "chevrons seuls": fill("<"),
      "commentaire jamais refermé": `<!--${fill("-<div>")}`,
      "script jamais refermé": `<script>${fill("</scrip <div>")}`,
      "titre jamais refermé": `<title>${fill("</titl& <")}`,
      "attribut démesuré": `<a title="${fill("x>")}`,
      "attributs sans nombre": `<a ${fill("x=y ")}>`,
      "balises fermantes sans balise ouvrante, sur une pile profonde": `${"<a>".repeat(400)}${fill("</b>")}`,
      "balises fermantes orphelines aux noms longs": `${"<abcdefgh>".repeat(400)}${fill("</abcdefgi>")}`,
      "entités": fill("&Mu!;&amp"),
      "sections CDATA": fill("<![CDATA[]]]"),
    };
    for (const [label, markup] of Object.entries(hostile)) {
      const { value, ms } = timed(() => measureMarkup(markup));
      expect(ms, label).toBeLessThan(2_000);
      expect(value.depth, label).toBeLessThanOrEqual(MARKUP_LIMITS.depth + 1);
      expect(value.nodes, label).toBeLessThanOrEqual(MARKUP_LIMITS.nodes + 1);
    }
  });
});
