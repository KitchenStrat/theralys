import { describe, expect, it } from "vitest";
import { canAttachSubscription, handleStripeEvent, subscriptionEffect, type StripeEventLike, type SubscriptionUpdate } from "./webhook";

function event(type: string, object: StripeEventLike["data"]["object"]): StripeEventLike {
  return { type, data: { object } };
}

describe("handleStripeEvent — le gating suit l'abonnement", () => {
  it("abonnement actif → update active, site conservé, client Stripe transmis", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { plan: "boost" },
        current_period_end: 1_800_000_000,
      }),
    );
    expect(action).toEqual({
      kind: "update",
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      status: "active",
      currentPeriodEnd: new Date(1_800_000_000_000),
      archiveSite: false,
    });
  });

  it("impayé (invoice.payment_failed) → past_due, site conservé", () => {
    const action = handleStripeEvent(
      event("invoice.payment_failed", { subscription: "sub_1", customer: { id: "cus_1" } }),
    );
    expect(action).toMatchObject({
      kind: "update",
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      status: "past_due",
      archiveSite: false,
    });
  });

  it("annulation (subscription.deleted) → canceled + archivage du site", () => {
    const action = handleStripeEvent(
      event("customer.subscription.deleted", { id: "sub_1" }),
    );
    expect(action).toMatchObject({ kind: "update", status: "canceled", archiveSite: true });
  });

  it("statut canceled dans un update → archivage", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", { id: "sub_1", status: "canceled" }),
    );
    expect(action).toMatchObject({ status: "canceled", archiveSite: true });
  });

  it("la formule ne vient jamais d'un événement : ni des métadonnées de l'abonnement, ni de celles du prix", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        metadata: { plan: "scale" },
        items: { data: [{ price: { metadata: { plan: "scale" } } }] },
      }),
    );
    expect(action).not.toHaveProperty("plan");
  });

  it("paiement terminé (checkout.session.completed) → rattache l'abonnement au client", () => {
    expect(handleStripeEvent(event("checkout.session.completed", { id: "cs_1", customer: "cus_1", subscription: "sub_1" }))).toEqual({
      kind: "link",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    // Paiement unique (sans abonnement) ou sans client : rien à rattacher
    expect(handleStripeEvent(event("checkout.session.completed", { id: "cs_1", customer: "cus_1" })).kind).toBe("ignore");
    expect(handleStripeEvent(event("checkout.session.completed", { id: "cs_1", subscription: "sub_1" })).kind).toBe("ignore");
  });

  it("événements non gérés → ignore", () => {
    expect(handleStripeEvent(event("charge.succeeded", {})).kind).toBe("ignore");
    expect(handleStripeEvent(event("invoice.payment_failed", {})).kind).toBe("ignore");
  });

  it("statut inconnu → prudence : past_due", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", { id: "sub_1", status: "paused" }),
    );
    expect(action).toMatchObject({ status: "past_due" });
  });
});

describe("canAttachSubscription — retrouver la ligne par client Stripe", () => {
  it("première souscription : la ligne n'a pas encore d'abonnement", () => {
    expect(canAttachSubscription({ status: "trialing", stripeSubscriptionId: "" }, "sub_1")).toBe(true);
    expect(canAttachSubscription({ status: "trialing", stripeSubscriptionId: null }, "sub_1")).toBe(true);
  });

  it("réabonnement après une annulation, mais jamais à la place d'un abonnement en cours", () => {
    expect(canAttachSubscription({ status: "canceled", stripeSubscriptionId: "sub_ancien" }, "sub_2")).toBe(true);
    expect(canAttachSubscription({ status: "active", stripeSubscriptionId: "sub_1" }, "sub_1")).toBe(true);
    expect(canAttachSubscription({ status: "active", stripeSubscriptionId: "sub_1" }, "sub_2")).toBe(false);
  });
});

describe("subscriptionEffect — effet d'un événement sur la ligne enregistrée", () => {
  const update = (patch: Partial<SubscriptionUpdate>): SubscriptionUpdate => ({ kind: "update", stripeSubscriptionId: "sub_1", status: "active", archiveSite: false, ...patch });

  it("premier paiement : la ligne passe à actif et reçoit l'identifiant de l'abonnement, le site n'est pas touché", () => {
    expect(subscriptionEffect({ status: "trialing", stripeSubscriptionId: "" }, update({ currentPeriodEnd: new Date(0) }))).toEqual({
      kind: "apply",
      subscription: { status: "active", stripeSubscriptionId: "sub_1", currentPeriodEnd: new Date(0) },
    });
  });

  it("annulation : site archivé", () => {
    expect(subscriptionEffect({ status: "active", stripeSubscriptionId: "sub_1" }, update({ status: "canceled", archiveSite: true }))).toMatchObject({ kind: "apply", site: "archived" });
  });

  it("événement en retard sur un abonnement terminé : ignoré, le site annulé n'est pas republié", () => {
    expect(subscriptionEffect({ status: "canceled", stripeSubscriptionId: "sub_1" }, update({ status: "active" }))).toEqual({ kind: "ignore", reason: "abonnement terminé" });
    expect(subscriptionEffect({ status: "canceled", stripeSubscriptionId: "sub_1" }, update({ status: "past_due" })).kind).toBe("ignore");
  });

  it("reprise avec un nouvel abonnement : site republié", () => {
    expect(subscriptionEffect({ status: "canceled", stripeSubscriptionId: "sub_ancien" }, update({ stripeSubscriptionId: "sub_2" }))).toEqual({
      kind: "apply",
      subscription: { status: "active", stripeSubscriptionId: "sub_2" },
      site: "published",
    });
  });

  it("impayé puis régularisation : aucun changement d'état du site", () => {
    expect(subscriptionEffect({ status: "active", stripeSubscriptionId: "sub_1" }, update({ status: "past_due" }))).not.toHaveProperty("site");
    expect(subscriptionEffect({ status: "past_due", stripeSubscriptionId: "sub_1" }, update({ status: "active" }))).not.toHaveProperty("site");
  });
});
