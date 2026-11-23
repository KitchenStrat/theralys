import { describe, expect, it } from "vitest";
import {
  BILLING_PERIODS,
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  BILLING_PERIOD_MONTHS,
  FORMULAS,
  FORMULA_DEFINITIONS,
  MIN_COMMITMENT_MONTHS,
  OFFERED_PLANS,
  PLANS,
  PLAN_COMPLETE,
  PLAN_SCALE,
  PLAN_SITE,
  canAddMotifPage,
  commitmentMonths,
  describeSubscriptionPricing,
  formulaPrice,
  hasAcademy,
  hasBlog,
  hasFormula,
  hasGoogleAds,
  hasGoogleProfile,
  hasMetaAds,
  hasSearchConsole,
  hasSite,
  hasSocialMedia,
  isPlanId,
  motifPagesAllowance,
  periodTotal,
  planFormulas,
  planFromFormulas,
  planPeriods,
  planPrice,
  pricesFromMonthly,
  savedAmount,
  savedMonths,
  savedPercent,
  subscriptionPricing,
} from "./plans";

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("offre en deux formules indépendantes : Site et Scale", () => {
  it("deux formules, trois choix : Site, Scale, ou les deux", () => {
    expect(FORMULAS).toEqual(["site", "scale"]);
    expect(OFFERED_PLANS).toEqual([PLAN_SITE, PLAN_SCALE, PLAN_COMPLETE]);
    expect(OFFERED_PLANS.map((plan) => PLANS[plan].label)).toEqual(["Site", "Scale", "Site + Scale"]);
  });

  it("ce qui est enregistré : les noms hérités de l'enum, et leur sens d'aujourd'hui", () => {
    expect([PLAN_SITE, PLAN_SCALE, PLAN_COMPLETE]).toEqual(["starter", "boost", "scale"]);
    expect(planFormulas("starter")).toEqual(["site"]);
    expect(planFormulas("boost")).toEqual(["scale"]);
    // Les démos et les comptes d'avant le découpage sont enregistrés « scale » : ils ont tout
    expect(planFormulas("scale")).toEqual(["site", "scale"]);
  });

  it("d'un choix de formules à la valeur enregistrée, et retour", () => {
    expect(planFromFormulas(["site"])).toBe(PLAN_SITE);
    expect(planFromFormulas(["scale"])).toBe(PLAN_SCALE);
    expect(planFromFormulas(["scale", "site"])).toBe(PLAN_COMPLETE);
    expect(planFromFormulas(new Set(["site", "scale"] as const))).toBe(PLAN_COMPLETE);
    expect(planFromFormulas([])).toBeNull();
    for (const plan of OFFERED_PLANS) expect(planFromFormulas(planFormulas(plan))).toBe(plan);
    expect(hasFormula(PLAN_SITE, "site")).toBe(true);
    expect(hasFormula(PLAN_SITE, "scale")).toBe(false);
    expect(hasFormula(PLAN_COMPLETE, "scale")).toBe(true);
    expect(isPlanId("boost")).toBe(true);
    expect(isPlanId("site")).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
  });
});

