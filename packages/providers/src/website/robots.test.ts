import { describe, expect, it } from "vitest";
import { EXTERNAL_BOT_NAME } from "@theralys/shared";
import robotsParser from "robots-parser";
import { MAX_CRAWL_DELAY_MS, ROBOTS_ABSENT, ROBOTS_MAX_BYTES, ROBOTS_UNAVAILABLE, ROBOTS_URL_MAX, parseRobots, robotsFromResponse } from "./robots";

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

describe("parseRobots — tri des groupes avant l'analyse", () => {
  const US = EXTERNAL_BOT_NAME;

  it("délimitation des groupes : une ligne User-agent qui suit une autre directive ouvre un nouveau groupe", () => {
    // Une directive inconnue entre deux lignes User-agent sépare deux groupes : la règle ne vaut que pour le second
    expect(allowed(`User-agent: ${US}\nFoo: bar\nUser-agent: AutreRobot\nDisallow: /\n`, "/")).toBe(true);
    expect(allowed(`User-agent: AutreRobot\nFoo: bar\nUser-agent: ${US}\nDisallow: /\n`, "/")).toBe(false);
    // Lignes vides, commentaires et lignes sans « : » ne séparent rien
    expect(allowed(`User-agent: AutreRobot\n\n# commentaire\nligne sans deux-points\nUser-agent: ${US}\nDisallow: /prive\n`, "/prive")).toBe(false);
    // Un plan de site entre l'en-tête du groupe et ses règles ne détache pas les règles du groupe
    const split = `User-agent: *\nSitemap: ${ORIGIN}/sitemap.xml\nDisallow: /prive\n`;
    expect(allowed(split, "/prive")).toBe(false);
    expect(rules(split).sitemaps).toEqual([`${ORIGIN}/sitemap.xml`]);
    // Un groupe à notre nom sans aucune règle ne nous soustrait pas au groupe « * »
    expect(allowed(`User-agent: ${US}\nUser-agent: AutreRobot\n\nUser-agent: *\nDisallow: /\n`, "/")).toBe(false);
    expect(allowed(`User-agent: ${US}\nFoo: bar\nUser-agent: *\nDisallow: /\n`, "/")).toBe(false);
    // … alors qu'un groupe à notre nom avec une règle, même vide, le fait
    expect(allowed(`User-agent: ${US}\nDisallow:\n\nUser-agent: *\nDisallow: /\n`, "/")).toBe(true);
    // Numéro de version, casse et espaces du nom
    expect(allowed(`user-agent:   ${US.toUpperCase()}/2.1  \ndisallow: /\n`, "/")).toBe(false);
    expect(allowed(`User-agent: ${US}Bis\nDisallow: /\n`, "/")).toBe(true);
  });

  it("même verdict que l'analyseur seul, sur des fichiers tirés au hasard", () => {
    // Générateur pseudo-aléatoire déterministe (mulberry32)
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
    const LINES = [`User-agent: ${US}`, `user-agent: ${US.toLowerCase()}/1.0`, "User-agent: *", "User-agent: AutreRobot", "User-agent:", "Disallow: /", "Disallow: /prive", "Disallow: /a*b$", "Disallow:", "Allow: /prive/ok", "Allow: /", "Crawl-delay: 1", "Crawl-delay: x", `Sitemap: ${ORIGIN}/s.xml`, "Host: www.mon-cabinet.fr", "Foo: bar", "", "# commentaire", "sans deux-points", ": sans clé", "Disallow: /c # fin", "  Allow :  /d  "];
    const PATHS = ["/", "/prive", "/prive/ok", "/a-xx-b", "/c", "/d", "/autre"];
    for (let seed = 1; seed <= 1_500; seed++) {
      const next = random(seed);
      const body = Array.from({ length: 1 + Math.floor(next() * 14) }, () => LINES[Math.floor(next() * LINES.length)]!).join(next() < 0.5 ? "\n" : "\r\n");
      const reference = robotsParser(`${ORIGIN}/robots.txt`, body);
      const ours = rules(body);
      for (const path of PATHS) expect(ours.isAllowed(`${ORIGIN}${path}`), `graine ${seed}, ${path}\n${body}`).toBe(reference.isAllowed(`${ORIGIN}${path}`, US) === true);
      const delay = reference.getCrawlDelay(US);
      expect(ours.crawlDelayMs, `graine ${seed}\n${body}`).toBe(typeof delay === "number" && Number.isFinite(delay) && delay > 0 ? Math.min(Math.round(delay * 1000), MAX_CRAWL_DELAY_MS) : null);
      expect(ours.sitemaps).toEqual(reference.getSitemaps().slice(0, 10));
    }
  });
});

