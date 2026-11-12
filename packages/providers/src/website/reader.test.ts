import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { EXTERNAL_BOT_NAME, EXTERNAL_SITE_LIMITS, isExternalReadError, type ExternalReadOutcome } from "@theralys/shared";
import { createWebsiteReader, websiteUserAgent, DEFAULT_BOT_PAGE_URL } from "./index";
import { READER_DEFAULTS, createLiveWebsiteReader, homeFailure, resolveScope, type LiveReaderOptions } from "./reader";
import { SafeFetchError, type NetworkPolicy } from "./safe-fetch";
import { html, localPolicy, selfSignedCertificate, startServer, type FakeAnswer, type RecordedRequest, type Reply, type TestServer } from "./test-kit";
import { sha256Hex } from "./text";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const UA = "LecteurDeTest/1.0 (+https://lecteur.test/robot)";
const WWW = "www.cabinet-test.fr";
const BARE = "cabinet-test.fr";
const NOW = new Date("2026-11-12T09:30:00.000Z");

type Route = Reply | ((request: RecordedRequest) => Reply);

const cleanups: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * Site de test : routes par chemin (`/tarifs`) ou par hôte et chemin
 * (`cabinet-test.fr/`). Sans route : 404. Sans route `/robots.txt` : 404
 * aussi, donc aucune restriction.
 */
async function site(routes: Record<string, Route>, tls?: { key: string; cert: string }): Promise<TestServer> {
  const server = await startServer((request) => {
    const path = request.path.split("?")[0]!;
    const route = routes[`${request.host}${request.path}`] ?? routes[request.path] ?? routes[`${request.host}${path}`] ?? routes[path];
    if (route === undefined) return { status: 404, headers: { "content-type": "text/html" }, body: "<title>Page introuvable</title><p>Cette page n'existe pas.</p>" };
    return typeof route === "function" ? route(request) : route;
  }, tls);
  cleanups.push(() => server.close());
  return server;
}

const HOSTS: Record<string, FakeAnswer> = { [WWW]: "127.0.0.1", [BARE]: "127.0.0.1", "www.autre-site.fr": "127.0.0.1" };

function readerFor(options: Partial<LiveReaderOptions> & { hosts?: Record<string, FakeAnswer>; policy?: NetworkPolicy } = {}): { reader: ReturnType<typeof createLiveWebsiteReader>; policy: ReturnType<typeof localPolicy> } {
  const { hosts, ...rest } = options;
  const policy = localPolicy(hosts ?? HOSTS);
  return { policy, reader: createLiveWebsiteReader({ userAgent: UA, policy, minIntervalMs: 0, requestTimeoutMs: 2_000, now: () => NOW, ...rest }) };
}

/** Page simple, avec des liens et assez de texte pour suffire seule à un profil (plus de 400 caractères, propres à la page). */
function page(title: string, opts: { links?: [string, string][] } = {}): Reply {
  const text = `${title} : ce texte présente le cabinet, son approche et le déroulement des séances, avec assez de détails pour être utile à la lecture.`;
  const links = (opts.links ?? []).map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  const paragraphs = [text, text.split(" ").reverse().join(" "), `Chaque accompagnement commence par un temps d'échange, se poursuit par des exercices simples et se termine par un point sur les progrès (${title}).`];
  return html(`<!doctype html><html lang="fr"><head><title>${title} – Cabinet Test</title></head><body><header><nav><ul>${links}</ul></nav></header><main><h1>${title}</h1>${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}</main><footer><p>Pied de page</p></footer></body></html>`);
}

const MENU: [string, string][] = [
  ["/", "Accueil"],
  ["/a-propos", "À propos"],
  ["/sophrologie", "Sophrologie"],
  ["/tarifs", "Tarifs"],
  ["/contact", "Contact"],
];

const text = (content: string, status = 200): Reply => ({ status, headers: { "content-type": "text/plain; charset=utf-8" }, body: content });
const xml = (content: string): Reply => ({ headers: { "content-type": "application/xml" }, body: content });
const redirect = (location: string, status = 301): Reply => ({ status, headers: { location } });

function ok(outcome: ExternalReadOutcome): Extract<ExternalReadOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`lecture en échec : ${outcome.error} (${outcome.detail ?? ""})`);
  return outcome;
}

const kinds = (outcome: ExternalReadOutcome): string[] => ok(outcome).pages.map((entry) => `${entry.kind} ${new URL(entry.url).pathname}`);

// ─── Lecture complète ────────────────────────────────────────────────────────

