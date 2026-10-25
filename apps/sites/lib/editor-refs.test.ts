import { describe, expect, it } from "vitest";
import type { Section } from "@theralys/shared";
import { composeMotifSections, identityRefs } from "./editor-refs";

const HOME: Section[] = [
  { type: "hero", title: "Accueil", paragraphs: [] },
  { type: "reviews", title: "Ils me font confiance", intro: "Avis vérifiés" },
  { type: "contact", title: "Informations", phone: "06 00 00 00 00" },
];

describe("identityRefs", () => {
  it("donne à chaque section son propre index", () => {
    expect(identityRefs(3)).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
    expect(identityRefs(0)).toEqual([]);
  });
});

describe("composeMotifSections", () => {
  it("insère les avis avant la FAQ et le contact en bas, en marquant les sections héritées", () => {
    const page: Section[] = [
      { type: "hero", title: "Stress", paragraphs: [] },
      { type: "richText", body: "Texte" },
      { type: "faq", title: "Questions", items: [] },
    ];
    const { sections, refs } = composeMotifSections(page, HOME);
    expect(sections.map((s) => s.type)).toEqual(["hero", "richText", "reviews", "faq", "contact"]);
    expect(refs).toEqual([{ index: 0 }, { index: 1 }, { shared: true }, { index: 2 }, { shared: true }]);
    // Les sections héritées sont bien celles de l'accueil (une seule source de vérité)
    expect(sections[2]).toBe(HOME[1]);
    expect(sections[4]).toBe(HOME[2]);
  });

  it("retire les bandeaux CTA sans décaler les index des sections suivantes", () => {
    const page: Section[] = [
      { type: "hero", title: "Sommeil", paragraphs: [] },
      { type: "cta", title: "Prenez rendez-vous", buttonLabel: "RDV" },
      { type: "richText", body: "Texte" },
      { type: "cta", title: "Encore", buttonLabel: "RDV" },
      { type: "faq", title: "Questions", items: [] },
    ];
    const { sections, refs } = composeMotifSections(page, HOME);
    expect(sections.map((s) => s.type)).toEqual(["hero", "richText", "reviews", "faq", "contact"]);
    // richText est à l'index 2 et la FAQ à l'index 4 dans la page d'origine
    expect(refs).toEqual([{ index: 0 }, { index: 2 }, { shared: true }, { index: 4 }, { shared: true }]);
  });

  it("sans FAQ, place les avis après les sections propres", () => {
    const page: Section[] = [
      { type: "hero", title: "Confiance", paragraphs: [] },
      { type: "richText", body: "Texte" },
    ];
    const { sections, refs } = composeMotifSections(page, HOME);
    expect(sections.map((s) => s.type)).toEqual(["hero", "richText", "reviews", "contact"]);
    expect(refs).toEqual([{ index: 0 }, { index: 1 }, { shared: true }, { shared: true }]);
  });

  it("sans accueil, ajoute des avis par défaut et aucun contact", () => {
    const page: Section[] = [{ type: "hero", title: "Confiance", paragraphs: [] }];
    const { sections, refs } = composeMotifSections(page, null);
    expect(sections.map((s) => s.type)).toEqual(["hero", "reviews"]);
    expect(sections[1]).toEqual({ type: "reviews", title: "Ils me font confiance" });
    expect(refs).toEqual([{ index: 0 }, { shared: true }]);
  });

  it("conserve les sections masquées de la page avec leur index (l'aperçu les affiche en barre)", () => {
    const page: Section[] = [
      { type: "hero", title: "Stress", paragraphs: [] },
      { type: "richText", body: "Texte", hidden: true },
      { type: "faq", title: "Questions", items: [] },
    ];
    const { sections, refs } = composeMotifSections(page, HOME);
    expect(sections[1]).toMatchObject({ type: "richText", hidden: true });
    expect(refs[1]).toEqual({ index: 1 });
    expect(refs).toHaveLength(sections.length);
  });
});
