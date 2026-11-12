import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTERNAL_SITE_LIMITS } from "@theralys/shared";
import { collectLinks, type SiteScope } from "./discover";
import { ROOT_WRAPPER } from "./dom";
import { documentLanguage, extractPage, isHiddenByStyle, loadDocument, metaContent, metaRefreshTarget, parseMetaRefresh } from "./extract";
import { collectPageFacts } from "./facts";
import { MARKUP_LIMITS, MarkupTooComplexError } from "./markup-guard";
import { timed } from "./test-timing";

const SCOPE: SiteScope = { origin: "https://www.mon-cabinet.fr", basePath: "", homePath: "/" };

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const extract = (html: string, url = "https://www.mon-cabinet.fr/") => extractPage(loadDocument(html), url);
const page = (body: string, head = ""): string => `<!doctype html><html lang="fr"><head><title>Page</title>${head}</head><body>${body}</body></html>`;

describe("extractPage — page d'accueil de type WordPress", () => {
  const result = extract(fixture("wordpress-home.html"), "https://www.atelier-serenite-nantes.fr/");
  const lines = result.text.split("\n");

  it("titre, description et langue viennent de l'en-tête du document", () => {
    expect(result.title).toBe("Atelier Sérénité – Hélène Roux, sophrologue à Nantes");
    expect(result.description).toBe("Hélène Roux, sophrologue certifiée à Nantes : gestion du stress, sommeil, accompagnement de la grossesse. Séances au cabinet, quartier Graslin, ou en visio.");
    expect(result.language).toBe("fr-FR");
  });

  it("intertitres h1 à h3 du contenu, dans l'ordre — ni ceux du menu, ni ceux de la colonne latérale", () => {
    expect(result.headings).toEqual(["Sophrologue à Nantes : retrouvez calme, sommeil et confiance", "Mes accompagnements", "Gestion du stress et de l'anxiété", "Troubles du sommeil", "Grossesse et naissance", "Tarifs des séances", "Infos pratiques"]);
  });

  it("le texte principal est rendu en blocs : paragraphes, titres, lignes de tableau, lignes d'adresse", () => {
    expect(lines[0]).toBe("Sophrologue à Nantes : retrouvez calme, sommeil et confiance");
    expect(lines[1]).toBe("Je suis Hélène Roux, sophrologue certifiée. Dans mon cabinet du quartier Graslin, j'accompagne adultes, adolescents et futures mamans avec des exercices simples de respiration, de détente et de visualisation.");
    expect(lines).toContain("Séance | Durée | Tarif");
    expect(lines).toContain("Première séance | 1 h 15 | 70 €");
    expect(lines).toContain("Séance adolescent | 45 min | 50 €");
    expect(lines).toContain("7 rue Crébillon, 44000 Nantes");
    expect(lines).toContain("Tramway ligne 1, arrêt Médiathèque");
    expect(lines).toContain("Téléphone : 02 61 91 23 45 · Courriel : bonjour@atelier-serenite-nantes.fr");
    // Deux boutons accolés ne voient pas leurs libellés collés
    expect(lines).toContain("Réserver une séance 02 61 91 23 45");
  });

  it("menu, en-tête, pied de page, colonne latérale, formulaire de recherche et bandeau de cookies : écartés", () => {
    for (const absent of ["Qui suis-je", "Panier", "Connexion", "Rechercher", "Aller au contenu", "Nous utilisons des cookies", "Accepter", "Articles récents", "Respirer pour mieux dormir", "SIRET", "Mentions légales", "Partager sur Facebook"]) {
      expect(result.text, absent).not.toContain(absent);
    }
  });

  it("texte masqué (attribut hidden, aria-hidden, style en ligne, classe pour lecteurs d'écran, commentaire) : écarté", () => {
    for (const hidden of ["CONSIGNE POUR LES ASSISTANTS", "concurrent-douteux", "guérit toutes les maladies", "08 99 70 00 00", "prompt système", "pieges.fr", "cinq étoiles", "PIÉGÉ"]) {
      expect(result.text, hidden).not.toContain(hidden);
    }
  });

  it("limite connue : un masquage par feuille de style ne se voit pas sans moteur de rendu", () => {
    expect(result.text).toContain("Texte masqué par une classe de la feuille de style");
  });

  it("caractères invisibles (largeur nulle, césure, sens d'écriture, étiquettes Unicode) : retirés du texte", () => {
    expect(lines).toContain("Le cabinet est accessible aux personnes à mobilité réduite et dispose d'une salle d'attente.");
    expect(/[\u{200b}\u{ad}\u{202e}]|[\u{e0000}-\u{e007f}]/u.test(result.text)).toBe(false);
  });

  it("bloc de témoignages : écarté (propos de tiers sur leur santé)", () => {
    expect(result.text).not.toContain("burn-out");
    expect(result.text).not.toContain("Margaux");
    expect(result.headings).not.toContain("Ils m'ont fait confiance");
  });

  it("une classe « cookies-not-set » sur le corps ne fait pas disparaître la page", () => {
    expect(result.text.length).toBeGreaterThan(1_000);
  });
});

