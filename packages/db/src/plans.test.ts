import { describe, expect, it } from "vitest";
import {
  OFFERED_PLANS,
  PLANS,
  canAddMotifPage,
  hasAcademy,
  hasBlog,
  hasKeywordResearch,
  hasSearchConsole,
  motifPagesAllowance,
  normalizePlan,
} from "./plans";

describe("gating des formules (offre à 2 formules : Starter / Scale)", () => {
  it("seules Starter et Scale sont proposées à la vente", () => {
    expect(OFFERED_PLANS).toEqual(["starter", "scale"]);
  });

  it("tarifs conformes au pricing", () => {
    expect(PLANS.starter.annualMonthlyPrice).toBe(48);
    expect(PLANS.starter.monthlyPrice).toBe(69);
    expect(PLANS.scale.annualMonthlyPrice).toBe(55);
    expect(PLANS.scale.monthlyPrice).toBe(79);
  });

  it("6 spécialités présentées sur l'accueil, quelle que soit la formule", () => {
    expect(PLANS.starter.homeSpecialties).toBe(6);
    expect(PLANS.scale.homeSpecialties).toBe(6);
  });

  it("pages secondaires : Starter 0, Scale 6", () => {
    expect(motifPagesAllowance("starter")).toBe(0);
    expect(motifPagesAllowance("scale")).toBe(6);
  });

  it("canAddMotifPage respecte la limite", () => {
    expect(canAddMotifPage("starter", 0)).toBe(false);
    expect(canAddMotifPage("scale", 5)).toBe(true);
    expect(canAddMotifPage("scale", 6)).toBe(false);
  });

  it("blog automatisé : Scale uniquement (208/an, 4/sem)", () => {
    expect(hasBlog("starter")).toBe(false);
    expect(hasBlog("scale")).toBe(true);
    expect(PLANS.scale.blogArticlesPerWeek).toBe(4);
    expect(PLANS.scale.blogArticlesPerYear).toBe(208);
  });

  it("suivi des mots-clés réservé à Scale", () => {
    expect(hasSearchConsole("starter")).toBe(false);
    expect(hasSearchConsole("scale")).toBe(true);
  });

  it("outil de recherche de mots-clés et Académie réservés à Scale", () => {
    expect(hasKeywordResearch("starter")).toBe(false);
    expect(hasKeywordResearch("scale")).toBe(true);
    expect(hasAcademy("starter")).toBe(false);
    expect(hasAcademy("scale")).toBe(true);
  });

  it("héritage : l'ancienne formule Boost est servie comme Scale", () => {
    expect(normalizePlan("boost")).toBe("scale");
    expect(normalizePlan("starter")).toBe("starter");
    expect(motifPagesAllowance("boost")).toBe(6);
    expect(hasBlog("boost")).toBe(true);
    expect(hasSearchConsole("boost")).toBe(true);
    expect(hasKeywordResearch("boost")).toBe(true);
    expect(hasAcademy("boost")).toBe(true);
    expect(PLANS.boost.label).toBe("Scale");
  });

  it("inclus dans toutes les formules : avis Google, stats, hébergement", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.googleReviewsSync).toBe(true);
      expect(plan.advancedAnalytics).toBe(true);
      expect(plan.hostingAndDomain).toBe(true);
    }
  });
});
