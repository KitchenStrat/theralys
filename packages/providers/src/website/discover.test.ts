import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTERNAL_PAGE_KINDS, type ExternalPageKind } from "@theralys/shared";
import { classifyPage, collectLinks, isInScope, pageKey, parseSitemap, pickChildSitemaps, planPages, toCandidates, type PageLink, type SiteScope } from "./discover";
import { loadDocument } from "./extract";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const ORIGIN = "https://www.mon-cabinet.fr";
const ROOT: SiteScope = { origin: ORIGIN, basePath: "", homePath: "/" };
const kindOf = (path: string, text = "", scope: SiteScope = ROOT): string => {
  const { kind, skip } = classifyPage(new URL(path, scope.origin), text, scope);
  return skip ? `écartée (${kind})` : kind;
};
const link = (path: string, text = "", area: PageLink["area"] = "nav"): PageLink => ({ url: new URL(path, ORIGIN).href, text, area });
const paths = (items: readonly { url: string }[]): string[] => items.map((item) => new URL(item.url).pathname);

describe("classifyPage — nature d'une page", () => {
  it("à propos, en français et en anglais", () => {
    for (const path of ["/a-propos", "/a-propos/", "/qui-suis-je", "/qui-sommes-nous/", "/presentation", "/mon-parcours", "/about", "/about-me", "/about-us.html", "/mon-approche", "/l-equipe", "/À-propos"]) expect(kindOf(path), path).toBe("about");
  });

  it("spécialités : disciplines et motifs de consultation, ou page rangée sous une rubrique de prestations", () => {
    for (const path of ["/sophrologie", "/hypnose-ericksonienne", "/naturopathie-lyon", "/massage-californien", "/reflexologie-plantaire/", "/gestion-du-stress", "/troubles-du-sommeil", "/arret-du-tabac", "/sophrologie-pour-enfants", "/accompagnement-grossesse", "/burn-out"]) {
      expect(kindOf(path), path).toBe("specialty");
    }
    for (const path of ["/prestations/bilan-initial", "/soins/visage", "/accompagnements/particuliers/", "/seances/en-groupe"]) expect(kindOf(path), path).toBe("specialty");
  });

  it("prestations : la page qui les présente toutes", () => {
    for (const path of ["/prestations", "/mes-prestations/", "/services", "/seances", "/accompagnements", "/soins", "/mes-specialites", "/consultations", "/ateliers", "/deroulement-d-une-seance", "/pour-qui"]) expect(kindOf(path), path).toBe("services");
  });

  it("tarifs, contact et accès, rendez-vous, questions fréquentes, blog", () => {
    for (const path of ["/tarifs", "/tarif", "/prix", "/honoraires", "/pricing", "/seances-et-tarifs", "/tarifs-et-remboursement"]) expect(kindOf(path), path).toBe("pricing");
    for (const path of ["/contact", "/me-contacter", "/contactez-moi", "/acces", "/plan-d-acces", "/infos-pratiques", "/horaires", "/contact-et-rendez-vous", "/ou-me-trouver"]) expect(kindOf(path), path).toBe("contact");
    for (const path of ["/rendez-vous", "/prendre-rendez-vous", "/rdv", "/reservation", "/reserver", "/booking", "/book-online"]) expect(kindOf(path), path).toBe("booking");
    for (const path of ["/faq", "/questions-frequentes", "/foire-aux-questions", "/vos-questions"]) expect(kindOf(path), path).toBe("faq");
    for (const path of ["/blog", "/blog/", "/le-blog", "/actualites", "/articles", "/news"]) expect(kindOf(path), path).toBe("blog");
  });

  it("adresse muette : le texte du lien décide ; adresse parlante : elle prime sur un texte passe-partout", () => {
    expect(kindOf("/blank-3", "Tarifs")).toBe("pricing");
    expect(kindOf("/page-2", "Qui suis-je ?")).toBe("about");
    expect(kindOf("/general-5", "Séances de sophrologie")).toBe("specialty");
    expect(kindOf("/copie-de-accueil", "Me contacter")).toBe("contact");
    expect(kindOf("/p-4", "Prendre RDV")).toBe("booking");
    expect(kindOf("/sophrologie", "En savoir plus")).toBe("specialty");
    expect(kindOf("/tarifs", "Découvrir")).toBe("pricing");
    expect(kindOf("/sophrologie/en-savoir-plus", "Lire la suite")).toBe("specialty");
    expect(kindOf("/le-lieu", "Le lieu")).toBe("other");
    expect(kindOf("/x7g2", "")).toBe("other");
  });

  it("page d'accueil : la racine, la page servie, et ses autres noms", () => {
    for (const path of ["/", "", "/index.html", "/index.php", "/accueil", "/home"]) expect(kindOf(path), path).toBe("home");
    expect(kindOf("/accueil/", "", { origin: ORIGIN, basePath: "", homePath: "/accueil/" })).toBe("home");
    expect(kindOf("/bienvenue-au-cabinet/", "", { origin: ORIGIN, basePath: "", homePath: "/bienvenue-au-cabinet/" })).toBe("home");
  });

  it("pages légales, articles et témoignages : reconnus, et écartés de la lecture", () => {
    for (const path of ["/mentions-legales", "/mentions-legales/", "/cgv", "/cgu", "/politique-de-confidentialite", "/confidentialite", "/privacy-policy", "/cookies", "/rgpd", "/conditions-generales-de-vente", "/plan-du-site", "/legal"]) expect(kindOf(path), path).toBe("écartée (legal)");
    expect(kindOf("/page-9", "Mentions légales")).toBe("écartée (legal)");
    for (const path of ["/blog/5-exercices-de-respiration", "/actualites/portes-ouvertes/", "/2025/11/sophrologie-et-sommeil/", "/blog/2024/03/un-article"]) expect(kindOf(path), path).toBe("écartée (article)");
    for (const path of ["/temoignages", "/avis", "/avis-clients/", "/livre-d-or", "/testimonials", "/reviews"]) expect(kindOf(path), path).toBe("écartée (other)");
    expect(kindOf("/page-7", "Témoignages")).toBe("écartée (other)");
  });

  it("panier, compte, recherche, flux, archives, pages paginées, fichiers, adresses à paramètres : écartés", () => {
    const skipped = [
      "/panier", "/cart", "/checkout", "/commande", "/mon-compte", "/my-account/orders", "/connexion", "/login", "/wp-login.php", "/wp-admin/", "/recherche", "/search", "/feed", "/feed/", "/blog/feed/", "/rss", "/merci", "/newsletter",
      "/tag/stress", "/tags/sommeil", "/category/conseils/", "/categorie/actualites", "/author/helene", "/archives/2024",
      "/blog/page/2", "/page/3/", "/actualites/p/4",
      "/plaquette.pdf", "/photo.JPG", "/images/cabinet.webp", "/tarifs.docx", "/sitemap.xml", "/flux.rss", "/agenda.ics", "/contact.vcf", "/video.mp4", "/style.css", "/app.js",
      "/wp-content/uploads/2025/01/affiche.png", "/wp-json/wp/v2/pages", "/cdn-cgi/l/email-protection", "/xmlrpc.php",
      "/tarifs?lang=en", "/?page_id=12", "/index.php?page=tarifs", "/contact?utm_source=x",
    ];
    for (const path of skipped) expect(kindOf(path), path).toMatch(/^écartée/);
  });

  it("un mot courant n'écarte pas une vraie page (« prise en compte », « la recherche en sophrologie »)", () => {
    expect(kindOf("/prise-en-compte-du-stress")).toBe("specialty");
    expect(kindOf("/la-recherche-en-sophrologie")).toBe("specialty");
    expect(kindOf("/accompagnement-sur-commande")).toBe("services");
  });

  it("hors du site, hors du chemin de base, autre protocole : écartés", () => {
    expect(classifyPage(new URL("https://www.autre-site.fr/tarifs"), "Tarifs", ROOT)).toEqual({ kind: "other", skip: true });
    expect(classifyPage(new URL("mailto:contact@mon-cabinet.fr"), "", ROOT).skip).toBe(true);
    const sub: SiteScope = { origin: "https://www.plateforme.fr", basePath: "/mon-cabinet", homePath: "/mon-cabinet/" };
    expect(kindOf("/mon-cabinet", "", sub)).toBe("home");
    expect(kindOf("/mon-cabinet/tarifs", "", sub)).toBe("pricing");
    expect(kindOf("/mon-cabinet/soins/massage", "", sub)).toBe("specialty");
    expect(kindOf("/tarifs", "Tarifs de la plateforme", sub)).toMatch(/^écartée/);
    expect(kindOf("/mon-cabinet-voisin/tarifs", "", sub)).toMatch(/^écartée/);
    expect(kindOf("/autre-cabinet", "", sub)).toMatch(/^écartée/);
  });

  it("le site est le même avec ou sans « www. »", () => {
    expect(classifyPage(new URL("https://mon-cabinet.fr/tarifs"), "", ROOT)).toEqual({ kind: "pricing", skip: false });
    expect(classifyPage(new URL("https://blog.mon-cabinet.fr/tarifs"), "", ROOT).skip).toBe(true);
  });

  it("toute nature rendue appartient au contrat", () => {
    for (const path of ["/", "/a-propos", "/sophrologie", "/prestations", "/tarifs", "/contact", "/rdv", "/faq", "/blog", "/blog/article", "/cgv", "/divers"]) {
      expect(EXTERNAL_PAGE_KINDS as readonly string[]).toContain(classifyPage(new URL(path, ORIGIN), "", ROOT).kind);
    }
  });
});