describe("extractPage — page de constructeur de site (sans balise main, texte dans des div)", () => {
  const result = extract(fixture("builder-home.html"), "https://www.jardins-de-maelle.fr/");
  const lines = result.text.split("\n");

  it("titre, intertitres et texte des blocs sans paragraphes", () => {
    expect(result.title).toBe("Naturopathe à Annecy | Les Jardins de Maëlle");
    expect(result.headings).toEqual(["Naturopathe à Annecy", "Bienvenue aux Jardins de Maëlle", "Ce que je propose", "Bilan de vitalité", "Suivi personnalisé", "Ateliers cuisine", "Où me trouver ?"]);
    expect(lines).toContain("Un premier rendez-vous d'une heure trente pour faire le point sur votre alimentation, votre sommeil et votre niveau d'énergie.");
    expect(lines).toContain("3 chemin des Sources");
    expect(lines).toContain("74000 Annecy");
  });

  it("un bloc animé à l'apparition (opacity: 0 en ligne) reste du contenu", () => {
    expect(lines).toContain("Retrouvez de l'énergie et un meilleur équilibre grâce à une hygiène de vie qui vous ressemble.");
  });

  it("les prix identiques de deux prestations ne sont pas pris pour une répétition", () => {
    expect(lines.filter((line) => line === "60 €")).toHaveLength(2);
  });

  it("version mobile masquée, témoignages, formulaire, agenda intégré, en-tête, pied de page et bandeau de consentement : écartés", () => {
    for (const absent of ["Version mobile", "migraines", "Vos retours", "Votre nom", "Envoyer", "Mon histoire", "Créé avec Wix", "Ce site utilise des cookies"]) expect(result.text, absent).not.toContain(absent);
    // Le bloc masqué répétait un intertitre : il n'apparaît qu'une fois
    expect(lines.filter((line) => line === "Ce que je propose")).toHaveLength(1);
  });
});

