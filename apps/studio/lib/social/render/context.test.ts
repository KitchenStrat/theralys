import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Site } from "@theralys/db";
import type { SiteTheme } from "@theralys/shared";
import { buildRenderContext, domainOf } from "./context";

const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" };

/** Site réduit aux champs dont dépend le domaine imprimé sur les visuels. */
function site(overrides: { domain?: string | null; theme?: SiteTheme } = {}): Site {
  return { id: "site-1", name: "Claire Dupont, sophrologue à Albi", slug: "claire-dupont-sophrologue-albi", domain: null, theme: THEME, ...overrides } as Site;
}

describe("domaine imprimé sur les visuels (dernière page des carrousels)", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.SITES_BASE_URL;
    process.env.SITES_BASE_URL = "https://demo.harmony-web.fr";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.SITES_BASE_URL;
    else process.env.SITES_BASE_URL = previous;
  });

  it("sans site du client : l'adresse du site hébergé, sans protocole", () => {
    expect(domainOf(site())).toBe("demo.harmony-web.fr/claire-dupont-sophrologue-albi");
    expect(domainOf(site({ domain: "claire-dupont.fr" }))).toBe("claire-dupont.fr");
    // Site du client connecté mais pas encore la référence : rien ne change
    const pending = site({ theme: { ...THEME, externalSite: { url: "https://www.mon-cabinet.fr", active: false } } });
    expect(domainOf(pending)).toBe("demo.harmony-web.fr/claire-dupont-sophrologue-albi");
  });

  it("site du client en référence : son adresse, même si le site hébergé a son propre domaine", () => {
    const theme: SiteTheme = { ...THEME, externalSite: { url: "https://www.mon-cabinet.fr", active: true } };
    expect(domainOf(site({ theme }))).toBe("www.mon-cabinet.fr");
    expect(domainOf(site({ theme, domain: "claire-dupont.fr" }))).toBe("www.mon-cabinet.fr");
    expect(buildRenderContext(site({ theme }), null).domain).toBe("www.mon-cabinet.fr");
  });

  it("le contexte de rendu porte ce domaine (il entre dans la clé de cache : changer de référence refait les visuels)", () => {
    const hosted = buildRenderContext(site(), null);
    const own = buildRenderContext(site({ theme: { ...THEME, externalSite: { url: "https://www.mon-cabinet.fr/cabinet", active: true } } }), null);
    expect(hosted.domain).toBe("demo.harmony-web.fr/claire-dupont-sophrologue-albi");
    expect(own.domain).toBe("www.mon-cabinet.fr/cabinet");
    expect(own.brand).toEqual(hosted.brand);
  });
});