describe("adresses", () => {
  it("pageKey : même clé pour les écritures d'une même page", () => {
    const keys = ["https://www.mon-cabinet.fr/tarifs", "https://mon-cabinet.fr/tarifs/", "https://MON-CABINET.fr/tarifs/index.html", "https://www.mon-cabinet.fr//tarifs#seances", "https://www.mon-cabinet.fr/tarifs/index.php"].map((url) => pageKey(new URL(url)));
    expect(new Set(keys)).toEqual(new Set(["mon-cabinet.fr/tarifs"]));
    expect(pageKey(new URL("https://www.mon-cabinet.fr/"))).toBe("mon-cabinet.fr");
    expect(pageKey(new URL("https://www.mon-cabinet.fr/index.html"))).toBe("mon-cabinet.fr");
    expect(pageKey(new URL("https://www.mon-cabinet.fr/s%C3%A9ances"))).toBe(pageKey(new URL("https://www.mon-cabinet.fr/séances")));
    expect(pageKey(new URL("https://www.mon-cabinet.fr/Tarifs"))).not.toBe(pageKey(new URL("https://www.mon-cabinet.fr/tarifs")));
  });

  it("isInScope : même site et, s'il y en a un, chemin de base", () => {
    const sub: SiteScope = { origin: "https://sites.google.com", basePath: "/view/mon-cabinet", homePath: "/view/mon-cabinet/accueil" };
    expect(isInScope(new URL("https://sites.google.com/view/mon-cabinet"), sub)).toBe(true);
    expect(isInScope(new URL("https://sites.google.com/view/mon-cabinet/tarifs"), sub)).toBe(true);
    expect(isInScope(new URL("https://sites.google.com/view/mon-cabinet-bis"), sub)).toBe(false);
    expect(isInScope(new URL("https://sites.google.com/view/autre"), sub)).toBe(false);
    expect(isInScope(new URL("https://www.mon-cabinet.fr/x"), ROOT)).toBe(true);
    expect(isInScope(new URL("https://mon-cabinet.fr.pirate.fr/x"), ROOT)).toBe(false);
  });
});