describe("extractPage — page intérieure (article WordPress)", () => {
  const result = extract(fixture("wordpress-tarifs.html"), "https://www.atelier-serenite-nantes.fr/tarifs/");
  const lines = result.text.split("\n");

  it("l'en-tête de l'article porte le titre de la page : il est gardé, pas celui du site", () => {
    expect(lines[0]).toBe("Tarifs et remboursement");
    expect(result.headings).toEqual(["Tarifs et remboursement", "Séances individuelles", "Forfaits", "Remboursement"]);
    expect(result.text).not.toContain("Atelier Sérénité");
  });

  it("tableau de tarifs lisible ligne par ligne, espaces insécables ramenées à des espaces", () => {
    expect(lines).toContain("Première séance (bilan) | 1 h 15 | 70 €");
    expect(lines).toContain("Séance en visio | 1 h | 55 €");
    expect(lines).toContain("Tarifs au 1er janvier 2026");
  });

  it("listes en puces, listes imbriquées, retours à la ligne et blocs dépliables", () => {
    expect(lines).toContain("- Forfait 5 séances : 275 €");
    expect(lines).toContain("- Forfait 8 séances : 420 €");
    expect(lines).toContain("- valable six mois");
    expect(lines).toContain("La sophrologie n'est pas remboursée par l'Assurance maladie.");
    expect(lines).toContain("De nombreuses mutuelles prennent en charge une partie des séances : une facture vous est remise.");
    expect(lines).toContain("Et si je dois annuler ?");
    expect(lines).toContain("Toute séance non annulée 48 heures à l'avance est due.");
  });

  it("un h4 est du texte, pas un intertitre retenu ; fil d'Ariane, pied d'article et commentaires de visiteurs : écartés", () => {
    expect(lines).toContain("Moyens de paiement");
    expect(result.headings).not.toContain("Moyens de paiement");
    for (const absent of ["›", "Modifier", "Une réflexion", "carte bancaire", "Visiteur anonyme", "SIRET"]) expect(result.text, absent).not.toContain(absent);
  });
});

