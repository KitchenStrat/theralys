import { describe, expect, it } from "vitest";
import { ROOT_WRAPPER, type DomElement, type DomNode, closestElement, eachText, firstDescendant, hasClass, isElement, isTextNode, isWithin, loadMarkup, textOf, walkTree } from "./dom";
import { MARKUP_LIMITS, MarkupTooComplexError, measureMarkup } from "./markup-guard";

const first = ($: ReturnType<typeof loadMarkup>, selector: string): DomElement => {
  const element = $(selector).get(0);
  if (!element || !isElement(element)) throw new Error(`élément introuvable : ${selector}`);
  return element;
};

describe("loadMarkup — entités", () => {
  it("décodées dans les textes, les titres et les attributs, comme le ferait l'analyseur", () => {
    const $ = loadMarkup(`<title>S&eacute;ances &amp; tarifs</title><p title="L&#39;&oelig;il &amp; la main" data-x="a&lt;b">Caf&eacute; &lt;b&gt; &#x1F33F;</p><a href="/rdv?a=1&amp;b=2&copy=3">x</a>`);
    expect($("title").text()).toBe("Séances & tarifs");
    expect($("p").text()).toBe(`Café <b> ${String.fromCodePoint(0x1f33f)}`);
    expect($("p").attr("title")).toBe("L'œil & la main");
    expect($("p").attr("data-x")).toBe("a<b");
    // Une adresse garde ses paramètres : « &copy= » n'y est pas une entité
    expect($("a").attr("href")).toBe("/rdv?a=1&b=2&copy=3");
    // Le texte décodé reste du texte : aucune balise n'en naît
    expect($("b").length).toBe(0);
    // Un seul décodage : une entité écrite en toutes lettres le reste
    const escaped = loadMarkup(`<p title="&amp;amp; &amp;#233;">&amp;eacute; &amp;lt;b&amp;gt;</p>`);
    expect(escaped("p").text()).toBe("&eacute; &lt;b&gt;");
    expect(escaped("p").attr("title")).toBe("&amp; &#233;");
  });

  it("contenu brut (script, style, zone de texte) et commentaires : laissés tels quels", () => {
    const $ = loadMarkup(`<script type="application/ld+json">{"name":"A &amp; B"}</script><style>a::after{content:"&eacute;"}</style><textarea>&lt;</textarea><!-- &amp; --><p>&amp;</p>`);
    expect($("script").text()).toBe(`{"name":"A &amp; B"}`);
    expect($("style").text()).toBe(`a::after{content:"&eacute;"}`);
    expect($("textarea").text()).toBe("&lt;");
    expect($("p").text()).toBe("&");
  });

  it("XML : cinq noms et entités numériques ; section CDATA littérale", () => {
    const $ = loadMarkup(`<urlset><url><loc>https://a.fr/?a=1&amp;b=2&#233;</loc></url><url><loc><![CDATA[https://a.fr/?c=3&amp;d=4]]></loc></url><x y="&quot;&eacute;&quot;"/></urlset>`, { xml: true });
    expect(
      $("loc")
        .toArray()
        .map((element) => textOf(element, 200)),
    ).toEqual(["https://a.fr/?a=1&b=2é", "https://a.fr/?c=3&amp;d=4"]);
    expect($("x").attr("y")).toBe('"&eacute;"');
  });

  it("une suite d'entités fabriquée ne change pas le découpage du document", () => {
    // Avec le décodeur d'entités de l'analyseur (entities 7.0.1), « &Mu"G » avale le guillemet : l'attribut court alors jusqu'au
    // guillemet suivant, le commentaire n'en est plus un, et les cinquante balises qu'il cachait à la mesure sont bel et bien ouvertes.
    const inAttribute = `<a title="&Mu"G><!-- "> ${"<div>".repeat(50)} -->`;
    // Même effet dans le texte : « &Zcy », un caractère de contrôle, et le chevron du commentaire est avalé.
    const inText = `<p>&Zcy${String.fromCharCode(0x1a)}<!-- G ${"<div>".repeat(50)} -->`;
    for (const trap of [inAttribute, inText]) {
      const $ = loadMarkup(trap);
      expect($("div").length, trap.slice(0, 20)).toBe(0);
      expect($("*").length).toBe(1);
      // Le garde-fou a mesuré exactement ce que l'analyseur a produit
      expect(measureMarkup(trap)).toEqual({ depth: 1, nodes: 2 });
    }
    expect(loadMarkup(inAttribute)("a").attr("title")).toBe("&Mu");
    const $ = loadMarkup(`<p>&gt></p><i title='&apos'>x</i><b title="&Mu";">y</b>`);
    expect($("p").text()).toBe(">>");
    expect($("i").attr("title")).toBe("&apos");
    expect($("b").attr("title")).toBe("&Mu");
  });
});