describe("parseRobots — fichiers piégés", () => {
  const timed = <T>(run: () => T): { value: T; ms: number } => {
    const start = performance.now();
    const value = run();
    return { value, ms: performance.now() - start };
  };

  it("des milliers de robots nommés devant des milliers de règles : analysé sans multiplier les règles", () => {
    // L'analyseur seul recopierait chaque règle pour chaque ligne User-agent du groupe : des centaines de millions d'objets
    const body = `${"User-agent: *\n".repeat(12_000)}${"User-agent: Robot\n".repeat(4_000)}${"Disallow: /prive\n".repeat(12_000)}`;
    expect(body.length).toBeLessThan(ROBOTS_MAX_BYTES);
    const { value, ms } = timed(() => rules(body));
    expect(value.isAllowed(`${ORIGIN}/prive/x`)).toBe(false);
    expect(value.isAllowed(`${ORIGIN}/public`)).toBe(true);
    expect(ms).toBeLessThan(3_000);
  });

  it("règles truffées de jokers et adresse démesurée : l'adresse est tenue pour interdite, sans calcul", () => {
    const pattern = `Disallow: /${"*a".repeat(250_000)}\n`;
    const { value, ms } = timed(() => {
      const parsed = rules(`User-agent: *\n${pattern}`);
      return { short: parsed.isAllowed(`${ORIGIN}/${"a".repeat(150)}`), long: parsed.isAllowed(`${ORIGIN}/${"a".repeat(1_500)}`), huge: parsed.isAllowed(`${ORIGIN}/${"a".repeat(60_000)}`) };
    });
    // Un demi-mégaoctet de règles : seules les adresses courtes y sont confrontées
    expect(value).toEqual({ short: true, long: false, huge: false });
    expect(ms).toBeLessThan(5_000);
  });

  it("fichier ordinaire : toute adresse jusqu'à 2 048 caractères est confrontée aux règles ; au-delà, interdite", () => {
    expect(ROBOTS_URL_MAX).toBe(2_048);
    const parsed = rules("User-agent: *\nDisallow: /prive\n");
    const base = `${ORIGIN}/page?x=`;
    expect(parsed.isAllowed(`${base}${"a".repeat(ROBOTS_URL_MAX - base.length)}`)).toBe(true);
    expect(parsed.isAllowed(`${base}${"a".repeat(ROBOTS_URL_MAX - base.length + 1)}`)).toBe(false);
    expect(rules("").isAllowed(`${base}${"a".repeat(5_000)}`)).toBe(false);
  });

  it("fichier fait de lignes sans fin, de plans de site ou de bruit : analysé en un passage", () => {
    const bodies = [`User-agent: *\nDisallow: /${"x".repeat(500_000)}`, `Sitemap: ${ORIGIN}/s.xml\n`.repeat(12_000), `${":".repeat(500_000)}`, "\r".repeat(500_000), `User-agent: *\n${"Disallow: /a\nAllow: /a\n".repeat(20_000)}`];
    for (const body of bodies) {
      const { value, ms } = timed(() => {
        const parsed = rules(body);
        return { parsed, allowed: parsed.isAllowed(`${ORIGIN}/a/b/c`) };
      });
      expect(typeof value.allowed).toBe("boolean");
      expect(value.parsed.sitemaps.length).toBeLessThanOrEqual(10);
      expect(ms, body.slice(0, 30)).toBeLessThan(3_000);
    }
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
