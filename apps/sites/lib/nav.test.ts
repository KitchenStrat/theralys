import { describe, expect, it } from "vitest";
import type { Section } from "@theralys/shared";
import { NAV_ANCHORS, navAnchors } from "./nav";

const HOME: Section[] = [
  { type: "hero", title: "Accueil", paragraphs: [] },
  { type: "about", title: "Qui suis-je", paragraphs: [] },
  { type: "reviews", title: "Avis" },
  { type: "process", title: "Déroulement", steps: [] },
  { type: "faq", title: "Questions", items: [] },
  { type: "contact", title: "Contact" },
];

describe("navAnchors", () => {
  it("propose toutes les ancres quand toutes les sections existent et sont visibles", () => {
    expect(navAnchors(HOME).map((a) => a.href)).toEqual([
      "#a-propos",
      "#avis",
      "#deroulement",
      "#questions",
      "#contact",
    ]);
    expect(navAnchors(HOME).map((a) => a.label)).toEqual([
      "À propos",
      "Avis",
      "Déroulement",
      "Questions",
      "Contact",
    ]);
  });

  it("retire les ancres des sections absentes", () => {
    const sections = HOME.filter((s) => s.type !== "process" && s.type !== "faq");
    expect(navAnchors(sections).map((a) => a.href)).toEqual(["#a-propos", "#avis", "#contact"]);
  });

  it("retire les ancres des sections masquées dans le studio", () => {
    const sections = HOME.map((s) => (s.type === "reviews" ? { ...s, hidden: true } : s));
    expect(navAnchors(sections).map((a) => a.href)).toEqual([
      "#a-propos",
      "#deroulement",
      "#questions",
      "#contact",
    ]);
  });

  it("respecte l'ordre de la navigation, pas celui des sections", () => {
    const sections = [...HOME].reverse();
    expect(navAnchors(sections).map((a) => a.type)).toEqual(NAV_ANCHORS.map((a) => a.type));
  });

  it("sans accueil, aucune ancre", () => {
    expect(navAnchors(null)).toEqual([]);
    expect(navAnchors(undefined)).toEqual([]);
    expect(navAnchors([])).toEqual([]);
  });
});
