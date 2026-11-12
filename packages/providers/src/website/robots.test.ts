import { describe, expect, it } from "vitest";
import { EXTERNAL_BOT_NAME } from "@theralys/shared";
import { MAX_CRAWL_DELAY_MS, ROBOTS_ABSENT, ROBOTS_UNAVAILABLE, parseRobots, robotsFromResponse } from "./robots";

const ORIGIN = "https://www.mon-cabinet.fr";
const rules = (body: string) => parseRobots(`${ORIGIN}/robots.txt`, body);
const allowed = (body: string, path: string): boolean => rules(body).isAllowed(`${ORIGIN}${path}`);

describe("parseRobots — règles pour notre robot (RFC 9309)", () => {
  it("fichier vide ou sans règle pour nous : tout est permis", () => {
    expect(allowed("", "/")).toBe(true);
    expect(allowed("# rien\n", "/tarifs")).toBe(true);
    expect(allowed("User-agent: AutreRobot\nDisallow: /\n", "/")).toBe(true);
    expect(rules("")).toMatchObject({ source: "file", crawlDelayMs: null, sitemaps: [] });
  });

  it("groupe « * » : interdictions et autorisations, la règle la plus précise l'emporte", () => {
    const body = "User-agent: *\nDisallow: /prive/\nDisallow: /panier\nAllow: /prive/tarifs\n";
    expect(allowed(body, "/")).toBe(true);
    expect(allowed(body, "/a-propos")).toBe(true);
    expect(allowed(body, "/prive/")).toBe(false);
    expect(allowed(body, "/prive/dossier")).toBe(false);
    expect(allowed(body, "/prive/tarifs")).toBe(true);
    expect(allowed(body, "/panier/etape-2")).toBe(false);
  });

  it("à précision égale, l'autorisation l'emporte ; « Disallow: » vide n'interdit rien", () => {
    expect(allowed("User-agent: *\nDisallow: /page\nAllow: /page\n", "/page")).toBe(true);
    expect(allowed("User-agent: *\nDisallow:\n", "/tout")).toBe(true);
  });

  it("site entièrement fermé aux robots", () => {
    const body = "User-agent: *\nDisallow: /\n";
    expect(allowed(body, "/")).toBe(false);
    expect(allowed(body, "/tarifs")).toBe(false);
  });

  it("groupe à notre nom : il remplace le groupe « * », quelle que soit la casse du nom", () => {
    const open = `User-agent: *\nDisallow: /\n\nUser-agent: ${EXTERNAL_BOT_NAME}\nAllow: /\n`;
    expect(allowed(open, "/")).toBe(true);
    expect(allowed(open, "/tarifs")).toBe(true);
    const closed = `User-agent: *\nAllow: /\n\nUser-agent: ${EXTERNAL_BOT_NAME.toLowerCase()}\nDisallow: /\n`;
    expect(allowed(closed, "/")).toBe(false);
    const versioned = `User-agent: ${EXTERNAL_BOT_NAME.toUpperCase()}/1.0\nDisallow: /blog\n`;
    expect(allowed(versioned, "/blog/article")).toBe(false);
    expect(allowed(versioned, "/tarifs")).toBe(true);
  });

  it("plusieurs robots dans un même groupe, plusieurs groupes à notre nom : les règles s'additionnent", () => {
    const shared = `User-agent: GPTBot\nUser-agent: ${EXTERNAL_BOT_NAME}\nUser-agent: CCBot\nDisallow: /\n`;
    expect(allowed(shared, "/")).toBe(false);
    const twice = `User-agent: ${EXTERNAL_BOT_NAME}\nDisallow: /a\n\nUser-agent: ${EXTERNAL_BOT_NAME}\nDisallow: /b\n`;
    expect([allowed(twice, "/a"), allowed(twice, "/b"), allowed(twice, "/c")]).toEqual([false, false, true]);
  });

  it("un site qui ne refuse que des robots d'IA nommés ne nous refuse pas", () => {
    const body = "User-agent: GPTBot\nUser-agent: ClaudeBot\nUser-agent: CCBot\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: *\nDisallow: /wp-admin/\n";
    expect(allowed(body, "/")).toBe(true);
    expect(allowed(body, "/wp-admin/options.php")).toBe(false);
  });

  it("jokers « * » et « $ », paramètres, commentaires et fins de ligne Windows", () => {
    const body = "User-agent: *\r\nDisallow: /*.pdf$   # fichiers\r\nDisallow: /*?s=\r\nDisallow: /brouillon*fin\r\n";
    expect(allowed(body, "/plaquette.pdf")).toBe(false);
    expect(allowed(body, "/plaquette.pdf.html")).toBe(true);
    expect(allowed(body, "/?s=sophrologie")).toBe(false);
    expect(allowed(body, "/brouillon-de-la-fin")).toBe(false);
    expect(allowed(body, "/tarifs")).toBe(true);
  });

  it("les règles valent pour l'origine du fichier : une autre origine n'est jamais « permise » par lui", () => {
    const open = rules("User-agent: *\nAllow: /\n");
    expect(open.isAllowed("https://www.mon-cabinet.fr/tarifs")).toBe(true);
    expect(open.isAllowed("https://mon-cabinet.fr/tarifs")).toBe(false);
    expect(open.isAllowed("http://www.mon-cabinet.fr/tarifs")).toBe(false);
    expect(open.isAllowed("https://www.mon-cabinet.fr:8443/tarifs")).toBe(false);
    expect(open.isAllowed("pas une adresse")).toBe(false);
  });

  it("Crawl-delay : pris pour notre robot ou pour « * », en millisecondes, plafonné", () => {
    expect(rules("User-agent: *\nCrawl-delay: 1\n").crawlDelayMs).toBe(1_000);
    expect(rules("User-agent: *\nCrawl-delay: 0.5\n").crawlDelayMs).toBe(500);
    expect(rules(`User-agent: *\nCrawl-delay: 1\n\nUser-agent: ${EXTERNAL_BOT_NAME}\nCrawl-delay: 2\n`).crawlDelayMs).toBe(2_000);
    expect(rules("User-agent: *\nCrawl-delay: 30\n").crawlDelayMs).toBe(MAX_CRAWL_DELAY_MS);
    expect(MAX_CRAWL_DELAY_MS).toBe(2_000);
    for (const value of ["0", "-3", "beaucoup", ""]) expect(rules(`User-agent: *\nCrawl-delay: ${value}\n`).crawlDelayMs, value).toBeNull();
    expect(rules("User-agent: AutreRobot\nCrawl-delay: 10\n").crawlDelayMs).toBeNull();
  });

  it("plans de site déclarés, où qu'ils soient dans le fichier", () => {
    const body = "Sitemap: https://www.mon-cabinet.fr/sitemap_index.xml\nUser-agent: *\nDisallow: /prive\nsitemap: /plan.xml\n";
    expect(rules(body).sitemaps).toEqual(["https://www.mon-cabinet.fr/sitemap_index.xml", "/plan.xml"]);
  });

  it("contenu qui n'est pas un robots.txt (page HTML servie à sa place) : aucune règle, tout est permis", () => {
    const html = "<!DOCTYPE html><html><head><title>Page introuvable</title></head><body><h1>Oups</h1><p>Disallow: tout ? Non.</p></body></html>";
    expect(allowed(html, "/")).toBe(true);
    expect(allowed(html, "/tarifs")).toBe(true);
  });
});