describe("loadMarkup — bornes et racine", () => {
  it("document trop imbriqué ou trop touffu : refusé avant l'analyse", () => {
    expect(() => loadMarkup("<div>".repeat(MARKUP_LIMITS.depth))).not.toThrow();
    expect(() => loadMarkup("<div>".repeat(MARKUP_LIMITS.depth + 1))).toThrow(MarkupTooComplexError);
    expect(() => loadMarkup("<i></i>".repeat(MARKUP_LIMITS.nodes + 1))).toThrow(MarkupTooComplexError);
    expect(() => loadMarkup("<a>".repeat(MARKUP_LIMITS.depth + 1), { xml: true })).toThrow(MarkupTooComplexError);
  });

  it("des milliers d'éléments à la racine : réunis sous un élément racine unique, sans rien changer d'autre", () => {
    const $ = loadMarkup(`<!doctype html><title>T</title>${"<p>Un</p><p>Deux</p>".repeat(5_000)}`);
    expect($.root().children().length).toBe(1);
    const wrapper = first($, ROOT_WRAPPER);
    expect(wrapper.parent).toBe($.root().get(0));
    expect(wrapper.children.every((child) => child.parent === wrapper)).toBe(true);
    expect($("p").length).toBe(10_000);
    expect($("title").text()).toBe("T");
    expect(textOf(wrapper, 10)).toBe("TUnDeuxUnD");
    // Les recherches restent rapides
    const start = performance.now();
    for (let i = 0; i < 20; i++) $("p, title, [class]").toArray();
    expect(performance.now() - start).toBeLessThan(3_000);
  });

  it("document ordinaire ou petit fragment : racine inchangée", () => {
    expect(loadMarkup("<!doctype html><html><head></head><body><p>x</p></body></html>")(ROOT_WRAPPER).length).toBe(0);
    expect(loadMarkup("<h1>a</h1><p>b</p><p>c</p>")(ROOT_WRAPPER).length).toBe(0);
    expect(loadMarkup("")("*").length).toBe(0);
  });
});

describe("parcours de l'arbre", () => {
  const $ = loadMarkup(
    `<html><body><nav class="menu principal"><ul><li><a href="/a"><img alt="Logo"><span>Accueil</span></a></li></ul></nav><main><article><h1>Titre <em>fort</em></h1><p>Un <b>deux</b> trois</p><div hidden>caché</div></article></main><footer role="contentinfo"><p>Pied</p></footer></body></html>`,
  );

  it("walkTree : ordre du document, « skip » saute un sous-arbre, « stop » arrête", () => {
    const names = (visit: (node: DomNode) => "skip" | "stop" | void): string[] => {
      const seen: string[] = [];
      walkTree(first($, "body"), (node) => {
        if (isElement(node)) seen.push(node.name);
        return visit(node);
      });
      return seen;
    };
    expect(names(() => undefined)).toEqual(["body", "nav", "ul", "li", "a", "img", "span", "main", "article", "h1", "em", "p", "b", "div", "footer", "p"]);
    expect(names((node) => (isElement(node) && (node.name === "nav" || node.name === "article") ? "skip" : undefined))).toEqual(["body", "nav", "main", "article", "footer", "p"]);
    expect(names((node) => (isElement(node) && node.name === "h1" ? "stop" : undefined))).toEqual(["body", "nav", "ul", "li", "a", "img", "span", "main", "article", "h1"]);
    // Le parcours ne sort jamais du sous-arbre demandé
    const inside: string[] = [];
    walkTree(first($, "article"), (node) => {
      if (isTextNode(node)) inside.push(node.data);
    });
    expect(inside).toEqual(["Titre ", "fort", "Un ", "deux", " trois", "caché"]);
  });

  it("textOf : texte du sous-arbre, borné, sous-arbres écartés à la demande", () => {
    expect(textOf(first($, "h1"), 100)).toBe("Titre fort");
    expect(textOf(first($, "article"), 100)).toBe("Titre fortUn deux troiscaché");
    expect(textOf(first($, "article"), 8)).toBe("Titre fo");
    expect(textOf(first($, "article"), 100, (node) => isElement(node) && node.attribs.hidden !== undefined)).toBe("Titre fortUn deux trois");
    expect(textOf(first($, "img"), 100)).toBe("");
  });

  it("eachText : s'arrête quand la visite rend false", () => {
    const seen: string[] = [];
    eachText(first($, "body"), (text) => {
      seen.push(text.data);
      return seen.length < 2;
    });
    expect(seen).toEqual(["Accueil", "Titre "]);
  });

  it("closestElement, isWithin, firstDescendant, hasClass", () => {
    const link = first($, "a");
    expect(closestElement(link, (element) => element.name === "nav")?.attribs.class).toBe("menu principal");
    expect(closestElement(link, (element) => element.name === "a")).toBe(link);
    expect(closestElement(link.parent, (element) => element.name === "a")).toBeNull();
    expect(closestElement(link, (element) => element.name === "main")).toBeNull();
    expect(closestElement(null, () => true)).toBeNull();
    expect(isWithin(link, first($, "nav"))).toBe(true);
    expect(isWithin(link, link)).toBe(true);
    expect(isWithin(link, first($, "main"))).toBe(false);
    expect(firstDescendant(link, (element) => element.name === "img")?.attribs.alt).toBe("Logo");
    expect(firstDescendant(link, (element) => element.name === "a")).toBeNull();
    expect(firstDescendant(first($, "body"), (element) => element.name === "p", 5)).toBeNull();
    expect(firstDescendant(first($, "body"), (element) => element.name === "p")?.children.length).toBe(3);
    const nav = first($, "nav");
    expect(hasClass(nav, "menu")).toBe(true);
    expect(hasClass(nav, "principal")).toBe(true);
    expect(hasClass(nav, "men")).toBe(false);
    expect(hasClass(nav, "Menu")).toBe(false);
    expect(hasClass(link, "menu")).toBe(false);
  });

  it("texte d'éléments imbriqués par centaines autour d'un long texte : lu sans parcourir le texte entier", () => {
    const deep = loadMarkup(`${"<a>".repeat(390)}${"mot ".repeat(1_000_000)}${"</a>".repeat(390)}`);
    const start = performance.now();
    for (const element of deep("a").toArray()) expect(textOf(element, 12)).toBe("mot mot mot ");
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