describe("lecture d'un site de praticien (de type WordPress)", () => {
  async function wordpressSite(): Promise<TestServer> {
    const server: TestServer = await site({
      "/robots.txt": text("User-agent: *\nDisallow: /wp-admin/\nDisallow: /deroulement-d-une-seance/\n"),
      "/": () => html(fixture("wordpress-home.html").replaceAll("https://www.atelier-serenite-nantes.fr", `http://${WWW}:${server.port}`), { headers: { etag: 'W/"accueil-1"', "last-modified": "Tue, 03 Nov 2026 10:00:00 GMT" } }),
      "/qui-suis-je/": page("Qui suis-je ?"),
      "/accompagnements/": page("Mes accompagnements", { links: [["/accompagnements/gestion-du-stress/", "Stress"], ["/accompagnements/enfants-et-adolescents/", "Enfants et adolescents"]] }),
      "/accompagnements/gestion-du-stress/": page("Gestion du stress"),
      "/accompagnements/sommeil/": page("Troubles du sommeil"),
      "/accompagnements/grossesse-et-naissance/": page("Grossesse et naissance"),
      "/accompagnements/enfants-et-adolescents/": page("Enfants et adolescents"),
      "/tarifs/": () => html(fixture("wordpress-tarifs.html"), { headers: { etag: '"tarifs-7"' } }),
      "/contact/": page("Contact et accès"),
      "/questions-frequentes/": page("Questions fréquentes"),
      "/deroulement-d-une-seance/": page("Déroulement d'une séance"),
      "/blog/": page("Le blog"),
      "/temoignages/": page("Témoignages"),
      "/mentions-legales/": page("Mentions légales"),
      "/panier/": page("Panier"),
    });
    return server;
  }

  it("lit l'accueil puis les pages utiles, dans l'ordre de leur intérêt pour le profil", async () => {
    const server = await wordpressSite();
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.url).toBe(`http://${WWW}:${server.port}`);
    expect(kinds(outcome)).toEqual([
      "home /",
      "about /qui-suis-je/",
      "specialty /accompagnements/gestion-du-stress/",
      "services /accompagnements/",
      "specialty /accompagnements/sommeil/",
      "specialty /accompagnements/grossesse-et-naissance/",
      "pricing /tarifs/",
      "contact /contact/",
      "faq /questions-frequentes/",
      "blog /blog/",
      // Spécialité trouvée sur la page des accompagnements, absente du menu
      "specialty /accompagnements/enfants-et-adolescents/",
    ]);
    // Une page interdite par robots.txt : comptée, jamais demandée
    expect(outcome.skipped).toEqual({ robots: 1, failed: 0 });
  });

  it("demande robots.txt d'abord, l'accueil ensuite, et jamais les pages à écarter", async () => {
    const server = await wordpressSite();
    await readerFor().reader.read(`http://${WWW}:${server.port}`);
    const paths = server.paths();
    expect(paths.slice(0, 2)).toEqual(["/robots.txt", "/"]);
    expect(new Set(paths).size).toBe(paths.length);
    // 1 robots.txt + 11 pages + le plan de site tenté (l'accueil ne menait pas à douze pages)
    expect(paths).toHaveLength(13);
    expect(paths).toContain("/sitemap.xml");
    for (const forbidden of ["/deroulement-d-une-seance/", "/temoignages/", "/mentions-legales/", "/panier/", "/mon-compte/", "/recherche/", "/piege-a-robots/", "/politique-de-confidentialite/", "/cgv/", "/partenaires/"]) expect(paths, forbidden).not.toContain(forbidden);
    expect(paths.some((path) => /\.pdf|\/blog\/.+|\/tag\/|\/category\/|\/feed|\?/.test(path))).toBe(false);
  });

  it("chaque requête porte l'identité du robot, sans cookie ni adresse d'origine", async () => {
    const server = await wordpressSite();
    await readerFor().reader.read(`http://${WWW}:${server.port}`);
    for (const request of server.requests) {
      expect(request.method).toBe("GET");
      expect(request.headers["user-agent"]).toBe(UA);
      expect(request.headers["accept-language"]).toBe("fr-FR,fr;q=0.9,en;q=0.5");
      for (const header of ["cookie", "authorization", "referer", "origin"]) expect(request.headers[header], header).toBeUndefined();
    }
    expect(server.requests[0]!.headers.accept).toBe("text/plain,*/*;q=0.1");
    expect(server.requests[1]!.headers.accept).toBe("text/html,application/xhtml+xml;q=0.9,*/*;q=0.1");
  });

  it("pages rendues selon le contrat : texte nettoyé et borné, empreinte, date, validateurs HTTP", async () => {
    const server = await wordpressSite();
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    const [home] = outcome.pages;
    expect(home).toMatchObject({ url: `http://${WWW}:${server.port}/`, kind: "home", title: "Atelier Sérénité – Hélène Roux, sophrologue à Nantes", fetchedAt: "2026-11-12T09:30:00.000Z", etag: 'W/"accueil-1"', lastModified: "Tue, 03 Nov 2026 10:00:00 GMT" });
    expect(home!.headings[0]).toBe("Sophrologue à Nantes : retrouvez calme, sommeil et confiance");
    expect(home!.text).toContain("Première séance | 1 h 15 | 70 €");
    expect(home!.text).not.toContain("CONSIGNE POUR LES ASSISTANTS");
    const pricing = outcome.pages.find((entry) => entry.kind === "pricing")!;
    expect(pricing).toMatchObject({ title: "Tarifs et remboursement – Atelier Sérénité", etag: '"tarifs-7"' });
    expect(pricing).not.toHaveProperty("lastModified");
    for (const entry of outcome.pages) {
      expect(entry.hash).toBe(sha256Hex(entry.text));
      expect(entry.text.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pageChars);
      expect(entry.text).not.toMatch(/<[a-z]/i);
      expect(entry.url).not.toContain("#");
    }
    expect(outcome.pages.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.maxPages);
  });

  it("faits réunis sur l'ensemble des pages lues", async () => {
    const server = await wordpressSite();
    const { facts } = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(facts).toMatchObject({
      name: "Atelier Sérénité & Sophrologie",
      language: "fr-FR",
      phones: ["02 61 91 23 45"],
      emails: ["bonjour@atelier-serenite-nantes.fr"],
      address: "7 rue Crébillon, 44000 Nantes",
      bookingLinks: [{ url: "https://www.resalib.fr/praticien/12345-helene-roux", platform: "resalib" }],
      cms: "wordpress",
      themeColor: "#3a7d6b",
      tags: { googleAnalyticsId: "G-7QK2XW9LMP", googleTagManagerId: "GTM-K7WLP2X", googleAdsId: "AW-11223344556", metaPixelId: "1029384756102938", consentBanner: true, measureSnippet: true },
    });
    expect(facts.hours).toHaveLength(3);
    expect(Object.keys(facts.social).sort()).toEqual(["facebook", "instagram", "linkedin"]);
  });

  it("maxPages : borne le nombre de pages lues, accueil comprise, et les requêtes qui vont avec", async () => {
    const server = await wordpressSite();
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`, { maxPages: 3 }));
    expect(kinds(outcome)).toEqual(["home /", "about /qui-suis-je/", "specialty /accompagnements/gestion-du-stress/"]);
    expect(server.paths()).toEqual(["/robots.txt", "/", "/qui-suis-je/", "/accompagnements/gestion-du-stress/"]);
    const single = await site({ "/": page("Accueil", { links: MENU }), "/tarifs": page("Tarifs") });
    for (const maxPages of [1, 0, -2, Number.NaN]) {
      single.requests.length = 0;
      expect(kinds(await readerFor().reader.read(`http://${WWW}:${single.port}`, { maxPages })), String(maxPages)).toEqual(["home /"]);
      expect(single.paths()).toEqual(["/robots.txt", "/"]);
    }
  });

  it("jamais plus de pages que la limite du contrat, même si l'appelant en demande plus", async () => {
    const many: [string, string][] = Array.from({ length: 30 }, (_, i) => [`/soin-${i}`, `Massage ${i}`]);
    const others: [string, string][] = [["/a-propos", "À propos"], ["/qui-suis-je", "Qui suis-je"], ["/prestations", "Prestations"], ["/seances", "Séances"], ["/tarifs", "Tarifs"], ["/contact", "Contact"], ["/acces", "Accès"], ["/faq", "FAQ"], ["/rdv", "Rendez-vous"], ["/blog", "Blog"], ["/galerie", "Galerie"], ["/presse", "Presse"]];
    const routes: Record<string, Route> = { "/": page("Accueil", { links: [...many, ...others] }) };
    for (const [path, label] of [...many, ...others]) routes[path] = page(`${label} (page ${path})`);
    const server = await site(routes);
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`, { maxPages: 500 }));
    expect(outcome.pages).toHaveLength(EXTERNAL_SITE_LIMITS.maxPages);
    expect(outcome.pages.filter((entry) => entry.kind === "specialty")).toHaveLength(6);
    // Assez de liens sur l'accueil : le plan de site n'est pas demandé
    expect(server.paths()).not.toContain("/sitemap.xml");
    expect(server.requests).toHaveLength(1 + EXTERNAL_SITE_LIMITS.maxPages);
  });
});

// ─── Politesse ───────────────────────────────────────────────────────────────

describe("politesse envers le site lu", () => {
  it("deux requêtes simultanées au plus", async () => {
    let active = 0;
    let peak = 0;
    const slow = (title: string): Route => () => {
      active += 1;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active -= 1;
      }, 60);
      return { ...page(title), delayMs: 60 };
    };
    const routes: Record<string, Route> = { "/": page("Accueil", { links: [...MENU, ["/faq", "FAQ"], ["/rdv", "Rendez-vous"], ["/blog", "Blog"]] }) };
    for (const path of ["/a-propos", "/sophrologie", "/tarifs", "/contact", "/faq", "/rdv", "/blog"]) routes[path] = slow(`Page ${path}`);
    const server = await site(routes);
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.pages).toHaveLength(8);
    expect(peak).toBe(2);
  });

  it("un écart minimal sépare deux requêtes (300 ms par défaut)", async () => {
    expect(READER_DEFAULTS.minIntervalMs).toBe(300);
    expect(READER_DEFAULTS.concurrency).toBe(2);
    const server = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": page("À propos"), "/sophrologie": page("Sophrologie"), "/tarifs": page("Tarifs"), "/contact": page("Contact") });
    ok(await readerFor({ minIntervalMs: 50 }).reader.read(`http://${WWW}:${server.port}`));
    const times = server.requests.map((request) => request.at);
    expect(times.length).toBeGreaterThanOrEqual(6);
    // Heures d'arrivée au serveur : une requête peut y être notée en retard (machine chargée), jamais en avance.
    // L'écart est donc jugé sur l'ensemble — sans frein, les six requêtes tiendraient en quelques millisecondes.
    expect(times[times.length - 1]! - times[0]!).toBeGreaterThanOrEqual((times.length - 1) * 50 * 0.7);
    const shortGaps = times.slice(1).filter((at, index) => at - times[index]! < 25).length;
    expect(shortGaps).toBeLessThanOrEqual(1);
  });

  it("Crawl-delay de robots.txt : respecté, les pages sont alors demandées une par une", async () => {
    let active = 0;
    let peak = 0;
    const tracked = (reply: Reply): Route => () => {
      active += 1;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active -= 1;
      }, 30);
      return { ...reply, delayMs: 30 };
    };
    const server = await site({
      "/robots.txt": text(`User-agent: ${EXTERNAL_BOT_NAME}\nCrawl-delay: 0.15\n`),
      "/": tracked(page("Accueil", { links: [["/a-propos", "À propos"], ["/tarifs", "Tarifs"]] })),
      "/a-propos": tracked(page("À propos")),
      "/tarifs": tracked(page("Tarifs")),
    });
    ok(await readerFor().reader.read(`http://${WWW}:${server.port}`, { maxPages: 3 }));
    const times = server.requests.map((request) => request.at);
    expect(server.paths()).toEqual(["/robots.txt", "/", "/a-propos", "/tarifs"]);
    // Le délai vaut dès la première page, et se compte depuis la fin de la réponse précédente (30 ms de traitement)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(140);
    for (let i = 2; i < times.length; i++) expect(times[i]! - times[i - 1]!, `requête ${i}`).toBeGreaterThanOrEqual(170);
    expect(peak).toBe(1);
  });

  it("une seule lecture de robots.txt par origine, quel que soit le nombre de pages", async () => {
    const server = await site({ "/robots.txt": text("User-agent: *\nAllow: /\n"), "/": page("Accueil", { links: MENU }), "/a-propos": page("À propos"), "/sophrologie": page("Sophrologie"), "/tarifs": page("Tarifs"), "/contact": page("Contact") });
    ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(server.paths().filter((path) => path === "/robots.txt")).toHaveLength(1);
  });
});

