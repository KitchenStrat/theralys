import { describe, expect, it } from "vitest";
import {
  OFFERED_PLANS,
  PLANS,
  canAddMotifPage,
  hasBlog,
  hasSearchConsole,
  motifPagesAllowance,
  normalizePlan,
} from "./plans";

describe("gating des formules (offre à 2 formules : Starter / Boost)", () => {
  it("seules Starter et Boost sont proposées à la vente", () => {
    expect(OFFERED_PLANS).toEqual(["starter", "boost"]);
  });

  it("tarifs conformes au pricing", () => {
    expect(PLANS.starter.annualMonthlyPrice).toBe(48);
    expect(PLANS.starter.monthlyPrice).toBe(69);
    expect(PLANS.boost.annualMonthlyPrice).toBe(55);
    expect(PLANS.boost.monthlyPrice).toBe(79);
  });

  it("6 spécialités présentées sur l'accueil, quelle que soit la formule", () => {
    expect(PLANS.starter.homeSpecialties).toBe(6);
    expect(PLANS.boost.homeSpecialties).toBe(6);
  });

  it("pages secondaires : Starter 0, Boost 6", () => {
    expect(motifPagesAllowance("starter")).toBe(0);
    expect(motifPagesAllowance("boost")).toBe(6);
  });

  it("canAddMotifPage respecte la limite", () => {
    expect(canAddMotifPage("starter", 0)).toBe(false);
    expect(canAddMotifPage("boost", 5)).toBe(true);
    expect(canAddMotifPage("boost", 6)).toBe(false);
  });

  it("blog automatisé : Boost uniquement (104/an, 2/sem)", () => {
    expect(hasBlog("starter")).toBe(false);
    expect(hasBlog("boost")).toBe(true);
    expect(PLANS.boost.blogArticlesPerWeek).toBe(2);
    expect(PLANS.boost.blogArticlesPerYear).toBe(104);
  });

  it("suivi des mots-clés réservé à Boost", () => {
    expect(hasSearchConsole("starter")).toBe(false);
    expect(hasSearchConsole("boost")).toBe(true);
  });

  it("héritage : l'ancienne formule Scale est servie comme Boost", () => {
    expect(normalizePlan("scale")).toBe("boost");
    expect(normalizePlan("starter")).toBe("starter");
    expect(motifPagesAllowance("scale")).toBe(6);
    expect(hasBlog("scale")).toBe(true);
    expect(hasSearchConsole("scale")).toBe(true);
    expect(PLANS.scale.label).toBe("Boost");
  });

  it("inclus dans toutes les formules : avis Google, stats, hébergement", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.googleReviewsSync).toBe(true);
      expect(plan.advancedAnalytics).toBe(true);
      expect(plan.hostingAndDomain).toBe(true);
    }
  });
});