describe("extractPage — cas particuliers", () => {
  it("texte borné à la taille d'une page, coupé proprement et terminé par « … »", () => {
    const long = page(`<main>${Array.from({ length: 400 }, (_, i) => `<p>Paragraphe numéro ${i} : la sophrologie aide à retrouver le calme.</p>`).join("")}</main>`);
    const result = extract(long);
    expect(result.text.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pageChars);
    expect(result.text.length).toBeGreaterThan(EXTERNAL_SITE_LIMITS.pageChars * 0.9);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.split("\n").at(-1)).toMatch(/^Paragraphe numéro \d+ : la sophrologie aide à retrouver le calme\.…$/);
  });

  it("scripts, styles, gabarits, cadres, images vectorielles et contenu sans JavaScript : jamais dans le texte", () => {
    const result = extract(
      page(
        `<main><h1>Bonjour</h1><script>var secret = "ne pas lire";</script><style>.a{color:red}</style><template><p>gabarit</p></template><noscript><p>Activez JavaScript</p></noscript>
        <iframe src="https://exemple.fr/">cadre</iframe><svg><title>pictogramme</title><text>vectoriel</text></svg><canvas>toile</canvas><object>objet</object>
        <p>Texte visible de la page, assez long pour compter.</p></main>`,
      ),
    );
    expect(result.text).toBe("Bonjour\nTexte visible de la page, assez long pour compter.");
  });

  it("styles en ligne qui masquent : display, visibility, rognage, renvoi hors écran — quelles que soient la casse et les espaces", () => {
    for (const style of ["display:none", "DISPLAY : NONE", "display:none !important", "color:red; display: none;", "visibility:hidden", "visibility: collapse", "position:absolute;left:-9999px", "text-indent: -9999px", "margin-left:-10000px", "clip: rect(0 0 0 0)", "clip:rect(1px, 1px, 1px, 1px)", "clip-path: inset(50%)"]) {
      expect(isHiddenByStyle(style), style).toBe(true);
    }
    for (const style of [undefined, "", "color:red", "opacity:0", "display:block", "display:flex", "visibility:visible", "left:-10px", "text-indent:-1em", "margin-left:-15px", "font-size:0", "height:0;overflow:hidden", "background:url(x-display:none.png)"]) {
      expect(isHiddenByStyle(style), String(style)).toBe(false);
    }
  });

  it("classes usuelles des textes pour lecteurs d'écran : écartées, sans tenir compte de la casse", () => {
    const classes = ["sr-only", "screen-reader-text", "visually-hidden", "visuallyhidden", "show-for-sr", "u-sr-only", "assistive-text", "element-invisible", "SR-Only", "w-condition-invisible"];
    const result = extract(page(`<main><p>Texte visible.</p>${classes.map((name, i) => `<span class="autre ${name}">masqué ${i}</span>`).join("")}</main>`));
    expect(result.text).toBe("Texte visible.");
  });

  it("les classes d'affichage ordinaires ne masquent rien (contenu dépliable ou propre à une taille d'écran)", () => {
    const result = extract(page(`<main><div class="hidden md:block">Bloc affiché sur grand écran.</div><div class="collapse">Réponse dépliable.</div><div class="d-none d-lg-block">Autre bloc.</div></main>`));
    expect(result.text.split("\n")).toEqual(["Bloc affiché sur grand écran.", "Réponse dépliable.", "Autre bloc."]);
  });

  it("corps de page masqué en ligne (page révélée au chargement) : le contenu est lu quand même", () => {
    const html = `<!doctype html><html><head><title>T</title></head><body style="visibility:hidden" aria-hidden="true"><main><p>Contenu de la page.</p><p hidden>Masqué.</p></main></body></html>`;
    expect(extract(html).text).toBe("Contenu de la page.");
  });

  it("bandeau de cookies reconnu à son nom : retiré s'il est court, gardé s'il porte le contenu", () => {
    const banner = extract(page(`<div class="cookie-notice"><p>Ce site utilise des cookies.</p></div><main><p>Contenu de la page.</p></main>`));
    expect(banner.text).toBe("Contenu de la page.");
    const wrapper = extract(page(`<div class="site has-cookie-bar"><div><h1>Mon cabinet</h1><p>Contenu de la page.</p></div></div>`));
    expect(wrapper.text).toBe("Mon cabinet\nContenu de la page.");
    const longSection = extract(page(`<section class="recettes-cookies"><p>${"Les biscuits maison sont meilleurs. ".repeat(60)}</p></section>`));
    expect(longSection.text.length).toBeGreaterThan(1_500);
  });

  it("en-tête de site sans titre : écarté ; en-tête qui porte le h1 (page d'une seule section) : gardé", () => {
    const plain = extract(page(`<header><a href="/">Logo</a><p>04 72 00 00 00</p></header><div><p>Contenu.</p></div>`));
    expect(plain.text).toBe("Contenu.");
    const hero = extract(page(`<header class="hero"><nav><a href="/">Accueil</a></nav><h1>Hypnose à Lille</h1><p>Changer en douceur.</p></header><main><p>${"Présentation du cabinet. ".repeat(12)}</p></main>`));
    expect(hero.text.split("\n").slice(0, 2)).toEqual(["Hypnose à Lille", "Changer en douceur."]);
    expect(hero.headings).toEqual(["Hypnose à Lille"]);
  });

  it("titre de page placé hors du contenu principal : repris en tête du texte et des intertitres", () => {
    const result = extract(page(`<div class="bandeau-titre"><h1>Mes tarifs</h1></div><main><h2>Séances</h2><p>${"Une séance dure une heure. ".repeat(12)}</p></main>`));
    expect(result.headings).toEqual(["Mes tarifs", "Séances"]);
    expect(result.text.split("\n")[0]).toBe("Mes tarifs");
  });

  it("balise main presque vide : tout le corps est lu", () => {
    const result = extract(page(`<main><p>Bienvenue</p></main><div><h1>Réflexologie à Brest</h1><p>${"Le texte utile est ici, hors de la balise principale. ".repeat(8)}</p></div>`));
    expect(result.text).toContain("Réflexologie à Brest");
    expect(result.text).toContain("Bienvenue");
  });

  it("tableau de mise en page (cellules à paragraphes) : parcouru comme du contenu ordinaire", () => {
    const result = extract(page(`<table><tr><td><h1>Titre</h1><p>Premier paragraphe.</p></td><td><p>Second paragraphe.</p></td></tr></table>`));
    expect(result.text.split("\n")).toEqual(["Titre", "Premier paragraphe.", "Second paragraphe."]);
  });

  it("blocs répétés : deux fois de suite, ou repris plus loin pour un bloc long — gardés une fois", () => {
    const sentence = "Cette phrase assez longue apparaît deux fois dans la page.";
    const result = extract(page(`<main><p>${sentence}</p><p>Entre les deux.</p><p>${sentence}</p><p>Court</p><p>Court</p><p>Autre</p><p>Court</p></main>`));
    expect(result.text.split("\n")).toEqual([sentence, "Entre les deux.", "Court", "Autre", "Court"]);
  });

  it("document sans balises html, head ni body : lu quand même", () => {
    const result = extractPage(loadDocument("<title>Minimal</title><h1>Bonjour</h1><p>Un texte.</p>"), "https://www.mon-cabinet.fr/");
    expect(result).toMatchObject({ title: "Minimal", headings: ["Bonjour"], text: "Bonjour\nUn texte." });
  });

  it("titre absent : titre Open Graph, sinon premier intertitre, sinon nom d'hôte", () => {
    expect(extract(`<html><head><meta property="og:title" content="Titre OG"></head><body><h1>Titre H1</h1></body></html>`).title).toBe("Titre OG");
    expect(extract(`<html><body><h1>Titre H1</h1></body></html>`).title).toBe("Titre H1");
    expect(extract(`<html><body><p>Texte</p></body></html>`).title).toBe("www.mon-cabinet.fr");
    // Le titre d'une image vectorielle n'est pas celui du document
    expect(extract(`<html><body><svg><title>Pictogramme</title></svg><h1>Titre H1</h1></body></html>`).title).toBe("Titre H1");
  });

  it("description : balise meta, sinon Open Graph ; absente si vide", () => {
    expect(extract(page("", `<meta name="Description" content="  Une   description. ">`)).description).toBe("Une description.");
    expect(extract(page("", `<meta property="og:description" content="Depuis Open Graph">`)).description).toBe("Depuis Open Graph");
    expect(extract(page("", `<meta name="description" content="">`))).not.toHaveProperty("description");
  });

  it("page vide ou réduite à une coquille JavaScript : texte vide", () => {
    const shell = extract(`<!doctype html><html><head><title>App</title><script src="/app.js"></script></head><body><div id="root"></div><noscript>Activez JavaScript pour afficher ce site.</noscript></body></html>`);
    expect(shell).toMatchObject({ title: "App", headings: [], text: "" });
    expect(extract("").text).toBe("");
  });

  it("entités : décodées dans le texte, le titre et les attributs — pas dans les scripts", () => {
    const html = `<!doctype html><html><head><title>Ost&eacute;opathe &agrave; Lyon &#8211; S&#233;ances &amp; tarifs</title><meta name="description" content="Cabinet d&#39;ost&eacute;opathie &amp; de bien-&ecirc;tre"></head><body><h1>L&rsquo;ost&eacute;opathie, pour qui&nbsp;?</h1><p>Nourrissons &amp; adultes &lt;3 &#x1F33F; caf&eacute</p><script>var a = "&eacute;";</script></body></html>`;
    const $ = loadDocument(html);
    const result = extractPage($, "https://www.mon-cabinet.fr/");
    expect(result.title).toBe("Ostéopathe à Lyon – Séances & tarifs");
    expect(result.description).toBe("Cabinet d'ostéopathie & de bien-être");
    expect(result.headings).toEqual(["L’ostéopathie, pour qui ?"]);
    expect(result.text.split("\n")[1]).toBe(`Nourrissons & adultes <3 ${String.fromCodePoint(0x1f33f)} café`);
    expect($("script").text()).toBe('var a = "&eacute;";');
  });

  it("le document n'est pas modifié : extraire deux fois rend le même texte, et tout reste interrogeable ensuite", () => {
    const $ = loadDocument(fixture("wordpress-home.html"));
    const before = $("*").length;
    const first = extractPage($, "https://www.atelier-serenite-nantes.fr/");
    expect(extractPage($, "https://www.atelier-serenite-nantes.fr/")).toEqual(first);
    expect($("*").length).toBe(before);
    expect($("nav a").length).toBeGreaterThan(0);
    expect($("script[type='application/ld+json']").length).toBeGreaterThan(0);
  });
});