// ─── robots.txt ──────────────────────────────────────────────────────────────

describe("respect de robots.txt", () => {
  const smallSite = (robots: Route | undefined): Promise<TestServer> =>
    site({ ...(robots ? { "/robots.txt": robots } : {}), "/": page("Accueil", { links: MENU }), "/a-propos": page("À propos"), "/sophrologie": page("Sophrologie"), "/tarifs": page("Tarifs"), "/contact": page("Contact"), "/sitemap.xml": xml("<urlset></urlset>") });

  it("site fermé aux robots : échec « robots », aucune page demandée", async () => {
    const server = await smallSite(text("User-agent: *\nDisallow: /\n"));
    const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
    expect(outcome).toMatchObject({ ok: false, error: "robots" });
    expect(server.paths()).toEqual(["/robots.txt"]);
  });

  it("site fermé à notre robot nommément : échec « robots » ; fermé à d'autres robots seulement : lecture", async () => {
    const closed = await smallSite(text(`User-agent: *\nAllow: /\n\nUser-agent: ${EXTERNAL_BOT_NAME}\nDisallow: /\n`));
    expect(await readerFor().reader.read(`http://${WWW}:${closed.port}`)).toMatchObject({ ok: false, error: "robots" });
    const others = await smallSite(text("User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n"));
    expect(ok(await readerFor().reader.read(`http://${WWW}:${others.port}`)).pages).toHaveLength(5);
  });

  it("site fermé à tous sauf à notre robot : lecture (c'est ainsi qu'un propriétaire nous autorise)", async () => {
    const server = await smallSite(text(`User-agent: *\nDisallow: /\n\nUser-agent: ${EXTERNAL_BOT_NAME}\nAllow: /\n`));
    expect(ok(await readerFor().reader.read(`http://${WWW}:${server.port}`)).pages).toHaveLength(5);
  });

  it("le jeton des règles reste celui du contrat, même quand l'identité envoyée est remplacée", async () => {
    const server = await smallSite(text(`User-agent: ${EXTERNAL_BOT_NAME}\nDisallow: /\n\nUser-agent: site-reader-test\nAllow: /\n`));
    const outcome = await readerFor({ userAgent: "site-reader-test/0.1" }).reader.read(`http://${WWW}:${server.port}`);
    expect(outcome).toMatchObject({ ok: false, error: "robots" });
    expect(server.requests[0]!.headers["user-agent"]).toBe("site-reader-test/0.1");
  });

  it("pages interdites : comptées, jamais demandées ; les autres sont lues", async () => {
    const server = await smallSite(text("User-agent: *\nDisallow: /tarifs\nDisallow: /contact\n"));
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /", "about /a-propos", "specialty /sophrologie"]);
    expect(outcome.skipped).toEqual({ robots: 2, failed: 0 });
    expect(server.paths()).not.toContain("/tarifs");
    expect(server.paths()).not.toContain("/contact");
  });

  it("pas de robots.txt (4xx) : rien n'est interdit", async () => {
    for (const status of [404, 410, 403, 401]) {
      const server = await smallSite({ status, headers: { "content-type": "text/html" }, body: "<h1>Erreur</h1>" });
      expect(ok(await readerFor().reader.read(`http://${WWW}:${server.port}`)).pages, String(status)).toHaveLength(5);
    }
    const none = await smallSite(undefined);
    expect(ok(await readerFor().reader.read(`http://${WWW}:${none.port}`)).pages).toHaveLength(5);
  });

  it("robots.txt en erreur serveur (5xx) : tout est interdit, la lecture s'arrête sans demander de page", async () => {
    for (const status of [500, 502, 503]) {
      const server = await smallSite({ status, headers: { "content-type": "text/html" }, body: "<h1>Erreur serveur</h1>" });
      const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
      expect(outcome, String(status)).toMatchObject({ ok: false, error: "robots" });
      expect(outcome.ok === false && outcome.detail).toContain("indisponible");
      expect(server.paths()).toEqual(["/robots.txt"]);
    }
  });

  it("robots.txt muet : la lecture échoue en délai dépassé, sans demander de page", async () => {
    const server = await smallSite({ hang: true });
    const outcome = await readerFor({ requestTimeoutMs: 150 }).reader.read(`http://${WWW}:${server.port}`);
    expect(outcome).toMatchObject({ ok: false, error: "timeout" });
    expect(server.paths()).toEqual(["/robots.txt"]);
  });

  it("robots.txt limité en débit (429) ou remplacé par un défi anti-robots : le site refuse les robots", async () => {
    const limited = await smallSite(text("Trop de requêtes", 429));
    expect(await readerFor().reader.read(`http://${WWW}:${limited.port}`)).toMatchObject({ ok: false, error: "blocked" });
    expect(limited.paths()).toEqual(["/robots.txt"]);
    const challenged = await smallSite(html(fixture("challenge.html"), { status: 403, headers: { "cf-mitigated": "challenge" } }));
    expect(await readerFor().reader.read(`http://${WWW}:${challenged.port}`)).toMatchObject({ ok: false, error: "blocked" });
    expect(challenged.paths()).toEqual(["/robots.txt"]);
  });

  it("une page HTML servie à la place de robots.txt, ou un fichier d'un autre type : comme s'il n'existait pas", async () => {
    const soft404 = await smallSite(html("<html><head><title>Page introuvable</title></head><body><h1>Oups</h1></body></html>"));
    expect(ok(await readerFor().reader.read(`http://${WWW}:${soft404.port}`)).pages).toHaveLength(5);
    const binary = await smallSite({ headers: { "content-type": "image/png" }, body: "PNG" });
    expect(ok(await readerFor().reader.read(`http://${WWW}:${binary.port}`)).pages).toHaveLength(5);
    const untyped = await smallSite({ body: "User-agent: *\nDisallow: /\n" });
    expect(await readerFor().reader.read(`http://${WWW}:${untyped.port}`)).toMatchObject({ ok: false, error: "robots" });
  });

  it("robots.txt démesuré : seul son début est lu, et il fait foi", async () => {
    const server = await smallSite(text(`User-agent: *\nDisallow: /tarifs\n${"# remplissage\n".repeat(60_000)}Disallow: /\n`));
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.skipped.robots).toBe(1);
    expect(outcome.pages).toHaveLength(4);
  });
});