describe("robotsFromResponse — statut de la réponse", () => {
  const body = "User-agent: *\nDisallow: /prive\n";
  const url = `${ORIGIN}/robots.txt`;

  it("2xx : le fichier est analysé", () => {
    const parsed = robotsFromResponse(url, 200, body);
    expect(parsed.source).toBe("file");
    expect([parsed.isAllowed(`${ORIGIN}/`), parsed.isAllowed(`${ORIGIN}/prive`)]).toEqual([true, false]);
  });

  it("4xx : pas de fichier, rien n'est interdit", () => {
    for (const status of [400, 401, 403, 404, 410]) {
      const parsed = robotsFromResponse(url, status, body);
      expect(parsed, String(status)).toBe(ROBOTS_ABSENT);
      expect(parsed.isAllowed(`${ORIGIN}/prive`)).toBe(true);
    }
  });

  it("5xx (ou tout autre statut) : fichier injoignable, tout est interdit", () => {
    for (const status of [500, 502, 503, 504, 304, 100]) {
      const parsed = robotsFromResponse(url, status, body);
      expect(parsed, String(status)).toBe(ROBOTS_UNAVAILABLE);
      expect(parsed.isAllowed(`${ORIGIN}/`)).toBe(false);
    }
    expect(ROBOTS_UNAVAILABLE.source).toBe("unavailable");
    expect(ROBOTS_ABSENT.source).toBe("absent");
  });
});
