import { describe, expect, it } from "vitest";
import { handleStripeEvent, type StripeEventLike } from "./webhook";

function event(type: string, object: StripeEventLike["data"]["object"]): StripeEventLike {
  return { type, data: { object } };
}

describe("handleStripeEvent — le gating suit l'abonnement", () => {
  it("abonnement actif → update active, site conservé", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        metadata: { plan: "boost" },
        current_period_end: 1_800_000_000,
      }),
    );
    expect(action).toMatchObject({
      kind: "update",
      stripeSubscriptionId: "sub_1",
      status: "active",
      plan: "boost",
      archiveSite: false,
    });
  });

  it("impayé (invoice.payment_failed) → past_due, site conservé", () => {
    const action = handleStripeEvent(
      event("invoice.payment_failed", { subscription: "sub_1" }),
    );
    expect(action).toMatchObject({
      kind: "update",
      stripeSubscriptionId: "sub_1",
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

  it("changement de formule : le plan vient des metadata du prix à défaut", () => {
    const action = handleStripeEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        items: { data: [{ price: { metadata: { plan: "scale" } } }] },
      }),
    );
    expect(action).toMatchObject({ plan: "scale" });
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