// ─── Refus du site ───────────────────────────────────────────────────────────

describe("site qui refuse la lecture automatique", () => {
  it("accueil en 401, 403 ou 429 : échec « blocked », une seule tentative, sans changer d'identité", async () => {
    for (const status of [401, 403, 429]) {
      const server = await site({ "/": html("<h1>Accès refusé</h1>", { status }) });
      const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
      expect(outcome, String(status)).toMatchObject({ ok: false, error: "blocked" });
      expect(server.paths()).toEqual(["/robots.txt", "/"]);
      expect(new Set(server.requests.map((request) => request.headers["user-agent"]))).toEqual(new Set([UA]));
    }
  });

  it("page de défi : en 503, en 403 avec en-tête de protection, ou servie en 200", async () => {
    const challenge = fixture("challenge.html");
    for (const reply of [html(challenge, { status: 503 }), html(challenge, { status: 403, headers: { "cf-mitigated": "challenge" } }), html(challenge), html("<p>ok</p>", { headers: { "cf-mitigated": "challenge" } })]) {
      const server = await site({ "/": reply, "/a-propos": page("À propos") });
      expect(await readerFor().reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "blocked" });
      expect(server.paths()).toEqual(["/robots.txt", "/"]);
    }
  });

  it("une erreur ordinaire n'est pas un refus : page introuvable, panne ou maintenance → « unreachable »", async () => {
    for (const status of [404, 410, 500, 502, 503]) {
      const server = await site({ "/": html("<title>Erreur</title><p>Le site est indisponible pour le moment.</p>", { status }) });
      const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
      expect(outcome, String(status)).toMatchObject({ ok: false, error: "unreachable", detail: `réponse HTTP ${status}` });
    }
  });

  it("refus en cours de lecture (429 ou défi sur une page) : la lecture s'arrête là et garde ce qui est lu", async () => {
    for (const refusal of [text("Trop de requêtes", 429), html(fixture("challenge.html"), { status: 503 })]) {
      const server = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": page("À propos"), "/sophrologie": refusal, "/tarifs": page("Tarifs"), "/contact": page("Contact") });
      const outcome = ok(await readerFor({ concurrency: 1 }).reader.read(`http://${WWW}:${server.port}`));
      expect(kinds(outcome)).toEqual(["home /", "about /a-propos"]);
      expect(outcome.skipped).toEqual({ robots: 0, failed: 1 });
      expect(server.paths()).not.toContain("/tarifs");
      expect(server.paths()).not.toContain("/contact");
      expect(server.paths().filter((path) => path === "/sophrologie")).toHaveLength(1);
    }
  });

  it("refus dès la première page et trop peu de texte sur l'accueil : « blocked » plutôt que « empty »", async () => {
    const server = await site({ "/": html(`<html><head><title>Accueil</title></head><body><h1>Cabinet</h1><a href="/a-propos">À propos</a></body></html>`), "/a-propos": text("Trop de requêtes", 429) });
    expect(await readerFor().reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "blocked" });
  });

  it("une page protégée (403) ou cassée parmi d'autres : comptée en échec, la lecture continue", async () => {
    const server = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": html("<h1>Interdit</h1>", { status: 403 }), "/sophrologie": page("Sophrologie"), "/tarifs": html("<h1>Erreur</h1>", { status: 500 }), "/contact": page("Contact") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /", "specialty /sophrologie", "contact /contact"]);
    expect(outcome.skipped).toEqual({ robots: 0, failed: 2 });
  });

  it("trois échecs de suite : la lecture des pages s'arrête", async () => {
    const links: [string, string][] = [["/a-propos", "À propos"], ["/sophrologie", "Sophrologie"], ["/prestations", "Prestations"], ["/tarifs", "Tarifs"], ["/contact", "Contact"], ["/faq", "FAQ"]];
    const server = await site({ "/": page("Accueil", { links }), "/contact": page("Contact"), "/faq": page("FAQ") });
    const outcome = ok(await readerFor({ concurrency: 1 }).reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /"]);
    expect(outcome.skipped.failed).toBe(3);
    expect(server.paths()).not.toContain("/tarifs");
  });
});

// ─── Adresse d'accueil ───────────────────────────────────────────────────────

