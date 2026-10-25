import { describe, expect, it } from "vitest";
import { SECTION_ICONS, SECTION_LIMITS, SECTION_LABELS, isSectionType, isSectionVisible } from "./content";
import { SECTION_ICON_CATEGORY, SECTION_ICON_SVG, searchSectionIcons, sectionIconMarkup, sectionIconSvg } from "./icons";

describe("icônes des encarts (données partagées)", () => {
  it("chaque icône a un dessin, une catégorie et un SVG complet ; nom inconnu → cœur", () => {
    for (const name of SECTION_ICONS) {
      expect(SECTION_ICON_SVG[name]).toMatch(/^<(path|circle|rect)/);
      expect(SECTION_ICON_SVG[name]).not.toMatch(/strokeLine|<>|<\/>|\{/);
      expect(SECTION_ICON_CATEGORY[name]).toBeDefined();
    }
    expect(sectionIconSvg("lune", 20, 2)).toContain('width="20" height="20"');
    expect(sectionIconSvg("inconnue")).toContain(SECTION_ICON_SVG.coeur);
    // Clés du prototype : jamais une fonction injectée dans le SVG
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(sectionIconMarkup(name)).toBe(SECTION_ICON_SVG.coeur);
    }
    expect(sectionIconMarkup(undefined)).toBe(SECTION_ICON_SVG.coeur);
  });

  it("recherche insensible aux accents et à la casse, par libellé ou mot-clé, filtrée par catégorie", () => {
    expect(searchSectionIcons("")).toEqual([...SECTION_ICONS]);
    expect(searchSectionIcons("SOMMEIL")).toEqual(["lune"]);
    expect(searchSectionIcons("vertebres")).toEqual(["colonne"]);
    expect(searchSectionIcons("tarif")).toEqual(["euro"]);
    expect(searchSectionIcons("", "pratique")).toEqual(["carte", "maison", "calendrier", "horloge", "euro"]);
    expect(searchSectionIcons("coeur", "pratique")).toEqual([]);
  });
});

describe("visibilité, libellés et limites des sections", () => {
  it("isSectionVisible : masquée seulement avec hidden === true", () => {
    expect(isSectionVisible({})).toBe(true);
    expect(isSectionVisible({ hidden: false })).toBe(true);
    expect(isSectionVisible({ hidden: true })).toBe(false);
  });

  it("un libellé par type de section, limites positives", () => {
    expect(Object.keys(SECTION_LABELS).sort()).toEqual(
      ["about", "contact", "cta", "faq", "future", "hero", "highlights", "process", "reviews", "richText", "specialties"].sort(),
    );
    expect(Object.values(SECTION_LIMITS).every((n) => n > 0)).toBe(true);
    expect(isSectionType("faq")).toBe(true);
    expect(isSectionType("toString")).toBe(false);
    expect(isSectionType(42)).toBe(false);
  });
});
