import { describe, expect, it } from "vitest";
import { blogHealth, computeMrr, estimateAiCosts } from "./metrics";

describe("computeMrr", () => {
  it("additionne actifs et impayés au bon tarif, ignore essais et annulés", () => {
    const mrr = computeMrr([
      { plan: "scale", billingPeriod: "annual", status: "active" }, // 55
      { plan: "boost", billingPeriod: "monthly", status: "active" }, // héritage → tarif Scale : 79
      { plan: "starter", billingPeriod: "annual", status: "past_due" }, // 48
      { plan: "boost", billingPeriod: "annual", status: "canceled" }, // 0
      { plan: "scale", billingPeriod: "monthly", status: "trialing" }, // 0
    ]);
    expect(mrr.total).toBe(55 + 79 + 48);
    // Les anciens abonnements « Boost » sont servis et comptés comme Scale
    expect(mrr.byPlan).toEqual({ starter: 48, scale: 55 + 79 });
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

  it("Scale à jour si dernier article < 3,5 jours (4/sem)", () => {
    expect(
      blogHealth({
        plan: "scale",
        lastPublishedAt: new Date("2026-07-13T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("ok");
  });

  it("Scale en retard au-delà de 3,5 jours", () => {
    expect(
      blogHealth({
        plan: "scale",
        lastPublishedAt: new Date("2026-07-10T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("late");
  });

  it("l'ancienne formule Boost suit la cadence Scale (4/sem)", () => {
    // 2 jours sans publication : dans les temps pour une cadence 4/sem
    expect(
      blogHealth({
        plan: "boost",
        lastPublishedAt: new Date("2026-07-13T07:00:00Z"),
        nextScheduledFor: null,
        now,
      }).status,
    ).toBe("ok");
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
