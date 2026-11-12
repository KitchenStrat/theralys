import type { SiteTheme } from "@theralys/shared";
import { describe, expect, it } from "vitest";
import { isCrawlable, isIndexable, NOINDEX, robotsMetadata, robotsTxt, type IndexedSite } from "./indexing";

type ExternalSite = SiteTheme["externalSite"];

const theme = (externalSite?: ExternalSite): SiteTheme => ({
  preset: "sauge",
  fontPreset: "elegant",
  ...(externalSite ? { externalSite } : {}),
});

const client = (externalSite?: ExternalSite, domain: string | null = "claire-sophrologie.fr"): IndexedSite => ({
  type: "client",
  theme: theme(externalSite),
  domain,
});
const demo = (externalSite?: ExternalSite): IndexedSite => ({ type: "demo", theme: theme(externalSite), domain: null });

/** Le propre site du client est la référence des outils. */
const reference = (url = "https://www.mon-cabinet.fr", keepHostedIndexed?: boolean): ExternalSite => ({
  url,
  active: true,
  ...(keepHostedIndexed === undefined ? {} : { keepHostedIndexed }),
});

const ALLOW_WITH_SITEMAP = "User-agent: *\nAllow: /\n\nSitemap: https://claire-sophrologie.fr/sitemap.xml\n";
const ALLOW = "User-agent: *\nAllow: /\n";
const DISALLOW = "User-agent: *\nDisallow: /\n";

describe("isIndexable", () => {
  it("un site client est indexé, une démo jamais", () => {
    expect(isIndexable(client())).toBe(true);
    expect(isIndexable(client(undefined, null))).toBe(true);
    expect(isIndexable(demo())).toBe(false);
  });

  it("site du client devenu la référence : le site hébergé n'est plus indexé", () => {
    expect(isIndexable(client(reference()))).toBe(false);
    expect(isIndexable(client(reference("https://www.mon-cabinet.fr", false)))).toBe(false);
    // Site hébergé sans domaine à lui (servi sous l'hôte des démos) : masqué aussi
    expect(isIndexable(client(reference(), null))).toBe(false);
  });

  it("le praticien peut demander à garder le site hébergé visible", () => {
    expect(isIndexable(client(reference("https://www.mon-cabinet.fr", true)))).toBe(true);
  });

  it("site du client connecté mais pas encore la référence : rien ne change", () => {
    expect(isIndexable(client({ url: "https://www.mon-cabinet.fr", active: false }))).toBe(true);
    // Réglage inexploitable (adresse refusée par la validation) : il ne masque rien
    expect(isIndexable(client({ url: "pas une adresse", active: true }))).toBe(true);
  });

  it("une démo reste non indexée quel que soit le réglage", () => {
    expect(isIndexable(demo(reference("https://www.mon-cabinet.fr", true)))).toBe(false);
    expect(isIndexable(demo({ url: "https://www.mon-cabinet.fr", active: false }))).toBe(false);
  });
});

describe("isIndexable — le domaine du site hébergé est celui de l'adresse connectée", () => {
  it("le client a fait pointer ce domaine vers le site hébergé : il reste indexé", () => {
    expect(isIndexable(client(reference("https://claire-sophrologie.fr")))).toBe(true);
    // « www. » ignoré d'un côté comme de l'autre, chemin de l'adresse connectée ignoré
    expect(isIndexable(client(reference("https://www.claire-sophrologie.fr")))).toBe(true);
    expect(isIndexable(client(reference("https://claire-sophrologie.fr"), "www.claire-sophrologie.fr"))).toBe(true);
    expect(isIndexable(client(reference("https://www.claire-sophrologie.fr/cabinet")))).toBe(true);
    expect(isIndexable(client(reference("https://Claire-Sophrologie.FR"), "claire-sophrologie.fr"))).toBe(true);
  });

  it("un autre domaine, même voisin, ne lève pas le masquage", () => {
    expect(isIndexable(client(reference("https://www.mon-cabinet.fr")))).toBe(false);
    expect(isIndexable(client(reference("https://blog.claire-sophrologie.fr")))).toBe(false);
    expect(isIndexable(client(reference("https://claire-sophrologie.fr"), "rdv.claire-sophrologie.fr"))).toBe(false);
    expect(isIndexable(client(reference("https://claire-sophrologie.com")))).toBe(false);
    // Domaine du site hébergé illisible : le masquage reste en place
    expect(isIndexable(client(reference("https://claire-sophrologie.fr"), "pas un domaine"))).toBe(false);
  });

  it("la règle ne rend jamais une démo indexable", () => {
    expect(isIndexable({ type: "demo", theme: theme(reference("https://claire-sophrologie.fr")), domain: "claire-sophrologie.fr" })).toBe(false);
  });
});

describe("isCrawlable", () => {
  it("tout site client, même masqué ; jamais une démo", () => {
    expect(isCrawlable(client())).toBe(true);
    expect(isCrawlable(client(reference()))).toBe(true);
    expect(isCrawlable(demo())).toBe(false);
  });
});

describe("robotsMetadata", () => {
  it("noindex, nofollow pour un site non indexable, rien sinon", () => {
    expect(NOINDEX).toEqual({ index: false, follow: false });
    expect(robotsMetadata(demo())).toEqual({ index: false, follow: false });
    expect(robotsMetadata(client(reference()))).toEqual({ index: false, follow: false });
    expect(robotsMetadata(client())).toBeUndefined();
    expect(robotsMetadata(client(reference("https://www.mon-cabinet.fr", true)))).toBeUndefined();
    expect(robotsMetadata(client(reference("https://www.claire-sophrologie.fr")))).toBeUndefined();
  });
});

describe("robotsTxt", () => {
  const HOST = "claire-sophrologie.fr";

  it("site client indexé : parcours autorisé, plan du site annoncé", () => {
    expect(robotsTxt(client(), HOST)).toBe(ALLOW_WITH_SITEMAP);
    expect(robotsTxt(client(reference("https://www.mon-cabinet.fr", true)), HOST)).toBe(ALLOW_WITH_SITEMAP);
    expect(robotsTxt(client(reference("https://www.claire-sophrologie.fr")), HOST)).toBe(ALLOW_WITH_SITEMAP);
  });

  it("site client masqué : parcours toujours autorisé (le noindex doit pouvoir être lu), sans plan du site", () => {
    const text = robotsTxt(client(reference()), HOST);
    expect(text).toBe(ALLOW);
    expect(text).not.toContain("Disallow");
    expect(text).not.toContain("Sitemap");
  });

  it("démo, ou aucun site sur cet hôte (hôte des démos) : tout est interdit", () => {
    expect(robotsTxt(demo(), "demo.harmony-web.fr")).toBe(DISALLOW);
    expect(robotsTxt(demo(reference()), "demo.harmony-web.fr")).toBe(DISALLOW);
    expect(robotsTxt(null, "demo.harmony-web.fr")).toBe(DISALLOW);
    expect(robotsTxt(undefined, "inconnu.fr")).toBe(DISALLOW);
  });
});
