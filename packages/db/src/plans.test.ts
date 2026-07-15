import { describe, expect, it } from "vitest";
import { PLANS, canAddMotifPage, hasBlog, hasSearchConsole, motifPagesAllowance } from "./plans";

describe("gating des formules (source : pricing theralys-web.fr)", () => {
  it("tarifs conformes au pricing", () => {
    expect(PLANS.starter.annualMonthlyPrice).toBe(48);
    expect(PLANS.starter.monthlyPrice).toBe(69);
    expect(PLANS.boost.annualMonthlyPrice).toBe(55);
    expect(PLANS.boost.monthlyPrice).toBe(79);
    expect(PLANS.scale.annualMonthlyPrice).toBe(62);
    expect(PLANS.scale.monthlyPrice).toBe(89);
  });

  it("pages secondaires : 0 / 3 / 6", () => {
    expect(motifPagesAllowance("starter")).toBe(0);
    expect(motifPagesAllowance("boost")).toBe(3);
    expect(motifPagesAllowance("scale")).toBe(6);
  });

  it("canAddMotifPage respecte la limite", () => {
    expect(canAddMotifPage("starter", 0)).toBe(false);
    expect(canAddMotifPage("boost", 2)).toBe(true);
    expect(canAddMotifPage("boost", 3)).toBe(false);
    expect(canAddMotifPage("scale", 5)).toBe(true);
    expect(canAddMotifPage("scale", 6)).toBe(false);
  });

  it("blog automatisé : 104/an (2/sem) pour Boost, 208/an (4/sem) pour Scale", () => {
    expect(hasBlog("starter")).toBe(false);
    expect(PLANS.boost.blogArticlesPerWeek).toBe(2);
    expect(PLANS.boost.blogArticlesPerYear).toBe(104);
    expect(PLANS.scale.blogArticlesPerWeek).toBe(4);
    expect(PLANS.scale.blogArticlesPerYear).toBe(208);
  });

  it("suivi des mots-clés réservé à Boost et Scale", () => {
    expect(hasSearchConsole("starter")).toBe(false);
    expect(hasSearchConsole("boost")).toBe(true);
    expect(hasSearchConsole("scale")).toBe(true);
  });

  it("inclus dans toutes les formules : avis Google, stats, hébergement", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.googleReviewsSync).toBe(true);
      expect(plan.advancedAnalytics).toBe(true);
      expect(plan.hostingAndDomain).toBe(true);
    }
  });
});