describe("collectLinks", () => {
  it("page de type WordPress : liens du site seulement, sans ancre, dans l'ordre, avec leur emplacement", () => {
    const scope: SiteScope = { origin: "https://www.atelier-serenite-nantes.fr", basePath: "", homePath: "/" };
    const links = collectLinks(loadDocument(fixture("wordpress-home.html")), "https://www.atelier-serenite-nantes.fr/", scope);
    expect(links.every((item) => item.url.startsWith("https://www.atelier-serenite-nantes.fr/"))).toBe(true);
    expect(links.find((item) => item.url.endsWith("/qui-suis-je/"))).toEqual({ url: "https://www.atelier-serenite-nantes.fr/qui-suis-je/", text: "Qui suis-je ?", area: "nav" });
    expect(links.find((item) => item.url.endsWith("/questions-frequentes/"))).toMatchObject({ text: "foire aux questions", area: "main" });
    expect(links.find((item) => item.url.endsWith("/mentions-legales/"))).toMatchObject({ area: "footer" });
    // Lien de logo sans texte : le texte de remplacement de l'image sert de libellé
    expect(links[0]).toEqual({ url: "https://www.atelier-serenite-nantes.fr/", text: "Atelier Sérénité", area: "nav" });
    // Jamais : autres sites, tel:, mailto:, lien marqué nofollow ou masqué
    const all = links.map((item) => item.url).join(" ");
    for (const absent of ["resalib", "instagram", "facebook", "tel:", "mailto:", "piege-a-robots"]) expect(all, absent).not.toContain(absent);
  });

  it("adresses relatives, balise base, autre écriture de l'hôte : ramenées sur l'origine du site", () => {
    const html = `<base href="/fr/"><a href="tarifs">Tarifs</a><a href="../contact#plan">Contact</a><a href="//mon-cabinet.fr/a-propos">À propos</a><a href="http://www.mon-cabinet.fr/blog/">Blog</a><a href="https://www.mon-cabinet.fr/soins?x=1">Soins</a>`;
    expect(collectLinks(loadDocument(html), `${ORIGIN}/fr/accueil`, ROOT).map((item) => item.url)).toEqual([`${ORIGIN}/fr/tarifs`, `${ORIGIN}/contact`, `${ORIGIN}/a-propos`, `${ORIGIN}/blog/`, `${ORIGIN}/soins?x=1`]);
  });

  it("liens à ne pas suivre : ancres, scripts, téléchargements, nofollow, liens masqués, adresses illisibles", () => {
    const html = `<a href="#haut">Haut</a><a href="javascript:void(0)">Menu</a><a href="">vide</a><a>sans adresse</a><a href="/plaquette" download>Plaquette</a><a href="/prive" rel="noopener NoFollow">Privé</a>
      <a href="/piege" style="display: none">Piège</a><a href="/piege-2" hidden>Piège</a><a href="http://[">cassé</a><a href="sms:+33639980000">SMS</a><a href="/visible">Visible</a>`;
    expect(paths(collectLinks(loadDocument(html), `${ORIGIN}/`, ROOT))).toEqual(["/visible"]);
  });

  it("site hébergé sous un chemin : seuls les liens sous ce chemin sont gardés", () => {
    const scope: SiteScope = { origin: "https://www.plateforme.fr", basePath: "/mon-cabinet", homePath: "/mon-cabinet" };
    const html = `<a href="/mon-cabinet/tarifs">Tarifs</a><a href="/autre-cabinet">Un confrère</a><a href="/">La plateforme</a><a href="contact">Contact</a>`;
    expect(paths(collectLinks(loadDocument(html), "https://www.plateforme.fr/mon-cabinet/", scope))).toEqual(["/mon-cabinet/tarifs", "/mon-cabinet/contact"]);
  });

  it("le nombre de liens relevés est borné", () => {
    const html = Array.from({ length: 1_000 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join("");
    expect(collectLinks(loadDocument(html), `${ORIGIN}/`, ROOT)).toHaveLength(400);
  });

  it("emplacement d'un lien : pied de page d'abord, sinon menu ou en-tête, sinon corps — d'après tous ses ancêtres", () => {
    const html = `<body>
      <header><a href="/a">A</a><div><span><a href="/b">B</a></span></div></header>
      <div class="navbar sticky"><a href="/c">C</a></div><ul class="menu"><li><a href="/d">D</a></li></ul><div role="navigation"><a href="/e">E</a></div><div role="banner"><a href="/f">F</a></div>
      <main><a href="/g">G</a><div class="menus"><a href="/h">H</a></div><div class="Menu"><a href="/i">I</a></div></main>
      <footer><nav><a href="/j">J</a></nav></footer><div role="contentinfo"><a href="/k">K</a></div><nav><footer><a href="/l">L</a></footer><a href="/m">M</a></nav>
    </body>`;
    const areas = Object.fromEntries(collectLinks(loadDocument(html), `${ORIGIN}/`, ROOT).map((item) => [new URL(item.url).pathname, item.area]));
    expect(areas).toEqual({ "/a": "nav", "/b": "nav", "/c": "nav", "/d": "nav", "/e": "nav", "/f": "nav", "/g": "main", "/h": "main", "/i": "main", "/j": "footer", "/k": "footer", "/l": "footer", "/m": "nav" });
  });

  it("libellé d'un lien : son texte, borné ; sinon son intitulé accessible, son titre ou le texte de remplacement de son image", () => {
    const html = `<a href="/a">  Un   <b>libellé</b>\n réparti </a><a href="/b" aria-label="Intitulé"><svg></svg></a><a href="/c" title="Titre"></a><a href="/d"><span><img src="x.png" alt="Image"></span></a><a href="/e"><img src="y.png"></a><a href="/f">${"mot ".repeat(5_000)}</a>`;
    const links = collectLinks(loadDocument(html), `${ORIGIN}/`, ROOT);
    expect(links.slice(0, 5).map((item) => item.text)).toEqual(["Un libellé réparti", "Intitulé", "Titre", "Image", ""]);
    expect(links[5]!.text.length).toBeLessThanOrEqual(120);
    expect(links[5]!.text.startsWith("mot mot mot")).toBe(true);
  });

  it("page piégée : adresses démesurées ignorées, liens examinés en nombre borné, sans y passer des secondes", () => {
    const long = `<a href="/${"x".repeat(3_000)}">Trop longue</a>`;
    const offsite = `<a href="https://www.autre-site.fr/page">Ailleurs</a>`.repeat(20_000);
    const start = performance.now();
    const links = collectLinks(loadDocument(`${long}<a href="/avant">Avant</a>${offsite}<a href="/apres">Après</a>`), `${ORIGIN}/`, ROOT);
    expect(performance.now() - start).toBeLessThan(5_000);
    // Le lien placé après vingt mille liens vers un autre site n'est pas examiné : une vraie page n'en compte pas tant
    expect(paths(links)).toEqual(["/avant"]);
    // Balise base démesurée : ignorée, les liens sont résolus par rapport à la page
    const based = `<base href="/${"x".repeat(1_000_000)}/">${`<a href="tarifs">Tarifs</a>`.repeat(4_000)}`;
    const again = performance.now();
    expect(paths(collectLinks(loadDocument(based), `${ORIGIN}/fr/`, ROOT))[0]).toBe("/fr/tarifs");
    expect(performance.now() - again).toBeLessThan(3_000);
  });
});

describe("toCandidates et planPages — choix des pages", () => {
  it("une page citée plusieurs fois n'est candidate qu'une fois, avec son classement le plus parlant et son emplacement le plus en vue", () => {
    const candidates = toCandidates([link("/page-3", "En savoir plus", "footer"), link("/page-3/", "Tarifs", "main"), link("/page-3#grille", "Voir", "nav"), link("https://mon-cabinet.fr/page-3/index.html", "")], ROOT);
    expect(candidates).toEqual([{ url: `${ORIGIN}/page-3`, key: "mon-cabinet.fr/page-3", kind: "pricing", area: "nav", order: 0 }]);
  });

  it("la page d'accueil, les pages déjà connues et les pages écartées ne sont pas candidates", () => {
    const candidates = toCandidates([link("/"), link("/accueil", "Accueil"), link("/tarifs"), link("/contact"), link("/mentions-legales"), link("/blog/un-article"), link("/panier"), link("/temoignages")], ROOT, new Set(["mon-cabinet.fr/contact"]));
    expect(paths(candidates)).toEqual(["/tarifs"]);
  });

  it("ordre de lecture : à propos, spécialités et prestations, tarifs, contact, questions, rendez-vous, puis le blog", () => {
    const links = [link("/blog"), link("/rdv"), link("/faq"), link("/contact"), link("/tarifs"), link("/prestations"), link("/sophrologie"), link("/a-propos"), link("/le-lieu", "Le lieu")];
    expect(paths(planPages(toCandidates(links, ROOT)))).toEqual(["/a-propos", "/sophrologie", "/prestations", "/tarifs", "/contact", "/faq", "/rdv", "/blog", "/le-lieu"]);
  });

  it("beaucoup de spécialités : six au plus, sans évincer tarifs, contact et questions fréquentes", () => {
    const specialties = ["sophrologie", "hypnose", "massage", "reflexologie", "naturopathie", "reiki", "shiatsu", "yoga"].map((name) => link(`/${name}`));
    const plan = planPages(toCandidates([...specialties, link("/a-propos"), link("/qui-suis-je"), link("/tarifs"), link("/contact"), link("/acces"), link("/faq"), link("/rdv"), link("/blog"), link("/prestations"), link("/seances")], ROOT));
    expect(paths(plan).slice(0, 11)).toEqual(["/a-propos", "/sophrologie", "/prestations", "/hypnose", "/massage", "/reflexologie", "/tarifs", "/naturopathie", "/contact", "/reiki", "/faq"]);
    expect(plan.filter((candidate) => candidate.kind === "specialty")).toHaveLength(6);
    expect(paths(plan)).not.toContain("/yoga");
    // Une seule page de blog, une seule de tarifs, deux « à propos » au plus
    const count = (kind: ExternalPageKind): number => plan.filter((candidate) => candidate.kind === kind).length;
    expect([count("blog"), count("pricing"), count("faq"), count("booking"), count("about"), count("contact"), count("services")]).toEqual([1, 1, 1, 1, 2, 2, 2]);
  });

  it("à nature égale, le menu passe avant le corps de page, le pied de page et le plan de site", () => {
    const plan = planPages(toCandidates([link("/reiki", "", "sitemap"), link("/massage", "", "footer"), link("/hypnose", "", "main"), link("/sophrologie", "", "nav")], ROOT));
    expect(paths(plan)).toEqual(["/sophrologie", "/hypnose", "/massage", "/reiki"]);
  });

  it("une page sans nature reconnue n'est lue que si elle vient du menu ou du corps de l'accueil — trois au plus", () => {
    const links = [link("/partenaires", "Partenaires", "footer"), link("/liens-utiles", "", "sitemap"), link("/galerie", "Galerie", "nav"), link("/le-lieu", "Le lieu", "main"), link("/presse", "Presse", "nav"), link("/divers", "Divers", "nav")];
    expect(paths(planPages(toCandidates(links, ROOT)))).toEqual(["/galerie", "/presse", "/divers"]);
  });

  it("page de type WordPress : plan complet", () => {
    const scope: SiteScope = { origin: "https://www.atelier-serenite-nantes.fr", basePath: "", homePath: "/" };
    const links = collectLinks(loadDocument(fixture("wordpress-home.html")), "https://www.atelier-serenite-nantes.fr/", scope);
    const plan = planPages(toCandidates(links, scope, new Set(["atelier-serenite-nantes.fr"])));
    expect(plan.map((candidate) => `${candidate.kind} ${new URL(candidate.url).pathname}`)).toEqual([
      "about /qui-suis-je/",
      "specialty /accompagnements/gestion-du-stress/",
      "services /accompagnements/",
      "specialty /accompagnements/sommeil/",
      "specialty /accompagnements/grossesse-et-naissance/",
      "pricing /tarifs/",
      "contact /contact/",
      "faq /questions-frequentes/",
      "services /deroulement-d-une-seance/",
      "blog /blog/",
    ]);
  });

  it("page de constructeur de site aux adresses muettes : classée par le texte des liens", () => {
    const scope: SiteScope = { origin: "https://www.jardins-de-maelle.fr", basePath: "", homePath: "/" };
    const links = collectLinks(loadDocument(fixture("builder-home.html")), "https://www.jardins-de-maelle.fr/", scope);
    const plan = planPages(toCandidates(links, scope, new Set(["jardins-de-maelle.fr"])));
    expect(plan.map((candidate) => `${candidate.kind} ${new URL(candidate.url).pathname}`)).toEqual(["about /about-1", "services /services-2", "pricing /blank-3", "contact /blank-4", "services /general-5", "booking /book-online"]);
  });
});

describe("plan de site", () => {
  it("parseSitemap : pages d'un plan, entités décodées, sections CDATA, autres espaces de noms ignorés", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url><loc>https://www.mon-cabinet.fr/</loc><lastmod>2026-10-01</lastmod></url>
        <url><loc> https://www.mon-cabinet.fr/tarifs/?a=1&amp;b=2 </loc><image:image><image:loc>https://www.mon-cabinet.fr/photo.jpg</image:loc></image:image></url>
        <url><loc><![CDATA[https://www.mon-cabinet.fr/contact/]]></loc></url>
        <url><loc></loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual({ pages: ["https://www.mon-cabinet.fr/", "https://www.mon-cabinet.fr/tarifs/?a=1&b=2", "https://www.mon-cabinet.fr/contact/"], sitemaps: [] });
  });

  it("parseSitemap : index de plans ; contenu qui n'est pas un plan : rien, sans erreur", () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.mon-cabinet.fr/page-sitemap.xml</loc></sitemap><sitemap><loc>https://www.mon-cabinet.fr/post-sitemap.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(index)).toEqual({ pages: [], sitemaps: ["https://www.mon-cabinet.fr/page-sitemap.xml", "https://www.mon-cabinet.fr/post-sitemap.xml"] });
    expect(parseSitemap("<html><body><h1>Page introuvable</h1></body></html>")).toEqual({ pages: [], sitemaps: [] });
    expect(parseSitemap("")).toEqual({ pages: [], sitemaps: [] });
    expect(parseSitemap("<urlset><url><loc>non fermé")).toEqual({ pages: ["non fermé"], sitemaps: [] });
  });

  it("parseSitemap : aucune entité externe n'est résolue, le nombre d'adresses est borné", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE urlset [<!ENTITY secret SYSTEM "file:///etc/passwd">]><urlset><url><loc>https://www.mon-cabinet.fr/&secret;</loc></url></urlset>`;
    expect(parseSitemap(xxe).pages.join("")).not.toContain("root:");
    const many = `<urlset>${Array.from({ length: 2_000 }, (_, i) => `<url><loc>https://www.mon-cabinet.fr/p${i}</loc></url>`).join("")}</urlset>`;
    expect(parseSitemap(many).pages).toHaveLength(500);
  });

  it("parseSitemap : plan trop imbriqué ou trop touffu, adresse démesurée : rien, sans erreur ni attente", () => {
    const start = performance.now();
    expect(parseSitemap(`<urlset>${"<url>".repeat(100_000)}<loc>https://www.mon-cabinet.fr/</loc>`)).toEqual({ pages: [], sitemaps: [] });
    expect(parseSitemap(`<urlset>${"<url><loc>https://www.mon-cabinet.fr/p</loc></url>".repeat(60_000)}</urlset>`)).toEqual({ pages: [], sitemaps: [] });
    expect(parseSitemap(`<urlset><url><loc>https://www.mon-cabinet.fr/${"x".repeat(5_000)}</loc></url><url><loc>https://www.mon-cabinet.fr/ok</loc></url></urlset>`)).toEqual({ pages: ["https://www.mon-cabinet.fr/ok"], sitemaps: [] });
    // Sans élément racine : des milliers d'entrées à la racine du document
    expect(parseSitemap("<url><loc>https://www.mon-cabinet.fr/p</loc></url>".repeat(20_000)).pages).toHaveLength(500);
    expect(performance.now() - start).toBeLessThan(5_000);
  });

  it("pickChildSitemaps : les plans des pages d'abord, jamais ceux des articles, étiquettes, auteurs ou produits", () => {
    const yoast = ["post-sitemap.xml", "page-sitemap.xml", "category-sitemap.xml", "post_tag-sitemap.xml", "author-sitemap.xml"].map((name) => `${ORIGIN}/${name}`);
    expect(pickChildSitemaps(yoast, 2)).toEqual([`${ORIGIN}/page-sitemap.xml`]);
    const core = ["wp-sitemap-posts-post-1.xml", "wp-sitemap-posts-page-1.xml", "wp-sitemap-taxonomies-category-1.xml", "wp-sitemap-users-1.xml"].map((name) => `${ORIGIN}/${name}`);
    expect(pickChildSitemaps(core, 2)).toEqual([`${ORIGIN}/wp-sitemap-posts-page-1.xml`]);
    const builder = ["blog-posts-sitemap.xml", "store-products-sitemap.xml", "booking-services-sitemap.xml", "pages-sitemap.xml", "event-pages-sitemap.xml"].map((name) => `${ORIGIN}/${name}`);
    expect(pickChildSitemaps(builder, 2)).toEqual([`${ORIGIN}/pages-sitemap.xml`, `${ORIGIN}/booking-services-sitemap.xml`]);
    expect(pickChildSitemaps(builder, 1)).toEqual([`${ORIGIN}/pages-sitemap.xml`]);
  });
});
