import { describe, expect, it } from "vitest";
import { articleCopy, articleImageFileName } from "./article-copy";

/** Corps (HTML) d'un article sans titre : ce que donne le markdown seul. */
const html = (content: string): string => articleCopy({ title: "", content }).html;
const text = (content: string): string => articleCopy({ title: "", content }).text;

/** Article à la structure imposée aux articles du blog (ARTICLE_STRUCTURE). */
const ARTICLE = [
  "Si vous lisez ces lignes, c'est que votre corps vous envoie des **signaux clairs**.",
  "",
  "## Ce qui se joue dans votre quotidien",
  "",
  "Rythme soutenu, pauses rares : le corps encaisse.",
  "Les zones les plus souvent touchées :",
  "",
  "- **Les épaules et la nuque** : la charge mentale",
  "- **Le souffle** : une respiration qui se raccourcit",
  "",
  "> *« Mon corps parle quand les mots manquent. »*",
  "",
  "### Un exercice à essayer maintenant",
  "",
  "1. Asseyez-vous confortablement.",
  "2. Inspirez par le nez pendant 4 secondes.",
  "",
  "## Questions fréquentes",
  "",
  "**La séance est-elle douloureuse ?**",
  "",
  "Non : rien n'est jamais forcé.",
].join("\n");

describe("articleCopy : article prêt pour le presse-papiers", () => {
  it("HTML : titre en h1, intertitres, paragraphes, listes, citation, gras et italique", () => {
    expect(articleCopy({ title: "Nuque bloquée au réveil", content: ARTICLE }).html).toBe(
      [
        "<h1>Nuque bloquée au réveil</h1>",
        "<p>Si vous lisez ces lignes, c'est que votre corps vous envoie des <strong>signaux clairs</strong>.</p>",
        "<h2>Ce qui se joue dans votre quotidien</h2>",
        "<p>Rythme soutenu, pauses rares : le corps encaisse. Les zones les plus souvent touchées :</p>",
        "<ul>",
        "<li><strong>Les épaules et la nuque</strong> : la charge mentale</li>",
        "<li><strong>Le souffle</strong> : une respiration qui se raccourcit</li>",
        "</ul>",
        "<blockquote><p><em>« Mon corps parle quand les mots manquent. »</em></p></blockquote>",
        "<h3>Un exercice à essayer maintenant</h3>",
        "<ol>",
        "<li>Asseyez-vous confortablement.</li>",
        "<li>Inspirez par le nez pendant 4 secondes.</li>",
        "</ol>",
        "<h2>Questions fréquentes</h2>",
        "<p><strong>La séance est-elle douloureuse ?</strong></p>",
        "<p>Non : rien n'est jamais forcé.</p>",
      ].join("\n"),
    );
  });

  it("texte brut : mêmes blocs séparés par une ligne vide, sans marque de mise en forme", () => {
    expect(articleCopy({ title: "Nuque bloquée au réveil", content: ARTICLE }).text).toBe(
      [
        "Nuque bloquée au réveil",
        "Si vous lisez ces lignes, c'est que votre corps vous envoie des signaux clairs.",
        "Ce qui se joue dans votre quotidien",
        "Rythme soutenu, pauses rares : le corps encaisse. Les zones les plus souvent touchées :",
        "- Les épaules et la nuque : la charge mentale\n- Le souffle : une respiration qui se raccourcit",
        "« Mon corps parle quand les mots manquent. »",
        "Un exercice à essayer maintenant",
        "1. Asseyez-vous confortablement.\n2. Inspirez par le nez pendant 4 secondes.",
        "Questions fréquentes",
        "La séance est-elle douloureuse ?",
        "Non : rien n'est jamais forcé.",
      ].join("\n\n") + "\n",
    );
  });

  it("titre : sur une ligne, échappé ; sans titre, le corps seul", () => {
    expect(articleCopy({ title: "  Stress &\n sommeil <vite>  ", content: "Texte." })).toEqual({
      html: "<h1>Stress &amp; sommeil &lt;vite&gt;</h1>\n<p>Texte.</p>",
      text: "Stress & sommeil <vite>\n\nTexte.\n",
    });
    expect(articleCopy({ title: "", content: "Texte." })).toEqual({ html: "<p>Texte.</p>", text: "Texte.\n" });
    // Fins de ligne Windows : mêmes blocs
    expect(html("Un.\r\n\r\n## Deux\r\n\r\nTrois.")).toBe("<p>Un.</p>\n<h2>Deux</h2>\n<p>Trois.</p>");
  });

  it("le titre de l'article reste le seul titre de niveau 1", () => {
    expect(html("# Un\n\n## Deux\n\n### Trois ###\n\n####### sept dièses")).toBe("<h2>Un</h2>\n<h2>Deux</h2>\n<h3>Trois</h3>\n<p>####### sept dièses</p>");
  });
});

