import { describe, expect, it } from "vitest";
import {
  OFFERED_PLANS,
  PLANS,
  canAddMotifPage,
  hasAcademy,
  hasBlog,
  hasGoogleAds,
  hasGoogleProfile,
  hasSearchConsole,
  hasSocialMedia,
  motifPagesAllowance,
  normalizePlan,
  BILLING_PERIODS,
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  BILLING_PERIOD_MONTHS,
  MIN_COMMITMENT_MONTHS,
  STARTER_TARIFF_CHANGED_AT,
  TARIFF_CHANGED_AT,
  commitmentMonths,
  describeSubscriptionPricing,
  periodTotal,
  planPeriods,
  planPrice,
  savedMonths,
  subscriptionPricing,
} from "./plans";

describe("gating des formules (offre à 2 formules : Starter / Scale)", () => {
  it("seules Starter et Scale sont proposées à la vente", () => {
    expect(OFFERED_PLANS).toEqual(["starter", "scale"]);
  });

  it("Scale : tarif du 17 novembre 2026, sur quatre durées (€ TTC par mois)", () => {
    expect(planPeriods("scale")).toEqual(["monthly", "quarterly", "annual", "triennial"]);
    expect(planPrice("scale", "monthly")).toBe(129);
    expect(planPrice("scale", "quarterly")).toBe(107);
    expect(planPrice("scale", "annual")).toBe(86);
    expect(planPrice("scale", "triennial")).toBe(64);
  });

  it("Scale : la somme réglée à chaque échéance (321 € par trimestre, 1 032 € par an, 2 304 € pour 3 ans)", () => {
    expect(periodTotal("scale", "monthly")).toBe(129);
    expect(periodTotal("scale", "quarterly")).toBe(321);
    expect(periodTotal("scale", "annual")).toBe(1032);
    expect(periodTotal("scale", "triennial")).toBe(2304);
  });

  it("Scale : 2 mois d'économies en trimestriel, 4 en annuel, 18 sur 3 ans", () => {
    expect(savedMonths("scale", "monthly")).toBe(0);
    expect(savedMonths("scale", "quarterly")).toBe(2);
    expect(savedMonths("scale", "annual")).toBe(4);
    expect(savedMonths("scale", "triennial")).toBe(18);
  });

  it("Starter : quatre durées à partir de 69 € en mensuel", () => {
    expect(planPeriods("starter")).toEqual(["monthly", "quarterly", "annual", "triennial"]);
    expect(planPrice("starter", "monthly")).toBe(69);
    expect(planPrice("starter", "quarterly")).toBe(57);
    expect(planPrice("starter", "annual")).toBe(46);
    expect(planPrice("starter", "triennial")).toBe(34);
    expect(periodTotal("starter", "monthly")).toBe(69);
    expect(periodTotal("starter", "quarterly")).toBe(171);
    expect(periodTotal("starter", "annual")).toBe(552);
    expect(periodTotal("starter", "triennial")).toBe(1224);
    expect(savedMonths("starter", "monthly")).toBe(0);
    expect(savedMonths("starter", "quarterly")).toBe(2);
    expect(savedMonths("starter", "annual")).toBe(4);
    expect(savedMonths("starter", "triennial")).toBe(18);
  });

  it("les deux formules suivent la même règle : 10 mois réglés sur 12, 8 sur 12, 18 sur 36, à l'euro inférieur", () => {
    for (const plan of ["starter", "scale"] as const) {
      const monthly = planPrice(plan, "monthly")!;
      expect(planPrice(plan, "quarterly")).toBe(Math.floor((monthly * 10) / 12));
      expect(planPrice(plan, "annual")).toBe(Math.floor((monthly * 8) / 12));
      expect(planPrice(plan, "triennial")).toBe(Math.floor((monthly * 18) / 36));
    }
  });

  it("engagement : 12 mois au moins, 36 pour le « 3 ans »", () => {
    expect(MIN_COMMITMENT_MONTHS).toBe(12);
    expect(commitmentMonths("monthly")).toBe(12);
    expect(commitmentMonths("quarterly")).toBe(12);
    expect(commitmentMonths("annual")).toBe(12);
    expect(commitmentMonths("triennial")).toBe(36);
  });

  it("chaque durée a ses mois, son libellé et son rythme d'échéance", () => {
    for (const period of BILLING_PERIODS) {
      expect(BILLING_PERIOD_MONTHS[period]).toBeGreaterThan(0);
      expect(BILLING_PERIOD_LABELS[period]).not.toBe("");
      expect(BILLING_PERIOD_CADENCE[period]).toMatch(/^tous les /);
    }
  });

  it("un abonnement souscrit avant le changement garde son prix, réglé chaque mois", () => {
    const before = new Date(TARIFF_CHANGED_AT.getTime() - 86_400_000);
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "annual", createdAt: before })).toEqual({ monthlyPrice: 55, billedMonths: 1, legacy: true });
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "monthly", createdAt: before })).toEqual({ monthlyPrice: 79, billedMonths: 1, legacy: true });
    expect(subscriptionPricing({ plan: "boost", billingPeriod: "annual", createdAt: before })).toEqual({ monthlyPrice: 55, billedMonths: 1, legacy: true });
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "annual", createdAt: before })).toEqual({ monthlyPrice: 48, billedMonths: 1, legacy: true });
  });

  it("un abonnement souscrit après suit le nouveau tarif, réglé d'avance pour sa durée", () => {
    const after = new Date(TARIFF_CHANGED_AT.getTime() + 86_400_000);
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "monthly", createdAt: after })).toEqual({ monthlyPrice: 129, billedMonths: 1, legacy: false });
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "quarterly", createdAt: after })).toEqual({ monthlyPrice: 107, billedMonths: 3, legacy: false });
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "annual", createdAt: after })).toEqual({ monthlyPrice: 86, billedMonths: 12, legacy: false });
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "triennial", createdAt: after })).toEqual({ monthlyPrice: 64, billedMonths: 36, legacy: false });
  });

  it("Starter : l'annuel souscrit entre les deux changements garde 48 € par mois, réglé à l'année ; ensuite 46 €", () => {
    const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
    const between = new Date((TARIFF_CHANGED_AT.getTime() + STARTER_TARIFF_CHANGED_AT.getTime()) / 2);
    const after = new Date(STARTER_TARIFF_CHANGED_AT.getTime() + 86_400_000);
    expect(TARIFF_CHANGED_AT.getTime()).toBeLessThan(STARTER_TARIFF_CHANGED_AT.getTime());
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "annual", createdAt: between })).toEqual({ monthlyPrice: 48, billedMonths: 12, legacy: false });
    expect(plain(describeSubscriptionPricing({ plan: "starter", billingPeriod: "annual", createdAt: between }))).toBe("Annuel — 48 € TTC par mois, soit 576 € tous les ans");
    // Le mensuel n'a pas bougé, et Scale n'est pas concerné
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "monthly", createdAt: between })).toEqual({ monthlyPrice: 69, billedMonths: 1, legacy: false });
    expect(subscriptionPricing({ plan: "scale", billingPeriod: "annual", createdAt: between })).toEqual({ monthlyPrice: 86, billedMonths: 12, legacy: false });
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "annual", createdAt: after })).toEqual({ monthlyPrice: 46, billedMonths: 12, legacy: false });
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "quarterly", createdAt: after })).toEqual({ monthlyPrice: 57, billedMonths: 3, legacy: false });
    expect(subscriptionPricing({ plan: "starter", billingPeriod: "triennial", createdAt: after })).toEqual({ monthlyPrice: 34, billedMonths: 36, legacy: false });
    expect(plain(describeSubscriptionPricing({ plan: "starter", billingPeriod: "triennial", createdAt: after }))).toBe("3 ans — 34 € TTC par mois, soit 1 224 € tous les 3 ans");
  });

  it("décrit ce que paie un abonnement, ancien et nouveau tarif", () => {
    const before = new Date(TARIFF_CHANGED_AT.getTime() - 86_400_000);
    const after = new Date(TARIFF_CHANGED_AT.getTime() + 86_400_000);
    const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");
    expect(plain(describeSubscriptionPricing({ plan: "scale", billingPeriod: "annual", createdAt: before }))).toBe("Engagement annuel — 55 € par mois (ancien tarif)");
    expect(plain(describeSubscriptionPricing({ plan: "starter", billingPeriod: "monthly", createdAt: before }))).toBe("Mensuel — 69 € par mois (ancien tarif)");
    expect(plain(describeSubscriptionPricing({ plan: "scale", billingPeriod: "monthly", createdAt: after }))).toBe("Mensuel — 129 € TTC par mois");
    expect(plain(describeSubscriptionPricing({ plan: "scale", billingPeriod: "quarterly", createdAt: after }))).toBe("Trimestriel — 107 € TTC par mois, soit 321 € tous les trimestres");
    expect(plain(describeSubscriptionPricing({ plan: "scale", billingPeriod: "annual", createdAt: after }))).toBe("Annuel — 86 € TTC par mois, soit 1 032 € tous les ans");
    expect(plain(describeSubscriptionPricing({ plan: "scale", billingPeriod: "triennial", createdAt: after }))).toBe("3 ans — 64 € TTC par mois, soit 2 304 € tous les 3 ans");
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

  it("Académie réservée à Scale", () => {
    expect(hasAcademy("starter")).toBe(false);
    expect(hasAcademy("scale")).toBe(true);
  });

  it("héritage : l'ancienne formule Boost est servie comme Scale", () => {
    expect(normalizePlan("boost")).toBe("scale");
    expect(normalizePlan("starter")).toBe("starter");
    expect(motifPagesAllowance("boost")).toBe(6);
    expect(hasBlog("boost")).toBe(true);
    expect(hasSearchConsole("boost")).toBe(true);
    expect(hasGoogleAds("boost")).toBe(true);
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

  it("réseaux sociaux : réservés à Scale (et à l'héritage Boost), pas à Starter", () => {
    expect(hasSocialMedia("starter")).toBe(false);
    expect(hasSocialMedia("scale")).toBe(true);
    expect(hasSocialMedia("boost")).toBe(true);
    expect(PLANS.starter.socialMedia).toBe(false);
  });

  it("fiche Google : réservée à Scale (et à l'héritage Boost), pas à Starter", () => {
    expect(hasGoogleProfile("starter")).toBe(false);
    expect(hasGoogleProfile("scale")).toBe(true);
    expect(hasGoogleProfile("boost")).toBe(true);
    expect(PLANS.starter.googleProfile).toBe(false);
  });

  it("Google Ads : réservé à Scale (et à l'héritage Boost), pas à Starter ; plus de drapeau « recherche de mots-clés »", () => {
    expect(hasGoogleAds("starter")).toBe(false);
    expect(hasGoogleAds("scale")).toBe(true);
    expect(PLANS.starter.googleAds).toBe(false);
    expect("keywordResearch" in PLANS.scale).toBe(false);
  });
});
