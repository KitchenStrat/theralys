import { describe, expect, it } from "vitest";
import { PLAN_COMPLETE, PLAN_SCALE, PLAN_SITE } from "@theralys/db";
import { blogHealth, computeMrr, subscriptionMrr } from "./metrics";

const createdAt = new Date("2026-12-01T00:00:00Z");

describe("computeMrr", () => {
  it("additionne actifs et impayés au prix de leurs formules, ignore essais et annulés", () => {
    const mrr = computeMrr([
      { plan: PLAN_COMPLETE, billingPeriod: "annual", status: "active", createdAt }, // 98, réglé 1 176 € par an
      { plan: PLAN_SCALE, billingPeriod: "monthly", status: "active", createdAt }, // 89
      { plan: PLAN_SITE, billingPeriod: "annual", status: "past_due", createdAt }, // 39
      { plan: PLAN_SCALE, billingPeriod: "annual", status: "canceled", createdAt }, // 0
      { plan: PLAN_COMPLETE, billingPeriod: "monthly", status: "trialing", createdAt }, // 0
    ]);
    expect(mrr.total).toBe(98 + 89 + 39);
    // Une ligne par choix : Site seul, Scale seul, les deux
    expect(mrr.byPlan).toEqual({ [PLAN_SITE]: 39, [PLAN_SCALE]: 89, [PLAN_COMPLETE]: 98 });
    expect(mrr.payingCount).toBe(3);
    expect(mrr.pastDueCount).toBe(1);
  });

  it("MRR nul sans abonnement", () => {
    expect(computeMrr([]).total).toBe(0);
    expect(computeMrr([]).byPlan).toEqual({ [PLAN_SITE]: 0, [PLAN_SCALE]: 0, [PLAN_COMPLETE]: 0 });
  });

  it("chaque durée compte à son prix par mois, quelle que soit la somme réglée à l'échéance", () => {
    const mrr = computeMrr([
      { plan: PLAN_COMPLETE, billingPeriod: "triennial", status: "active", createdAt }, // 73, réglé 2 628 € pour 3 ans
      { plan: PLAN_COMPLETE, billingPeriod: "quarterly", status: "past_due", createdAt }, // 123, réglé 369 € par trimestre
      { plan: PLAN_SITE, billingPeriod: "monthly", status: "active", createdAt }, // 59
      { plan: PLAN_SCALE, billingPeriod: "triennial", status: "active", createdAt }, // 44
    ]);
    expect(mrr.total).toBe(73 + 123 + 59 + 44);
    expect(mrr.byPlan).toEqual({ [PLAN_SITE]: 59, [PLAN_SCALE]: 44, [PLAN_COMPLETE]: 73 + 123 });
    expect(mrr.payingCount).toBe(4);
    expect(mrr.pastDueCount).toBe(1);
  });
});

describe("subscriptionMrr", () => {
  it("le prix par mois des formules souscrites ; zéro hors actif et impayé", () => {
    expect(subscriptionMrr({ plan: PLAN_COMPLETE, billingPeriod: "monthly", status: "active", createdAt })).toBe(148);
    expect(subscriptionMrr({ plan: PLAN_COMPLETE, billingPeriod: "annual", status: "past_due", createdAt })).toBe(98);
    expect(subscriptionMrr({ plan: PLAN_SITE, billingPeriod: "quarterly", status: "active", createdAt })).toBe(49);
    expect(subscriptionMrr({ plan: PLAN_SCALE, billingPeriod: "annual", status: "active", createdAt })).toBe(59);
    expect(subscriptionMrr({ plan: PLAN_COMPLETE, billingPeriod: "monthly", status: "trialing", createdAt })).toBe(0);
    expect(subscriptionMrr({ plan: PLAN_COMPLETE, billingPeriod: "annual", status: "canceled", createdAt })).toBe(0);
  });
});

describe("blogHealth", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("formule Scale seule : pas de blog", () => {
    expect(blogHealth({ plan: PLAN_SCALE, lastPublishedAt: null, nextScheduledFor: null, now }).status).toBe("none");
  });

  it("à jour si le dernier article a moins de 3,5 jours (4 par semaine)", () => {
    for (const plan of [PLAN_SITE, PLAN_COMPLETE]) {
      expect(blogHealth({ plan, lastPublishedAt: new Date("2026-07-13T07:00:00Z"), nextScheduledFor: null, now }).status).toBe("ok");
    }
  });

  it("en retard au-delà de 3,5 jours", () => {
    expect(blogHealth({ plan: PLAN_SITE, lastPublishedAt: new Date("2026-07-10T07:00:00Z"), nextScheduledFor: null, now }).status).toBe("late");
  });

  it("aucun article mais premier planifié → ok", () => {
    expect(blogHealth({ plan: PLAN_COMPLETE, lastPublishedAt: null, nextScheduledFor: new Date("2026-07-18"), now }).status).toBe("ok");
  });

  it("aucun article ni planification → en retard", () => {
    expect(blogHealth({ plan: PLAN_COMPLETE, lastPublishedAt: null, nextScheduledFor: null, now }).status).toBe("late");
  });
});