describe("articleCopy : listes et citations", () => {
  it("éléments numérotés séparés par une ligne vide : une seule liste, la numérotation ne repart pas", () => {
    expect(html("1. un\n\n2. deux\n\n3. trois")).toBe("<ol>\n<li>un</li>\n<li>deux</li>\n<li>trois</li>\n</ol>");
    expect(text("1. un\n\n2. deux\n\n3. trois")).toBe("1. un\n2. deux\n3. trois\n");
  });

  it("liste qui ne commence pas à 1, puces « * » et « + », deux listes de types différents", () => {
    expect(html("3. trois\n4) quatre")).toBe('<ol start="3">\n<li>trois</li>\n<li>quatre</li>\n</ol>');
    expect(text("3. trois\n4) quatre")).toBe("3. trois\n4. quatre\n");
    expect(html("* un\n+ deux")).toBe("<ul>\n<li>un</li>\n<li>deux</li>\n</ul>");
    expect(html("- puce\n\n1. numéro")).toBe("<ul>\n<li>puce</li>\n</ul>\n<ol>\n<li>numéro</li>\n</ol>");
  });

  it("ligne qui prolonge un élément ou une citation ; sous-liste ramenée au niveau de la liste", () => {
    expect(html("- un élément\nsuite de l'élément\n- deux")).toBe("<ul>\n<li>un élément suite de l'élément</li>\n<li>deux</li>\n</ul>");
    expect(html("> première ligne\n> seconde ligne\nsuite sans chevron\n\nAprès.")).toBe(
      "<blockquote><p>première ligne seconde ligne suite sans chevron</p></blockquote>\n<p>Après.</p>",
    );
    expect(html("- un\n  - sous-élément\n- deux")).toBe("<ul>\n<li>un</li>\n<li>sous-élément</li>\n<li>deux</li>\n</ul>");
    // Un paragraphe après la liste n'y est pas rattaché
    expect(html("- un\n\nParagraphe.")).toBe("<ul>\n<li>un</li>\n</ul>\n<p>Paragraphe.</p>");
  });

  it("filet horizontal, absent du texte brut", () => {
    expect(html("Avant\n\n---\n\nAprès")).toBe("<p>Avant</p>\n<hr>\n<p>Après</p>");
    expect(text("Avant\n\n***\n\nAprès")).toBe("Avant\n\nAprès\n");
  });
});

describe("articleCopy : mise en forme en ligne", () => {
  it("gras, italique, les deux, imbriqués", () => {
    expect(html("Un **gras**, un *italique*, un _autre_ et __fort__.")).toBe("<p>Un <strong>gras</strong>, un <em>italique</em>, un <em>autre</em> et <strong>fort</strong>.</p>");
    expect(html("Texte **gras avec *italique* dedans** fin.")).toBe("<p>Texte <strong>gras avec <em>italique</em> dedans</strong> fin.</p>");
    expect(html("Un ***passage fort*** ici.")).toBe("<p>Un <strong><em>passage fort</em></strong> ici.</p>");
    expect(text("Un **gras**, un *italique*, un ***passage fort*** et `du code`.")).toBe("Un gras, un italique, un passage fort et du code.\n");
  });

  it("ce qui n'est pas une mise en forme reste tel quel", () => {
    expect(html("2 * 3 * 4 = 24 et a*b")).toBe("<p>2 * 3 * 4 = 24 et a*b</p>");
    expect(html("nom_de_fichier et autre_nom")).toBe("<p>nom_de_fichier et autre_nom</p>");
    expect(html("Une \\*étoile\\* littérale, *a\\*b* aussi.")).toBe("<p>Une *étoile* littérale, <em>a*b</em> aussi.</p>");
    expect(html("Deux ** étoiles sans fin")).toBe("<p>Deux ** étoiles sans fin</p>");
    expect(html("Tapez `sophrologue **albi**` dans Google.")).toBe("<p>Tapez <code>sophrologue **albi**</code> dans Google.</p>");
  });

  it("liens : seules les adresses absolues sont reprises (un lien relatif ne mènerait nulle part ailleurs)", () => {
    expect(html("Voir [mon **site**](https://exemple.fr/page?a=1&b=2) ici.")).toBe(
      '<p>Voir <a href="https://exemple.fr/page?a=1&amp;b=2">mon <strong>site</strong></a> ici.</p>',
    );
    expect(html("Écrire à [Claire](mailto:claire@exemple.fr) ou [appeler](tel:+33612345678).")).toBe(
      '<p>Écrire à <a href="mailto:claire@exemple.fr">Claire</a> ou <a href="tel:+33612345678">appeler</a>.</p>',
    );
    expect(html("Voir [la page](/motifs/stress) et [le contact](#contact).")).toBe("<p>Voir la page et le contact.</p>");
    expect(html("Adresse : <https://exemple.fr/a_b_c>.")).toBe('<p>Adresse : <a href="https://exemple.fr/a_b_c">https://exemple.fr/a_b_c</a>.</p>');
    // Texte brut : l'adresse suit le libellé, sauf si le libellé est déjà l'adresse
    expect(text("Voir [mon site](https://exemple.fr) et <https://exemple.fr/page>.")).toBe("Voir mon site (https://exemple.fr) et https://exemple.fr/page.\n");
    expect(text("Voir [la page](/motifs/stress).")).toBe("Voir la page.\n");
  });

  it("image dans le texte : son texte alternatif seulement (l'image de l'article se télécharge à part)", () => {
    expect(html("Avant ![photo du cabinet](https://exemple.fr/p.jpg) après.")).toBe("<p>Avant photo du cabinet après.</p>");
    expect(articleCopy({ title: "T", content: "![](https://exemple.fr/p.jpg)" }).html).not.toContain("<img");
  });
});

