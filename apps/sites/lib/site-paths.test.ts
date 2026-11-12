import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { homePath, publicPathPrefix } from "./site-paths";

describe("publicPathPrefix", () => {
  it("hôte des démos (clé = slug) : le site vit sous /<slug>", () => {
    expect(publicPathPrefix("claire-dupont-sophrologue-albi")).toBe("/claire-dupont-sophrologue-albi");
    expect(publicPathPrefix("demo")).toBe("/demo");
    expect(publicPathPrefix("cabinet-2")).toBe("/cabinet-2");
  });

  it("domaine du client (clé = domaine, réécrite par le middleware) : pas de préfixe", () => {
    expect(publicPathPrefix("claire-sophrologie.fr")).toBe("");
    expect(publicPathPrefix("www.claire-sophrologie.fr")).toBe("");
    expect(publicPathPrefix("cabinet.example.co.uk")).toBe("");
    // Clé encodée par le routeur : jugée une fois décodée, comme le fait getSiteByKey
    expect(publicPathPrefix("claire-sophrologie%2Efr")).toBe("");
  });

  it("clé mal encodée : jugée telle quelle, sans erreur", () => {
    expect(publicPathPrefix("%E0%A4%A")).toBe("/%E0%A4%A");
    expect(publicPathPrefix("%E0%A4%A.fr")).toBe("");
  });
});

describe("homePath", () => {
  it("accueil : / sur le domaine d'un client, /<slug> sur l'hôte des démos", () => {
    expect(homePath("")).toBe("/");
    expect(homePath("/claire-dupont-sophrologue-albi")).toBe("/claire-dupont-sophrologue-albi");
  });

  it("les ancres de l'accueil s'y ajoutent", () => {
    expect(`${homePath(publicPathPrefix("claire-sophrologie.fr"))}#contact`).toBe("/#contact");
    expect(`${homePath(publicPathPrefix("claire"))}#contact`).toBe("/claire#contact");
  });
});

describe("liens internes — garde-fou", () => {
  // Le défaut corrigé : des liens construits avec la clé du segment [site] (`/${siteKey}/…`), donc préfixés par le
  // domaine sur le site d'un client. Tout lien interne doit partir du préfixe public.
  const root = path.resolve(__dirname, "..");
  const sources = (directory: string): string[] =>
    readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(relative);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
    });

  it("aucune page ni aucun composant ne construit un chemin à partir de la clé du site", () => {
    const files = [...sources("app"), ...sources("components")];
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((file) => /[`"'/]\/?\$\{siteKey\}|["'`]\/["'`]\s*\+\s*siteKey/.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("chaque page qui compose des liens prend son préfixe dans publicPathPrefix", () => {
    const pages = sources("app").filter((file) => /\bprefix\b/.test(readFileSync(path.join(root, file), "utf8")));
    expect(pages.length).toBeGreaterThanOrEqual(7);
    for (const file of pages) {
      expect(readFileSync(path.join(root, file), "utf8"), file).toContain("publicPathPrefix(siteKey)");
    }
  });
});