describe("adresse d'accueil et redirections", () => {
  it("redirection vers « www. » : suivie, l'adresse servie est rendue, les pages sont lues sur elle", async () => {
    const server: TestServer = await site({
      [`${BARE}/`]: () => redirect(`http://${WWW}:${server.port}/`),
      [`${BARE}/robots.txt`]: () => redirect(`http://${WWW}:${server.port}/robots.txt`),
      [`${WWW}/robots.txt`]: text("User-agent: *\nDisallow: /tarifs\n"),
      [`${WWW}/`]: () => page("Accueil", { links: [[`http://${BARE}:${server.port}/a-propos`, "À propos"], ["/tarifs", "Tarifs"], ["/contact", "Contact"]] }),
      [`${WWW}/a-propos`]: page("À propos"),
      [`${WWW}/contact`]: page("Contact"),
    });
    const outcome = ok(await readerFor().reader.read(`http://${BARE}:${server.port}`));
    expect(outcome.url).toBe(`http://${WWW}:${server.port}`);
    expect(outcome.pages.map((entry) => entry.url)).toEqual([`http://${WWW}:${server.port}/`, `http://${WWW}:${server.port}/a-propos`, `http://${WWW}:${server.port}/contact`]);
    expect(outcome.skipped.robots).toBe(1);
    // Le robots.txt servi par « www. » n'est demandé qu'une fois : il vaut pour les deux écritures
    expect(server.paths(true).slice(0, 4)).toEqual([`${BARE}/robots.txt`, `${WWW}/robots.txt`, `${BARE}/`, `${WWW}/`]);
    expect(server.paths(true).filter((path) => path.endsWith("/robots.txt"))).toHaveLength(2);
    expect(server.paths(true).filter((path) => path.startsWith(`${BARE}/`) && !["/", "/robots.txt"].includes(path.slice(BARE.length)))).toEqual([]);
  });

  it("de « www. » vers le domaine nu : même site, suivie aussi", async () => {
    const server: TestServer = await site({ [`${WWW}/`]: () => redirect(`http://${BARE}:${server.port}/`, 302), [`${BARE}/`]: page("Accueil", { links: MENU }), [`${BARE}/tarifs`]: page("Tarifs") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.url).toBe(`http://${BARE}:${server.port}`);
    expect(kinds(outcome)).toEqual(["home /", "pricing /tarifs"]);
  });

  it("accueil servie sous un autre chemin du même site : l'adresse du site reste sa racine, tout le site est lu", async () => {
    const server = await site({ "/": redirect("/accueil/", 302), "/accueil/": page("Bienvenue", { links: [["/", "Accueil"], ["/accueil/", "Accueil"], ...MENU.slice(1)] }), "/a-propos": page("À propos"), "/tarifs": page("Tarifs") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.url).toBe(`http://${WWW}:${server.port}`);
    expect(kinds(outcome)).toEqual(["home /accueil/", "about /a-propos", "pricing /tarifs"]);
    // Ni l'accueil ni sa redirection ne sont redemandées comme des pages
    expect(server.paths().filter((path) => path === "/" || path === "/accueil/")).toEqual(["/", "/accueil/"]);
  });

  it("redirection vers un autre site : échec « redirect », rien n'est demandé à cet autre site", async () => {
    const server: TestServer = await site({ [`${WWW}/`]: () => redirect(`http://www.autre-site.fr:${server.port}/`), "www.autre-site.fr/": page("Un autre site") });
    const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
    expect(outcome).toEqual({ ok: false, error: "redirect", detail: `redirection vers http://www.autre-site.fr:${server.port}` });
    expect(server.paths(true)).toEqual([`${WWW}/robots.txt`, `${WWW}/`]);
  });

  it("redirection vers une adresse interne : échec « unsafe », rien n'est demandé", async () => {
    for (const location of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8080/admin", "http://localhost/", "http://[::1]/", "file:///etc/passwd"]) {
      const server = await site({ "/": redirect(location) });
      const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
      expect(outcome, location).toMatchObject({ ok: false, error: "unsafe" });
      expect(server.paths()).toEqual(["/robots.txt", "/"]);
    }
    // Même site d'après son nom, mais le nom mène à une adresse interne
    const hosts = { ...HOSTS, [BARE]: "10.0.0.5" };
    const server: TestServer = await site({ [`${WWW}/`]: () => redirect(`http://${BARE}:${server.port}/`) });
    expect(await readerFor({ hosts }).reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "unsafe" });
  });

  it("redirections en boucle : « unreachable », cinq sauts au plus", async () => {
    const server = await site({ "/": redirect("/b"), "/b": redirect("/") });
    expect(await readerFor().reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "unreachable" });
    expect(server.paths().filter((path) => path !== "/robots.txt")).toHaveLength(6);
  });

  it("hôte introuvable : un essai avec « www. », un seul", async () => {
    const hosts = { [WWW]: "127.0.0.1" };
    const server = await site({ "/": page("Accueil", { links: MENU }), "/tarifs": page("Tarifs") });
    const { reader, policy } = readerFor({ hosts });
    const outcome = ok(await reader.read(`http://${BARE}:${server.port}`));
    expect(outcome.url).toBe(`http://${WWW}:${server.port}`);
    expect(kinds(outcome)).toEqual(["home /", "pricing /tarifs"]);
    expect(policy.resolve.calls.filter((name) => name === BARE)).toHaveLength(1);
    expect(server.requests.every((request) => request.host === WWW)).toBe(true);
  });

  it("hôte « www. » introuvable : un essai sans « www. »", async () => {
    const server = await site({ "/": page("Accueil", { links: MENU }), "/tarifs": page("Tarifs") });
    const outcome = ok(await readerFor({ hosts: { [BARE]: "127.0.0.1" } }).reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.url).toBe(`http://${BARE}:${server.port}`);
  });

  it("aucune des deux écritures ne répond : « unreachable », deux résolutions et pas une de plus", async () => {
    const { reader, policy } = readerFor({ hosts: {} });
    expect(await reader.read(`http://${BARE}:8099`)).toMatchObject({ ok: false, error: "unreachable" });
    expect(policy.resolve.calls).toEqual([BARE, WWW]);
  });

  it("connexion refusée sur l'hôte donné : l'autre écriture est essayée une fois", async () => {
    const closed = await site({});
    const closedPort = closed.port;
    await closed.close();
    // Les deux écritures mènent au même port fermé : échec ; la résolution a bien été tentée pour chacune, une fois
    const { reader, policy } = readerFor();
    expect(await reader.read(`http://${BARE}:${closedPort}`)).toMatchObject({ ok: false, error: "unreachable" });
    expect(policy.resolve.calls).toEqual([BARE, WWW]);
  });

  it("l'autre écriture répond mais refuse : son refus est rendu, pas l'échec de la première", async () => {
    const server = await site({ [`${WWW}/robots.txt`]: text("User-agent: *\nDisallow: /\n") });
    expect(await readerFor({ hosts: { [WWW]: "127.0.0.1" } }).reader.read(`http://${BARE}:${server.port}`)).toMatchObject({ ok: false, error: "robots" });
  });

  it("redirection par balise meta de l'accueil : suivie sur le même site, refusée vers un autre", async () => {
    const stub = (target: string): Reply => html(`<html><head><meta http-equiv="refresh" content="0; url=${target}"><title>Redirection</title></head><body></body></html>`);
    const same = await site({ "/": stub("/fr/accueil.html"), "/fr/accueil.html": page("Accueil", { links: [["/fr/tarifs.html", "Tarifs"]] }), "/fr/tarifs.html": page("Tarifs") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${same.port}`));
    expect(outcome.url).toBe(`http://${WWW}:${same.port}`);
    expect(kinds(outcome)).toEqual(["home /fr/accueil.html", "pricing /fr/tarifs.html"]);

    const other: TestServer = await site({ [`${WWW}/`]: () => stub(`http://www.autre-site.fr:${other.port}/`), "www.autre-site.fr/": page("Autre site") });
    expect(await readerFor().reader.read(`http://${WWW}:${other.port}`)).toMatchObject({ ok: false, error: "redirect" });
    expect(other.paths(true).some((path) => path.startsWith("www.autre-site.fr"))).toBe(false);
  });

  it("une page intérieure qui renvoie vers un autre site, ou hors du chemin du site : écartée", async () => {
    const server: TestServer = await site({
      "/": page("Accueil", { links: MENU }),
      "/a-propos": () => redirect(`http://www.autre-site.fr:${server.port}/profil`),
      "/sophrologie": redirect("/sophrologie/"),
      "/sophrologie/": page("Sophrologie"),
      "/tarifs": redirect("/"),
      "/contact": page("Contact"),
      "www.autre-site.fr/profil": page("Profil ailleurs"),
    });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    // La redirection interne est suivie ; celle vers l'accueil ne duplique pas l'accueil
    expect(kinds(outcome)).toEqual(["home /", "specialty /sophrologie/", "contact /contact"]);
    expect(outcome.skipped).toEqual({ robots: 0, failed: 1 });
    expect(server.paths(true).some((path) => path.startsWith("www.autre-site.fr"))).toBe(false);
  });

  it("site hébergé sous un chemin : seules les pages sous ce chemin sont lues, l'adresse rendue garde le chemin", async () => {
    const server = await site({
      "/mon-cabinet": redirect("/mon-cabinet/"),
      "/mon-cabinet/": page("Accueil", { links: [["/mon-cabinet/tarifs", "Tarifs"], ["contact", "Contact"], ["/autre-cabinet/tarifs", "Tarifs d'un confrère"], ["/", "La plateforme"], ["/a-propos", "À propos de la plateforme"]] }),
      "/mon-cabinet/tarifs": page("Tarifs"),
      "/mon-cabinet/contact": page("Contact"),
      "/autre-cabinet/tarifs": page("Autre"),
      "/a-propos": page("Plateforme"),
    });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}/mon-cabinet`));
    expect(outcome.url).toBe(`http://${WWW}:${server.port}/mon-cabinet`);
    expect(kinds(outcome)).toEqual(["home /mon-cabinet/", "pricing /mon-cabinet/tarifs", "contact /mon-cabinet/contact"]);
    expect(server.paths().filter((path) => !path.startsWith("/mon-cabinet") && path !== "/robots.txt" && path !== "/sitemap.xml")).toEqual([]);
  });
});

describe("resolveScope", () => {
  const scope = (given: string, served: string) => resolveScope(new URL(given), new URL(served));

  it("racine donnée : le site entier, quelle que soit la page servie", () => {
    expect(scope("https://mon-cabinet.fr", "https://www.mon-cabinet.fr/")).toEqual({ origin: "https://www.mon-cabinet.fr", basePath: "", homePath: "/" });
    expect(scope("https://mon-cabinet.fr/", "https://mon-cabinet.fr/accueil/")).toEqual({ origin: "https://mon-cabinet.fr", basePath: "", homePath: "/accueil/" });
    expect(scope("https://mon-cabinet.fr", "https://mon-cabinet.fr/fr/index.html")).toMatchObject({ basePath: "" });
  });

  it("chemin donné : gardé tant que la page servie est dessous ; sinon le site a déménagé sous le chemin servi", () => {
    expect(scope("https://sites.google.com/view/mon-cabinet", "https://sites.google.com/view/mon-cabinet/accueil")).toMatchObject({ basePath: "/view/mon-cabinet" });
    expect(scope("https://www.plateforme.fr/mon-cabinet/", "https://www.plateforme.fr/mon-cabinet")).toMatchObject({ basePath: "/mon-cabinet" });
    expect(scope("https://www.plateforme.fr/ancien", "https://www.plateforme.fr/nouveau/")).toMatchObject({ basePath: "/nouveau" });
    expect(scope("https://www.plateforme.fr/ancien", "https://www.plateforme.fr/index.html")).toMatchObject({ basePath: "" });
    expect(scope("https://www.plateforme.fr/cabinet", "https://www.plateforme.fr/cabinet-bis/")).toMatchObject({ basePath: "/cabinet-bis" });
  });
});

// ─── Découverte ──────────────────────────────────────────────────────────────

describe("découverte des pages", () => {
  const sitemap = (...paths: string[]): string => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${path}</loc></url>`).join("")}</urlset>`;

  it("accueil sans liens : le plan de site déclaré dans robots.txt complète", async () => {
    const server: TestServer = await site({
      "/robots.txt": () => text(`User-agent: *\nAllow: /\nSitemap: http://${WWW}:${server.port}/plan-du-site.xml\n`),
      "/": page("Accueil"),
      "/plan-du-site.xml": () => xml(sitemap(`http://${WWW}:${server.port}/`, `http://${WWW}:${server.port}/tarifs`, `http://${BARE}:${server.port}/sophrologie`, `http://${WWW}:${server.port}/mentions-legales`, `http://${WWW}:${server.port}/blog/un-article`, `http://www.autre-site.fr:${server.port}/intrus`, `http://${WWW}:${server.port}/plaquette.pdf`, `http://${WWW}:${server.port}/divers`)),
      "/tarifs": page("Tarifs"),
      "/sophrologie": page("Sophrologie"),
      "/divers": page("Divers"),
    });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    // Une page du plan sans nature reconnue (« /divers ») n'est pas lue
    expect(kinds(outcome)).toEqual(["home /", "specialty /sophrologie", "pricing /tarifs"]);
    expect(server.paths()).toEqual(["/robots.txt", "/", "/plan-du-site.xml", "/sophrologie", "/tarifs"]);
  });

  it("sans déclaration : /sitemap.xml ; index de plans : le plan des pages est lu, pas celui des articles", async () => {
    const server: TestServer = await site({
      "/": page("Accueil"),
      "/sitemap.xml": redirect("/sitemap_index.xml"),
      "/sitemap_index.xml": () => xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>http://${WWW}:${server.port}/post-sitemap.xml</loc></sitemap><sitemap><loc>http://${WWW}:${server.port}/page-sitemap.xml</loc></sitemap><sitemap><loc>http://${WWW}:${server.port}/category-sitemap.xml</loc></sitemap></sitemapindex>`),
      "/page-sitemap.xml": () => xml(sitemap(`http://${WWW}:${server.port}/a-propos`, `http://${WWW}:${server.port}/contact`)),
      "/post-sitemap.xml": () => xml(sitemap(`http://${WWW}:${server.port}/sophrologie-et-sommeil`)),
      "/a-propos": page("À propos"),
      "/contact": page("Contact"),
    });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /", "about /a-propos", "contact /contact"]);
    expect(server.paths()).not.toContain("/post-sitemap.xml");
    expect(server.paths()).not.toContain("/category-sitemap.xml");
  });

  it("plan de site absent, illisible, d'un autre type ou interdit : la lecture continue sans lui", async () => {
    for (const reply of [undefined, xml("<urlset><url><loc>pas fermé"), html("<h1>Page introuvable</h1>"), { status: 500, body: "erreur" }, { hang: true }] as (Reply | undefined)[]) {
      const server = await site({ "/": page("Accueil", { links: [["/tarifs", "Tarifs"]] }), "/tarifs": page("Tarifs"), ...(reply ? { "/sitemap.xml": reply } : {}) });
      expect(kinds(await readerFor({ requestTimeoutMs: 200 }).reader.read(`http://${WWW}:${server.port}`))).toEqual(["home /", "pricing /tarifs"]);
    }
    const forbidden = await site({ "/robots.txt": text("User-agent: *\nDisallow: /sitemap.xml\n"), "/": page("Accueil"), "/sitemap.xml": xml(sitemap("/tarifs")) });
    expect(kinds(await readerFor().reader.read(`http://${WWW}:${forbidden.port}`))).toEqual(["home /"]);
    expect(forbidden.paths()).toEqual(["/robots.txt", "/"]);
  });

  it("deux adresses pour un même contenu, ou une page qui reprend le texte de l'accueil : lues une seule fois", async () => {
    const same = page("Sophrologie");
    const home = page("Accueil", { links: [["/sophrologie", "Sophrologie"], ["/sophrologie-lyon", "Sophrologie à Lyon"], ["/hypnose", "Hypnose"], ["/tarifs/", "Tarifs"], ["/tarifs/index.html", "Nos tarifs"], ["/tarifs#grille", "Grille"]] });
    const server = await site({ "/": home, "/sophrologie": same, "/sophrologie-lyon": same, "/hypnose": home, "/tarifs/": page("Tarifs") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /", "specialty /sophrologie", "pricing /tarifs/"]);
    expect(outcome.skipped).toEqual({ robots: 0, failed: 0 });
    expect(server.paths().filter((path) => path.startsWith("/tarifs"))).toEqual(["/tarifs/"]);
  });

  it("une page vide (coquille JavaScript) ou qui n'est pas du HTML : comptée en échec", async () => {
    const server = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": html(`<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`), "/sophrologie": { headers: { "content-type": "application/pdf" }, body: "%PDF-1.7" }, "/tarifs": page("Tarifs") });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(kinds(outcome)).toEqual(["home /", "pricing /tarifs"]);
    expect(outcome.skipped.failed).toBe(3);
  });
});

// ─── Échecs ──────────────────────────────────────────────────────────────────

describe("échecs de lecture", () => {
  it("l'adresse ne mène pas à une page web : « not_html »", async () => {
    for (const reply of [{ headers: { "content-type": "application/pdf" }, body: "%PDF-1.7" }, { headers: { "content-type": "application/json" }, body: "{}" }, { headers: { "content-type": "image/jpeg" }, body: "JFIF" }, { body: "sans type" }] as Reply[]) {
      const server = await site({ "/": reply });
      expect(await readerFor().reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "not_html" });
    }
  });

  it("page d'accueil trop lourde : « too_large »", async () => {
    const server = await site({ "/": html(`<html><body><p>${"a".repeat(READER_DEFAULTS.pageBytes)}</p></body></html>`) });
    expect(await readerFor().reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "too_large" });
    expect(READER_DEFAULTS.pageBytes).toBe(5 * 1024 * 1024);
  });

  it("page d'accueil fabriquée pour épuiser l'analyseur (imbrication ou nombre de balises démesurés) : « too_large », sans attente", async () => {
    const traps = { imbrication: `<html><body>${"<div>".repeat(300_000)}fond`, balises: `<html><body>${"<p>".repeat(300_000)}`, "début de page": `${"<div>".repeat(30_000)}<p>fond</p>` };
    for (const [label, body] of Object.entries(traps)) {
      const server = await site({ "/": html(body) });
      const started = Date.now();
      const outcome = await readerFor().reader.read(`http://${WWW}:${server.port}`);
      expect(outcome, label).toMatchObject({ ok: false, error: "too_large" });
      expect((outcome as { detail?: string }).detail, label).toContain("trop complexe");
      expect(Date.now() - started, label).toBeLessThan(5_000);
    }
  });

  it("page intérieure fabriquée pour épuiser l'analyseur : écartée, les autres pages sont lues", async () => {
    const server = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": html(`<html><body><h1>À propos</h1>${"<div>".repeat(200_000)}`), "/sophrologie": page("Sophrologie"), "/tarifs": html(`<html><body>${"<br>".repeat(250_000)}`), "/contact": page("Contact") });
    const started = Date.now();
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.pages.map((entry) => new URL(entry.url).pathname)).toEqual(["/", "/sophrologie", "/contact"]);
    expect(outcome.skipped).toEqual({ robots: 0, failed: 2 });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("entités du site lu : décodées dans les textes et les faits rendus", async () => {
    const home = `<!doctype html><html lang="fr"><head><title>Ost&eacute;opathe &agrave; Lyon &#8211; Cabinet Test</title><meta name="description" content="Cabinet d&#39;ost&eacute;opathie &amp; de bien-&ecirc;tre"></head><body><main><h1>L&rsquo;ost&eacute;opathie pour tous</h1><p>${"Une s&eacute;ance dure une heure &amp; se d&eacute;roule au cabinet. ".repeat(12)}</p><a href="https://www.doctolib.fr/osteopathe/lyon/test?utm_source=site&amp;pid=1">Prendre rendez-vous</a><a href="tel:+33472000000">04&nbsp;72&nbsp;00&nbsp;00&nbsp;00</a></main></body></html>`;
    const server = await site({ "/": html(home) });
    const outcome = ok(await readerFor().reader.read(`http://${WWW}:${server.port}`));
    expect(outcome.pages[0]).toMatchObject({ title: "Ostéopathe à Lyon – Cabinet Test", description: "Cabinet d'ostéopathie & de bien-être", headings: ["L’ostéopathie pour tous"] });
    expect(outcome.pages[0]!.text).toContain("Une séance dure une heure & se déroule au cabinet.");
    expect(outcome.pages[0]!.text).not.toMatch(/&[a-z#]/i);
    expect(outcome.pages[0]!.text.endsWith("Prendre rendez-vous 04 72 00 00 00")).toBe(true);
    expect(outcome.facts.phones).toHaveLength(1);
    expect(outcome.facts.bookingLinks?.[0]?.url).toBe("https://www.doctolib.fr/osteopathe/lyon/test?pid=1");
  });

  it("trop peu de texte sur l'ensemble des pages : « empty », avec le compte dans le détail", async () => {
    const shell = await site({ "/": html(`<html><head><title>Mon cabinet</title></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`) });
    expect(await readerFor().reader.read(`http://${WWW}:${shell.port}`)).toEqual({ ok: false, error: "empty", detail: "0 caractères lus sur 1 page" });
    const short = await site({ "/": html(`<html><body><h1>Cabinet</h1><p>Bienvenue.</p><a href="/contact">Contact</a></body></html>`), "/contact": html(`<html><body><h1>Contact</h1><p>Appelez-moi.</p></body></html>`) });
    expect(await readerFor().reader.read(`http://${WWW}:${short.port}`)).toMatchObject({ ok: false, error: "empty", detail: "46 caractères lus sur 2 pages" });
  });

  it(`le seuil est celui du contrat : ${EXTERNAL_SITE_LIMITS.minChars} caractères, toutes pages confondues`, async () => {
    const body = (length: number): Reply => html(`<html><body><p>${"a".repeat(length)}</p></body></html>`);
    const below = await site({ "/": body(EXTERNAL_SITE_LIMITS.minChars - 1) });
    expect(await readerFor().reader.read(`http://${WWW}:${below.port}`)).toMatchObject({ ok: false, error: "empty" });
    const exact = await site({ "/": body(EXTERNAL_SITE_LIMITS.minChars) });
    expect((await readerFor().reader.read(`http://${WWW}:${exact.port}`)).ok).toBe(true);
  });

  it("site muet : « timeout » au délai d'une requête (10 s par défaut)", async () => {
    expect(READER_DEFAULTS.requestTimeoutMs).toBe(10_000);
    const server = await site({ "/": { hang: true } });
    const started = Date.now();
    expect(await readerFor({ requestTimeoutMs: 150 }).reader.read(`http://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("durée totale écoulée avant l'accueil : « timeout » ; après : les pages déjà lues sont rendues", async () => {
    expect(READER_DEFAULTS.deadlineMs).toBe(45_000);
    const slowHome = await site({ "/": () => ({ ...page("Accueil"), delayMs: 400 }) });
    const started = Date.now();
    expect(await readerFor().reader.read(`http://${WWW}:${slowHome.port}`, { deadlineMs: 120 })).toMatchObject({ ok: false, error: "timeout" });
    expect(Date.now() - started).toBeLessThan(1_000);

    const slowPages = await site({ "/": page("Accueil", { links: MENU }), "/a-propos": page("À propos"), "/sophrologie": () => ({ ...page("Sophrologie"), delayMs: 1_500 }), "/tarifs": () => ({ ...page("Tarifs"), delayMs: 1_500 }), "/contact": page("Contact") });
    const partial = ok(await readerFor({ concurrency: 1 }).reader.read(`http://${WWW}:${slowPages.port}`, { deadlineMs: 500 }));
    expect(kinds(partial)).toEqual(["home /", "about /a-propos"]);
    expect(partial.skipped.failed).toBe(1);
    expect(slowPages.paths()).not.toContain("/contact");
  });

  it("interruption par l'appelant : « internal », sans requête si elle précède la lecture", async () => {
    const server = await site({ "/": () => ({ ...page("Accueil"), delayMs: 400 }) });
    const before = await readerFor().reader.read(`http://${WWW}:${server.port}`, { signal: AbortSignal.abort() });
    expect(before).toMatchObject({ ok: false, error: "internal" });
    expect(server.requests).toHaveLength(0);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 80);
    const during = await readerFor().reader.read(`http://${WWW}:${server.port}`, { signal: controller.signal });
    expect(during).toMatchObject({ ok: false, error: "internal", detail: "lecture interrompue" });
  });

  it("adresse refusée par la politique : « unsafe », sans aucune requête", async () => {
    const server = await site({ "/": page("Accueil") });
    const { reader, policy } = readerFor();
    for (const url of [`http://127.0.0.1:${server.port}`, `http://[::1]:${server.port}/`, `http://praticien:secret@${WWW}:${server.port}`, `ftp://${WWW}/`, "http://localhost/", "http://intranet/", "pas une adresse", ""]) {
      expect(await reader.read(url), url).toMatchObject({ ok: false, error: "unsafe" });
    }
    expect(server.requests).toHaveLength(0);
    expect(policy.resolve.calls).toEqual([]);
  });

  it("hôte qui mène à une adresse interne : « unsafe »", async () => {
    for (const internal of ["10.0.0.5", "169.254.169.254", "192.168.1.10", "127.0.0.2", "::1", "fd00:ec2::254", "::ffff:10.0.0.5", "::ffff:169.254.169.254"]) {
      const { reader } = readerFor({ hosts: { [WWW]: internal, [BARE]: internal } });
      expect(await reader.read(`http://${WWW}:8099`), internal).toMatchObject({ ok: false, error: "unsafe" });
    }
  });

  it("ne lève jamais et rend toujours un code du contrat", async () => {
    const { reader } = readerFor({ hosts: {} });
    for (const input of [undefined, null, 42, {}, "https://", "http://[", "javascript:alert(1)", "\u0000"]) {
      const outcome = await reader.read(input as unknown as string);
      expect(outcome.ok).toBe(false);
      expect(!outcome.ok && isExternalReadError(outcome.error)).toBe(true);
    }
  });

  it("homeFailure : tout échec de récupération a son code de lecture", () => {
    const cases: Record<string, string> = { bad_url: "unsafe", bad_scheme: "unsafe", credentials: "unsafe", bad_port: "unsafe", ip_literal: "unsafe", bad_host: "unsafe", private_address: "unsafe", offsite: "redirect", robots: "robots", blocked: "blocked", bad_type: "not_html", too_large: "too_large", timeout: "timeout", deadline: "timeout", aborted: "internal", dns: "unreachable", connect: "unreachable", tls: "unreachable", too_many_redirects: "unreachable", bad_redirect: "unreachable", network: "unreachable" };
    for (const [code, error] of Object.entries(cases)) {
      const failure = homeFailure(new SafeFetchError(code as SafeFetchError["code"], "motif"));
      expect(failure.error, code).toBe(error);
      expect(isExternalReadError(failure.error)).toBe(true);
    }
    expect(homeFailure(new SafeFetchError("offsite", "hors du site", "https://www.autre-site.fr"))).toEqual({ error: "redirect", detail: "redirection vers https://www.autre-site.fr" });
  });
});

// ─── https et politique de production ────────────────────────────────────────

describe("https", () => {
  it("lecture complète d'un site https local : mêmes contrôles, mêmes résultats", async () => {
    const certificate = selfSignedCertificate([WWW, BARE]);
    const server: TestServer = await site(
      { [`${BARE}/`]: () => redirect(`https://${WWW}:${server.port}/`), [`${WWW}/`]: page("Accueil", { links: MENU }), [`${WWW}/tarifs`]: page("Tarifs"), [`${WWW}/contact`]: page("Contact") },
      certificate,
    );
    const policy = localPolicy(HOSTS, { ca: certificate.cert });
    const outcome = ok(await createLiveWebsiteReader({ userAgent: UA, policy, minIntervalMs: 0 }).read(`https://${BARE}:${server.port}`));
    expect(outcome.url).toBe(`https://${WWW}:${server.port}`);
    expect(kinds(outcome)).toEqual(["home /", "pricing /tarifs", "contact /contact"]);
  });

  it("certificat non reconnu : « unreachable » (l'autre écriture est essayée, en vain)", async () => {
    const certificate = selfSignedCertificate([WWW, BARE]);
    const server = await site({ "/": page("Accueil") }, certificate);
    const { reader } = readerFor();
    expect(await reader.read(`https://${WWW}:${server.port}`)).toMatchObject({ ok: false, error: "unreachable" });
    expect(server.requests).toHaveLength(0);
  });

  it("certificat valable pour « www. » seulement : le domaine nu échoue, l'essai avec « www. » aboutit", async () => {
    const certificate = selfSignedCertificate([WWW]);
    const server = await site({ "/": page("Accueil", { links: MENU }), "/tarifs": page("Tarifs") }, certificate);
    const policy = localPolicy(HOSTS, { ca: certificate.cert });
    const outcome = ok(await createLiveWebsiteReader({ userAgent: UA, policy, minIntervalMs: 0 }).read(`https://${BARE}:${server.port}`));
    expect(outcome.url).toBe(`https://${WWW}:${server.port}`);
    expect(server.requests.every((request) => request.host === WWW)).toBe(true);
  });
});

describe("lecteur de production (createWebsiteReader)", () => {
  it("refuse sans aucune requête tout ce qui n'est pas une adresse https publique sur le port par défaut", async () => {
    const reader = createWebsiteReader({});
    expect(reader.mode).toBe("live");
    const refused = ["http://www.mon-cabinet.fr", "https://www.mon-cabinet.fr:8443", "https://praticien:secret@www.mon-cabinet.fr", "https://127.0.0.1", "https://169.254.169.254/latest/meta-data/", "https://[::1]", "https://2130706433", "https://localhost", "https://intranet", "https://serveur.internal", "https://imprimante.local", "ftp://www.mon-cabinet.fr", "file:///etc/passwd"];
    for (const url of refused) expect(await reader.read(url), url).toMatchObject({ ok: false, error: "unsafe" });
  });

  it("aucune variable d'environnement n'assouplit la politique réseau", async () => {
    const env = { EXTERNAL_SITE_ALLOW_PRIVATE: "1", EXTERNAL_SITE_ALLOW_HTTP: "1", EXTERNAL_SITE_POLICY: "none", NODE_TLS_REJECT_UNAUTHORIZED: "0", NODE_ENV: "development", EXTERNAL_SITE_BOT_UA: "site-reader-test/0.1" } as unknown as NodeJS.ProcessEnv;
    const reader = createWebsiteReader(env);
    for (const url of ["http://www.mon-cabinet.fr", "https://127.0.0.1", "https://localhost", "https://www.mon-cabinet.fr:8080"]) expect(await reader.read(url), url).toMatchObject({ ok: false, error: "unsafe" });
  });
});

describe("identité du robot", () => {
  it("par défaut : nom du contrat, version, adresse de la page du robot", () => {
    expect(websiteUserAgent({})).toBe(`${EXTERNAL_BOT_NAME}/1.0 (+${DEFAULT_BOT_PAGE_URL})`);
    expect(DEFAULT_BOT_PAGE_URL).toBe("https://www.harmony-web.fr/robot");
    expect(websiteUserAgent({})).toBe("HarmonyBot/1.0 (+https://www.harmony-web.fr/robot)");
  });

  it("EXTERNAL_SITE_BOT_URL : autre adresse de la page du robot, si elle est valide", () => {
    expect(websiteUserAgent({ EXTERNAL_SITE_BOT_URL: "https://preprod.exemple.fr/robot" })).toBe(`${EXTERNAL_BOT_NAME}/1.0 (+https://preprod.exemple.fr/robot)`);
    expect(websiteUserAgent({ EXTERNAL_SITE_BOT_URL: "  https://preprod.exemple.fr/robot#ancre  " })).toBe(`${EXTERNAL_BOT_NAME}/1.0 (+https://preprod.exemple.fr/robot)`);
    for (const invalid of ["", "http://exemple.fr/robot", "exemple.fr/robot", "https://u:p@exemple.fr/robot", "javascript:alert(1)", `https://exemple.fr/${"x".repeat(300)}`, "https://exemple.fr/robot\r\nX-Injecte: 1"]) {
      expect(websiteUserAgent({ EXTERNAL_SITE_BOT_URL: invalid }), invalid).toBe(`${EXTERNAL_BOT_NAME}/1.0 (+${DEFAULT_BOT_PAGE_URL})`);
    }
  });

  it("EXTERNAL_SITE_BOT_UA : identité entière remplacée — jamais par celle d'un navigateur, jamais par un en-tête invalide", () => {
    expect(websiteUserAgent({ EXTERNAL_SITE_BOT_UA: "site-reader-test/0.1" })).toBe("site-reader-test/0.1");
    expect(websiteUserAgent({ EXTERNAL_SITE_BOT_UA: "  LecteurPreprod/2.0 (+https://preprod.exemple.fr/robot)  ", EXTERNAL_SITE_BOT_URL: "https://ignore.exemple.fr/" })).toBe("LecteurPreprod/2.0 (+https://preprod.exemple.fr/robot)");
    const browsers = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; MonRobot/1.0; +https://exemple.fr/robot)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "Chrome/130.0",
      "Safari/605.1.15",
      "Firefox/131.0",
      "Edg/130.0",
      "Opera/9.80",
    ];
    const fallback = `${EXTERNAL_BOT_NAME}/1.0 (+${DEFAULT_BOT_PAGE_URL})`;
    for (const browser of browsers) expect(websiteUserAgent({ EXTERNAL_SITE_BOT_UA: browser }), browser).toBe(fallback);
    for (const invalid of ["", "  ", "ab", "Robot\r\nX-Injecte: 1", "Robot\nSuite", "Robôt/1.0", "x".repeat(201)]) expect(websiteUserAgent({ EXTERNAL_SITE_BOT_UA: invalid }), JSON.stringify(invalid)).toBe(fallback);
  });

  it("l'identité choisie est bien celle envoyée au site", async () => {
    const server = await site({ "/": page("Accueil") });
    const reader = createLiveWebsiteReader({ userAgent: websiteUserAgent({ EXTERNAL_SITE_BOT_UA: "site-reader-test/0.1" }), policy: localPolicy(HOSTS), minIntervalMs: 0 });
    await reader.read(`http://${WWW}:${server.port}`);
    expect(server.requests.map((request) => request.headers["user-agent"])).toEqual(["site-reader-test/0.1", "site-reader-test/0.1", "site-reader-test/0.1"]);
  });
});