describe("articleCopy : rien de ce qui est écrit dans l'article ne sort comme du HTML", () => {
  it("caractères spéciaux échappés, balises du markdown jamais reprises", () => {
    expect(html('Prix < 50 € & durée > 1 h, "guillemets".')).toBe("<p>Prix &lt; 50 € &amp; durée &gt; 1 h, &quot;guillemets&quot;.</p>");
    expect(html("Texte <b>gras</b> et <br> saut <!-- commentaire -->fin.")).toBe("<p>Texte gras et  saut fin.</p>");
    expect(text("Texte <b>gras</b>.")).toBe("Texte gras.\n");
  });

  it("scripts, gestionnaires d'événements et adresses piégées : aucune balise ni attribut actif", () => {
    const hostile = [
      "Bonjour <script>alert(1)</script> fin.",
      "",
      "<script>",
      "document.location = 'https://mal.example'",
      "</script>",
      "",
      '<img src=x onerror="alert(1)"> et <a href="javascript:alert(1)">clic</a>',
      "",
      "[clic](javascript:alert(1)) et [autre](data:text/html,<script>alert(1)</script>)",
      "",
      '[piège](https://exemple.fr/"onmouseover="alert(1))',
      "",
      "- <iframe src=https://mal.example></iframe> élément",
    ].join("\n");
    const out = articleCopy({ title: '<img src=x onerror="alert(1)">', content: hostile }).html;
    // Seules balises présentes : celles que produit le convertisseur
    const tags = [...out.matchAll(/<\/?([a-z0-9]+)/g)].map((m) => m[1]);
    expect([...new Set(tags)].sort()).toEqual(["a", "h1", "li", "p", "ul"]);
    expect(out).not.toMatch(/<script|<img|<iframe|javascript:|data:text/i);
    // Un seul lien, vers une adresse web ; le guillemet de l'adresse ne ferme pas l'attribut
    expect(out.match(/<a /g)).toHaveLength(1);
    expect(out).toContain('<a href="https://exemple.fr/&quot;onmouseover=&quot;alert(1">piège</a>');
    expect(out).not.toMatch(/<[^>]*\son[a-z]+=/i);
    expect(out).toContain("<h1>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</h1>");
  });
});

describe("articleImageFileName", () => {
  it("titre de l'article en ASCII, extension du type reçu", () => {
    expect(articleImageFileName("Nuque bloquée au réveil : que faire ?", "image/jpeg")).toBe("nuque-bloquee-au-reveil-que-faire.jpg");
    expect(articleImageFileName("Sommeil", "image/webp")).toBe("sommeil.webp");
    expect(articleImageFileName("Sommeil", "image/svg+xml; charset=utf-8")).toBe("sommeil.svg");
    expect(articleImageFileName("Sommeil", "IMAGE/PNG")).toBe("sommeil.png");
  });

  it("type inconnu : extension de l'adresse, sinon jpg ; titre vide ou très long", () => {
    expect(articleImageFileName("Sommeil", "application/octet-stream", "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&w=1024")).toBe("sommeil.jpg");
    expect(articleImageFileName("Sommeil", null, "https://x.public.blob.vercel-storage.com/sites/abc/photo.PNG")).toBe("sommeil.png");
    expect(articleImageFileName("Sommeil", "", "https://fal.media/files/abc")).toBe("sommeil.jpg");
    expect(articleImageFileName("Sommeil", undefined, "data:image/svg+xml;base64,AAAA.png")).toBe("sommeil.jpg");
    expect(articleImageFileName("???", "image/png")).toBe("article.png");
    const long = articleImageFileName("mot ".repeat(40), "image/jpeg");
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[a-z0-9-]+\.jpg$/);
    expect(long).not.toContain("-.jpg");
  });
});