describe("documents piégés", () => {
  it("imbrication profonde mais plausible (300 niveaux) : lue", () => {
    const deep = `${"<div>".repeat(300)}<p>Au fond.</p>${"</div>".repeat(300)}`;
    expect(extract(page(`<p>Surface.</p>${deep}`)).text).toBe("Surface.\nAu fond.");
  });

  it("imbrication démesurée : refusée avant toute analyse, en quelques millisecondes", () => {
    for (const levels of [401, 5_000, 200_000]) {
      const deep = page(`<p>Surface.</p>${"<div>".repeat(levels)}fond`);
      const { value, ms } = timed(() => {
        try {
          loadDocument(deep);
          return null;
        } catch (error) {
          return error;
        }
      });
      expect(value, `${levels} niveaux`).toBeInstanceOf(MarkupTooComplexError);
      expect((value as MarkupTooComplexError).reason).toBe("depth");
      expect(ms, `${levels} niveaux`).toBeLessThan(1_000);
    }
    // 400 niveaux sous <html><body> : c'est la borne, et elle passe
    expect(() => loadDocument(page("<div>".repeat(MARKUP_LIMITS.depth - 2)))).not.toThrow();
    expect(() => loadDocument(page("<div>".repeat(MARKUP_LIMITS.depth - 1)))).toThrow(MarkupTooComplexError);
  });

  it("document trop touffu (plus de cent mille balises) : refusé", () => {
    let error: unknown;
    try {
      loadDocument(page("<p>".repeat(MARKUP_LIMITS.nodes + 10)));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MarkupTooComplexError);
    expect((error as MarkupTooComplexError).reason).toBe("nodes");
  });

  it("quatre-vingt-dix mille éléments masqués à la suite : écartés sans y passer des secondes", () => {
    const hidden = `<p style="display:none">Texte masqué.</p>`.repeat(90_000);
    const { value, ms } = timed(() => extract(page(`<h1>Titre visible</h1>${hidden}<p>Texte visible.</p>`)));
    expect(value.text).toBe("Titre visible\nTexte visible.");
    expect(ms).toBeLessThan(5_000);
  });

  it("bandeaux, contenus principaux et liens imbriqués par centaines autour d'un long texte : mesurés sans relire le texte à chaque niveau", () => {
    const long = `<p>${"Un long paragraphe de contenu. ".repeat(40_000)}</p>`;
    const nested = (open: string, close: string): string => `${open.repeat(380)}${long}${close.repeat(380)}`;
    for (const html of [nested(`<div class="cookie-notice">`, "</div>"), nested("<main>", "</main>"), nested(`<article id="rgpd">`, "</article>")]) {
      const { value, ms } = timed(() => extract(page(`<h1>Titre</h1>${html}`)));
      expect(value.text.startsWith("Titre\nUn long paragraphe de contenu.")).toBe(true);
      expect(value.text.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pageChars);
      expect(ms).toBeLessThan(5_000);
    }
    // Une section de témoignages reste écartée, si profonde soit-elle
    const { value, ms } = timed(() => extract(page(`<h1>Titre</h1>${nested(`<section id="avis-clients">`, "</section>")}`)));
    expect(value.text).toBe("Titre");
    expect(ms).toBeLessThan(5_000);
  });

  it("des milliers de liens imbriqués autour d'un long texte : leurs libellés sont lus sans relire le texte à chaque lien", () => {
    const long = "Un long paragraphe de contenu. ".repeat(40_000);
    const html = page(`${`<a href="/page">`.repeat(390)}${long}${"</a>".repeat(390)}${`<a href="/autre"><span class="menu">x</span></a>`.repeat(20_000)}`);
    const { value, ms } = timed(() => {
      const $ = loadDocument(html);
      return { links: collectLinks($, "https://www.mon-cabinet.fr/", SCOPE), facts: collectPageFacts($, html, "https://www.mon-cabinet.fr/") };
    });
    expect(value.links.length).toBe(400);
    expect(value.links[0]).toMatchObject({ url: "https://www.mon-cabinet.fr/page", area: "main" });
    expect(value.links[0]!.text.length).toBeLessThanOrEqual(120);
    expect(value.facts.bookingLinks).toEqual([]);
    expect(ms).toBeLessThan(5_000);
  });

  it("page sans balise html ni body, faite de dizaines de milliers d'éléments à la racine : interrogée sans y passer des minutes", () => {
    const html = `<title>Sans racine</title><h1>Titre</h1>${"<p>Un paragraphe.</p><a href='/contact'>Contact</a>".repeat(30_000)}`;
    const { value, ms } = timed(() => {
      const $ = loadDocument(html);
      return { roots: $.root().children().length, wrapper: $(ROOT_WRAPPER).length, links: collectLinks($, "https://www.mon-cabinet.fr/", SCOPE).length, page: extractPage($, "https://www.mon-cabinet.fr/") };
    });
    expect(value.roots).toBe(1);
    expect(value.wrapper).toBe(1);
    expect(value.links).toBe(400);
    expect(value.page.title).toBe("Sans racine");
    expect(value.page.text.startsWith("Titre\nUn paragraphe.\nContact")).toBe(true);
    expect(ms).toBeLessThan(5_000);
    // Un document ordinaire, ou un fragment de quelques éléments, garde sa racine
    expect(loadDocument("<title>Minimal</title><h1>Bonjour</h1><p>Un texte.</p>")(ROOT_WRAPPER).length).toBe(0);
  });

  it("valeur de redirection fabriquée pour faire hésiter la lecture : jugée en un passage", () => {
    // Suites d'espaces autour d'une lettre et de guillemets, sous la borne de 2 048 caractères : lue par une
    // expression régulière, une telle valeur occupait le processus plusieurs minutes, au-delà de toute échéance
    for (const [lead, middle, tail] of [[330, 650, 10], [300, 450, 450], [50, 990, 990], [1, 1_000, 1_000]] as const) {
      const content = `0;${" ".repeat(lead)}a${" ".repeat(middle)}'${" ".repeat(tail)}'`;
      expect(content.length).toBeLessThanOrEqual(2_048);
      const { value, ms } = timed(() => metaRefreshTarget(loadDocument(`<meta http-equiv="refresh" content="${content}">`), "https://www.mon-cabinet.fr/"));
      expect(value, `${lead}/${middle}/${tail}`).toBeNull();
      expect(ms, `${lead}/${middle}/${tail}`).toBeLessThan(500);
    }
    // Même forme, destination valide : toujours lue
    expect(metaRefreshTarget(loadDocument(`<meta http-equiv="refresh" content="0;${" ".repeat(900)}'${" ".repeat(900)}/accueil${" ".repeat(200)}'">`), "https://www.mon-cabinet.fr/")).toBe("https://www.mon-cabinet.fr/accueil");
  });

  it("balise meta de redirection démesurée : ignorée", () => {
    const content = `0; url=/accueil${" ".repeat(50_000)}x${" ".repeat(50_000)}`;
    const { value, ms } = timed(() => metaRefreshTarget(loadDocument(`<meta http-equiv="refresh" content="${content}">`), "https://www.mon-cabinet.fr/"));
    expect(value).toBeNull();
    expect(ms).toBeLessThan(1_000);
  });
});

