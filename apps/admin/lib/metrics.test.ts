import { describe, expect, it } from "vitest";
import { blogHealth, computeMrr, subscriptionMrr } from "./metrics";

/** Souscrit avant le changement de tarif du 17 novembre 2026 : l'abonnement garde son prix. */
const BEFORE = new Date("2026-06-01T00:00:00Z");
/** Souscrit après : nouveau tarif. */
const AFTER = new Date("2026-12-01T00:00:00Z");

describe("computeMrr", () => {
  it("additionne actifs et impayés au bon tarif, ignore essais et annulés", () => {
    const mrr = computeMrr([
      { plan: "scale", billingPeriod: "annual", status: "active", createdAt: BEFORE }, // 55
      { plan: "boost", billingPeriod: "monthly", status: "active", createdAt: BEFORE }, // héritage → tarif Scale : 79
      { plan: "starter", billingPeriod: "annual", status: "past_due", createdAt: BEFORE }, // 48
      { plan: "boost", billingPeriod: "annual", status: "canceled", createdAt: BEFORE }, // 0
      { plan: "scale", billingPeriod: "monthly", status: "trialing", createdAt: BEFORE }, // 0
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

  it("mêle anciens et nouveaux abonnements, chacun à son prix par mois", () => {
    const mrr = computeMrr([
      { plan: "scale", billingPeriod: "annual", status: "active", createdAt: BEFORE }, // 55, ancien tarif
      { plan: "scale", billingPeriod: "annual", status: "active", createdAt: AFTER }, // 86, réglé 1 032 € par an
      { plan: "scale", billingPeriod: "triennial", status: "active", createdAt: AFTER }, // 64, réglé 2 304 € pour 3 ans
      { plan: "scale", billingPeriod: "quarterly", status: "past_due", createdAt: AFTER }, // 107, réglé 321 € par trimestre
      { plan: "starter", billingPeriod: "monthly", status: "active", createdAt: AFTER }, // 69
    ]);
    expect(mrr.total).toBe(55 + 86 + 64 + 107 + 69);
    expect(mrr.byPlan).toEqual({ starter: 69, scale: 55 + 86 + 64 + 107 });
    expect(mrr.payingCount).toBe(5);
    expect(mrr.pastDueCount).toBe(1);
  });
});

describe("subscriptionMrr", () => {
  it("applique à un abonnement la règle du MRR : son prix par mois, zéro hors actif et impayé", () => {
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "annual", status: "active", createdAt: BEFORE })).toBe(55);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "monthly", status: "past_due", createdAt: BEFORE })).toBe(79);
    expect(subscriptionMrr({ plan: "boost", billingPeriod: "monthly", status: "active", createdAt: BEFORE })).toBe(79);
    expect(subscriptionMrr({ plan: "starter", billingPeriod: "annual", status: "active", createdAt: BEFORE })).toBe(48);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "monthly", status: "trialing", createdAt: BEFORE })).toBe(0);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "annual", status: "canceled", createdAt: BEFORE })).toBe(0);
  });

  it("nouveau tarif : le prix par mois de la durée, quelle que soit la somme réglée à l'échéance", () => {
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "monthly", status: "active", createdAt: AFTER })).toBe(129);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "quarterly", status: "active", createdAt: AFTER })).toBe(107);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "annual", status: "active", createdAt: AFTER })).toBe(86);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "triennial", status: "past_due", createdAt: AFTER })).toBe(64);
    expect(subscriptionMrr({ plan: "boost", billingPeriod: "annual", status: "active", createdAt: AFTER })).toBe(86);
    expect(subscriptionMrr({ plan: "scale", billingPeriod: "triennial", status: "canceled", createdAt: AFTER })).toBe(0);
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
