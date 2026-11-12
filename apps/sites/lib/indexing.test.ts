import type { SiteTheme } from "@theralys/shared";
import { describe, expect, it } from "vitest";
import { isIndexable, NOINDEX, robotsMetadata } from "./indexing";

const theme = (externalSite?: SiteTheme["externalSite"]): SiteTheme => ({
  preset: "sauge",
  fontPreset: "elegant",
  ...(externalSite ? { externalSite } : {}),
});

const client = (externalSite?: SiteTheme["externalSite"]) => ({ type: "client" as const, theme: theme(externalSite) });
const demo = (externalSite?: SiteTheme["externalSite"]) => ({ type: "demo" as const, theme: theme(externalSite) });

describe("isIndexable", () => {
  it("un site client est indexé, une démo jamais", () => {
    expect(isIndexable(client())).toBe(true);
    expect(isIndexable(demo())).toBe(false);
  });

  it("site du client devenu la référence : le site hébergé n'est plus indexé", () => {
    expect(isIndexable(client({ url: "https://www.mon-cabinet.fr", active: true }))).toBe(false);
    expect(isIndexable(client({ url: "https://www.mon-cabinet.fr", active: true, keepHostedIndexed: false }))).toBe(false);
  });

  it("le praticien peut demander à garder le site hébergé visible", () => {
    expect(isIndexable(client({ url: "https://www.mon-cabinet.fr", active: true, keepHostedIndexed: true }))).toBe(true);
  });

  it("site du client connecté mais pas encore la référence : rien ne change", () => {
    expect(isIndexable(client({ url: "https://www.mon-cabinet.fr", active: false }))).toBe(true);
    // Réglage inexploitable (adresse refusée par la validation) : il ne masque rien
    expect(isIndexable(client({ url: "pas une adresse", active: true }))).toBe(true);
  });

  it("une démo reste non indexée quel que soit le réglage", () => {
    expect(isIndexable(demo({ url: "https://www.mon-cabinet.fr", active: true, keepHostedIndexed: true }))).toBe(false);
    expect(isIndexable(demo({ url: "https://www.mon-cabinet.fr", active: false }))).toBe(false);
  });
});

describe("robotsMetadata", () => {
  it("noindex, nofollow pour un site non indexable, rien sinon", () => {
    expect(NOINDEX).toEqual({ index: false, follow: false });
    expect(robotsMetadata(demo())).toEqual({ index: false, follow: false });
    expect(robotsMetadata(client({ url: "https://www.mon-cabinet.fr", active: true }))).toEqual({ index: false, follow: false });
    expect(robotsMetadata(client())).toBeUndefined();
    expect(robotsMetadata(client({ url: "https://www.mon-cabinet.fr", active: true, keepHostedIndexed: true }))).toBeUndefined();
  });
});
