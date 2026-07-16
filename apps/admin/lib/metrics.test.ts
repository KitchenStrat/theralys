import { describe, expect, it } from "vitest";
import { blogHealth, computeMrr, estimateAiCosts } from "./metrics";

describe("computeMrr", () => {
  it("additionne actifs et impayés au bon tarif, ignore essais et annulés", () => {
    const mrr = computeMrr([
      { plan: "boost", billingPeriod: "annual", status: "active" }, // 55
      { plan: "scale", billingPeriod: "monthly", status: "active" }, // 89
      { plan: "starter", billingPeriod: "annual", status: "past_due" }, // 48
      { plan: "scale", billingPeriod: "annual", status: "canceled" }, // 0
      { plan: "boost", billingPeriod: "monthly", status: "trialing" }, // 0
    ]);
    expect(mrr.total).toBe(55 + 89 + 48);
    expect(mrr.byPlan).toEqual({ starter: 48, boost: 55, scale: 89 });
    expect(mrr.payingCount).toBe(3);
    expect(mrr.pastDueCount).toBe(1);
  });

  it("MRR nul sans abonnement", () => {
    expect(computeMrr([]).total).toBe(0);
  });
});

describe("estimateAiCosts", () => {
  it("multiplie par les coûts unitaires et arrondit au centime", () => {
    const estimate = estimateAiCosts({
      articlesGenerated: 100,
      imagesGenerated: 100,
      demosGenerated: 10,
    });
    expect(estimate.totalEur).toBe(3 + 0.25 + 3);
    expect(estimate.details).toHaveLength(3);
  });

  it("un client Scale sur un an reste marginal (~7 €)", () => {
    const estimate = estimateAiCosts({
      articlesGenerated: 208,
      imagesGenerated: 208,
      demosGenerated: 0,
    });
    expect(estimate.totalEur).toBeGreaterThan(5);
    expect(estimate.totalEur).toBeLessThan(10);
  });
});

describe("blogHealth", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("Starter : pas de blog", () => {
    expect(
      blogHealth({ plan: "starter", lastPublishedAt: null, nextScheduledFor: null, now }).status,
    ).toBe("none");
  });

  it("Boost à jour si dernier article < 7 jours", () => {
    expect(
      blogHealth({
        plan: "boost",
        lastPublishedAt: new Date("2026-07-10T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("ok");
  });

  it("Boost en retard au-delà de 7 jours", () => {
    expect(
      blogHealth({
        plan: "boost",
        lastPublishedAt: new Date("2026-07-01T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("late");
  });

  it("Scale en retard plus vite (cadence 4/sem → 3,5 j d'intervalle)", () => {
    expect(
      blogHealth({
        plan: "scale",
        lastPublishedAt: new Date("2026-07-10T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("late");
  });

  it("aucun article mais premier planifié → ok", () => {
    expect(
      blogHealth({
        plan: "boost",
        lastPublishedAt: null,
        nextScheduledFor: new Date("2026-07-18"),
        now,
      }).status,
    ).toBe("ok");
  });

  it("aucun article ni planification → en retard", () => {
    expect(
      blogHealth({ plan: "scale", lastPublishedAt: null, nextScheduledFor: null, now }).status,
    ).toBe("late");
  });
});