describe("prix (€ TTC par mois)", () => {
  it("la règle : 10 mois réglés sur 12 en trimestriel, 8 sur 12 en annuel, 18 sur 36 sur 3 ans, à l'euro inférieur", () => {
    expect(pricesFromMonthly(59)).toEqual({ monthly: 59, quarterly: 49, annual: 39, triennial: 29 });
    expect(pricesFromMonthly(89)).toEqual({ monthly: 89, quarterly: 74, annual: 59, triennial: 44 });
  });

  it("Site : 59 € en mensuel, puis 49, 39 et 29 €", () => {
    expect(FORMULA_DEFINITIONS.site.label).toBe("Site");
    expect(BILLING_PERIODS.map((period) => formulaPrice("site", period))).toEqual([59, 49, 39, 29]);
    expect(BILLING_PERIODS.map((period) => planPrice(PLAN_SITE, period))).toEqual([59, 49, 39, 29]);
    // 147 € par trimestre, 468 € par an, 1 044 € pour 3 ans
    expect(BILLING_PERIODS.map((period) => periodTotal(PLAN_SITE, period))).toEqual([59, 147, 468, 1044]);
  });

  it("Scale : 89 € en mensuel, puis 74, 59 et 44 €", () => {
    expect(FORMULA_DEFINITIONS.scale.label).toBe("Scale");
    expect(BILLING_PERIODS.map((period) => formulaPrice("scale", period))).toEqual([89, 74, 59, 44]);
    expect(BILLING_PERIODS.map((period) => planPrice(PLAN_SCALE, period))).toEqual([89, 74, 59, 44]);
    // 222 € par trimestre, 708 € par an, 1 584 € pour 3 ans
    expect(BILLING_PERIODS.map((period) => periodTotal(PLAN_SCALE, period))).toEqual([89, 222, 708, 1584]);
  });

  it("les deux : la somme des deux prix, sur chaque durée", () => {
    expect(BILLING_PERIODS.map((period) => planPrice(PLAN_COMPLETE, period))).toEqual([148, 123, 98, 73]);
    for (const period of BILLING_PERIODS) expect(planPrice(PLAN_COMPLETE, period)).toBe(formulaPrice("site", period) + formulaPrice("scale", period));
    // 369 € par trimestre, 1 176 € par an, 2 628 € pour 3 ans
    expect(BILLING_PERIODS.map((period) => periodTotal(PLAN_COMPLETE, period))).toEqual([148, 369, 1176, 2628]);
  });

  it("chaque choix est proposé sur les quatre durées", () => {
    for (const plan of OFFERED_PLANS) expect(planPeriods(plan)).toEqual(["monthly", "quarterly", "annual", "triennial"]);
  });

  it("économies : 2 mois en trimestriel, 4 en annuel, 18 sur 3 ans, pour chaque choix", () => {
    for (const plan of OFFERED_PLANS) {
      expect(BILLING_PERIODS.map((period) => savedMonths(plan, period))).toEqual([0, 2, 4, 18]);
    }
  });

  it("les mêmes économies en euros sur la durée d'engagement, et en pourcentage du mensuel (jamais surestimé)", () => {
    // Site : (59 − 49) × 12, (59 − 39) × 12, (59 − 29) × 36
    expect(BILLING_PERIODS.map((period) => savedAmount(PLAN_SITE, period))).toEqual([0, 120, 240, 1080]);
    expect(BILLING_PERIODS.map((period) => savedAmount(PLAN_SCALE, period))).toEqual([0, 180, 360, 1620]);
    expect(BILLING_PERIODS.map((period) => savedAmount(PLAN_COMPLETE, period))).toEqual([0, 300, 600, 2700]);
    for (const plan of OFFERED_PLANS) {
      expect(BILLING_PERIODS.map((period) => savedPercent(plan, period))).toEqual([0, 16, 33, 50]);
      // L'économie annoncée est exactement ce qu'on ne paie pas : le mensuel sur l'engagement, moins le prix de la durée
      for (const period of BILLING_PERIODS) {
        const months = commitmentMonths(period);
        expect(savedAmount(plan, period)).toBe((planPrice(plan, "monthly") ?? 0) * months - (planPrice(plan, period) ?? 0) * months);
      }
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
    expect(BILLING_PERIODS).toEqual(["monthly", "quarterly", "annual", "triennial"]);
    expect(BILLING_PERIODS.map((period) => BILLING_PERIOD_MONTHS[period])).toEqual([1, 3, 12, 36]);
    expect(BILLING_PERIODS.map((period) => BILLING_PERIOD_LABELS[period])).toEqual(["Mensuel", "Trimestriel", "Annuel", "3 ans"]);
    expect(BILLING_PERIOD_CADENCE.quarterly).toBe("tous les trimestres");
  });

  it("ce que paie un abonnement : le prix de ses formules, réglé d'avance pour sa durée", () => {
    expect(subscriptionPricing({ plan: PLAN_COMPLETE, billingPeriod: "annual" })).toEqual({ monthlyPrice: 98, billedMonths: 12 });
    expect(subscriptionPricing({ plan: PLAN_SITE, billingPeriod: "monthly" })).toEqual({ monthlyPrice: 59, billedMonths: 1 });
    expect(subscriptionPricing({ plan: PLAN_SCALE, billingPeriod: "triennial" })).toEqual({ monthlyPrice: 44, billedMonths: 36 });
  });

  it("le décrit en une phrase", () => {
    expect(plain(describeSubscriptionPricing({ plan: PLAN_SITE, billingPeriod: "monthly" }))).toBe("Mensuel — 59 € TTC par mois");
    expect(plain(describeSubscriptionPricing({ plan: PLAN_SCALE, billingPeriod: "quarterly" }))).toBe("Trimestriel — 74 € TTC par mois, soit 222 € tous les trimestres");
    expect(plain(describeSubscriptionPricing({ plan: PLAN_COMPLETE, billingPeriod: "annual" }))).toBe("Annuel — 98 € TTC par mois, soit 1 176 € tous les ans");
  });
});

describe("ce qu'ouvre chaque formule", () => {
  it("Site : le site hébergé, ses pages de spécialités, le blog et le suivi des mots-clés", () => {
    expect(hasSite(PLAN_SITE)).toBe(true);
    expect(PLANS[PLAN_SITE].hostingAndDomain).toBe(true);
    expect(PLANS[PLAN_SITE].homeSpecialties).toBe(6);
    expect(motifPagesAllowance(PLAN_SITE)).toBe(6);
    expect(hasBlog(PLAN_SITE)).toBe(true);
    expect(PLANS[PLAN_SITE].blogArticlesPerWeek).toBe(4);
    expect(PLANS[PLAN_SITE].blogArticlesPerYear).toBe(208);
    expect(hasSearchConsole(PLAN_SITE)).toBe(true);
  });

  it("Site seul : aucun des outils de la formule Scale", () => {
    expect(hasSocialMedia(PLAN_SITE)).toBe(false);
    expect(hasGoogleProfile(PLAN_SITE)).toBe(false);
    expect(hasGoogleAds(PLAN_SITE)).toBe(false);
    expect(hasMetaAds(PLAN_SITE)).toBe(false);
    expect(hasAcademy(PLAN_SITE)).toBe(false);
  });

  it("Scale : fiche Google, réseaux sociaux, Google Ads, Meta Ads, Académie", () => {
    expect(hasGoogleProfile(PLAN_SCALE)).toBe(true);
    expect(hasSocialMedia(PLAN_SCALE)).toBe(true);
    expect(hasGoogleAds(PLAN_SCALE)).toBe(true);
    expect(hasMetaAds(PLAN_SCALE)).toBe(true);
    expect(hasAcademy(PLAN_SCALE)).toBe(true);
  });

  it("Scale seul : pas de site hébergé, donc ni pages, ni blog, ni suivi des mots-clés", () => {
    expect(hasSite(PLAN_SCALE)).toBe(false);
    expect(PLANS[PLAN_SCALE].hostingAndDomain).toBe(false);
    expect(PLANS[PLAN_SCALE].homeSpecialties).toBe(0);
    expect(motifPagesAllowance(PLAN_SCALE)).toBe(0);
    expect(canAddMotifPage(PLAN_SCALE, 0)).toBe(false);
    expect(hasBlog(PLAN_SCALE)).toBe(false);
    expect(hasSearchConsole(PLAN_SCALE)).toBe(false);
  });

  it("les deux : tout, comme les démos", () => {
    for (const has of [hasSite, hasBlog, hasSearchConsole, hasSocialMedia, hasGoogleProfile, hasGoogleAds, hasMetaAds, hasAcademy]) {
      expect(has(PLAN_COMPLETE)).toBe(true);
    }
    expect(motifPagesAllowance(PLAN_COMPLETE)).toBe(6);
  });

  it("canAddMotifPage respecte la limite", () => {
    expect(canAddMotifPage(PLAN_SITE, 5)).toBe(true);
    expect(canAddMotifPage(PLAN_SITE, 6)).toBe(false);
    expect(canAddMotifPage(PLAN_COMPLETE, 0)).toBe(true);
  });

  it("toujours inclus : avis Google et statistiques", () => {
    for (const plan of OFFERED_PLANS) {
      expect(PLANS[plan].googleReviewsSync).toBe(true);
      expect(PLANS[plan].advancedAnalytics).toBe(true);
    }
  });
});