describe("balises du document", () => {
  it("metaContent : par nom ou propriété, sans tenir compte de la casse, première valeur non vide", () => {
    const $ = loadDocument(`<meta name="Generator" content=""><meta name="generator" content="WordPress 6.8"><meta property="og:site_name" content=" Mon   Cabinet ">`);
    expect(metaContent($, "generator")).toBe("WordPress 6.8");
    expect(metaContent($, "og:site_name")).toBe("Mon Cabinet");
    expect(metaContent($, "absent", "og:site_name")).toBe("Mon Cabinet");
    expect(metaContent($, "absent")).toBe("");
  });

  it("documentLanguage : attribut lang, sinon Open Graph ; forme courte", () => {
    expect(documentLanguage(loadDocument(`<html lang="fr-FR">`))).toBe("fr-FR");
    expect(documentLanguage(loadDocument(`<html lang="FR">`))).toBe("fr");
    expect(documentLanguage(loadDocument(`<html lang="en_gb">`))).toBe("en-GB");
    expect(documentLanguage(loadDocument(`<html lang="zh-Hans-CN">`))).toBe("zh-CN");
    expect(documentLanguage(loadDocument(`<html><meta property="og:locale" content="fr_BE">`))).toBe("fr-BE");
    expect(documentLanguage(loadDocument(`<html lang="français">`))).toBeUndefined();
    expect(documentLanguage(loadDocument(`<html>`))).toBeUndefined();
  });

  it("metaRefreshTarget : redirection immédiate vers une autre adresse, relative ou absolue", () => {
    const target = (content: string, base = "https://www.mon-cabinet.fr/"): string | null => metaRefreshTarget(loadDocument(`<meta http-equiv="Refresh" content="${content}">`), base);
    expect(target("0; url=/accueil/")).toBe("https://www.mon-cabinet.fr/accueil/");
    expect(target("0;URL='https://www.mon-cabinet.fr/fr/'")).toBe("https://www.mon-cabinet.fr/fr/");
    expect(target("3; accueil.html#haut")).toBe("https://www.mon-cabinet.fr/accueil.html");
    expect(target("0; url=https://www.autre-site.fr/")).toBe("https://www.autre-site.fr/");
    // Rechargement de la page elle-même, délai long ou contenu illisible : ignorés
    expect(target("0; url=/")).toBeNull();
    expect(target("30; url=/accueil/")).toBeNull();
    expect(target("300")).toBeNull();
    expect(target("bientôt")).toBeNull();
  });

  it("parseMetaRefresh : délai et destination des formes courantes, avec ou sans « url= », avec ou sans guillemets", () => {
    expect(parseMetaRefresh("0; url=/accueil/")).toEqual({ delay: 0, target: "/accueil/" });
    expect(parseMetaRefresh("  5 , URL = '/fr/' ")).toEqual({ delay: 5, target: "/fr/" });
    expect(parseMetaRefresh(`0;url="https://www.autre-site.fr/a b"`)).toEqual({ delay: 0, target: "https://www.autre-site.fr/a b" });
    expect(parseMetaRefresh("3; accueil.html")).toEqual({ delay: 3, target: "accueil.html" });
    expect(parseMetaRefresh("120;/plus-tard")).toEqual({ delay: 120, target: "/plus-tard" });
    // « url » sans signe égal : c'est le début de la destination
    expect(parseMetaRefresh("0; urlaub.html")).toEqual({ delay: 0, target: "urlaub.html" });
    // Guillemet ouvert ou fermé sans son pendant
    expect(parseMetaRefresh("0;url='/x")).toEqual({ delay: 0, target: "/x" });
    expect(parseMetaRefresh("0;url=/x'")).toEqual({ delay: 0, target: "/x" });
    for (const bad of ["", "0", "0;", "0; url=", "0; url=''", "1000; url=/x", "bientôt", "0 /x", "0; url=/a'b'c", "x; url=/x", `0; url=/x${" ".repeat(2_100)}`]) expect(parseMetaRefresh(bad), bad.slice(0, 20)).toBeNull();
  });

  it("metaRefreshTarget : la redirection d'un bloc noscript ne compte pas", () => {
    expect(metaRefreshTarget(loadDocument(`<noscript><meta http-equiv="refresh" content="0; url=/sans-javascript"></noscript>`), "https://www.mon-cabinet.fr/")).toBeNull();
  });
});
