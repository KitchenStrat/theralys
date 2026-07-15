import type { PlanId } from "@theralys/db";

/**
 * Traduction des événements Stripe en actions sur notre modèle — fonction
 * pure, testée unitairement. Le gating des fonctionnalités suit l'abonnement :
 * impayé → past_due (bandeau côté studio), annulation → canceled + site archivé.
 */

export type StripeEventLike = {
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      subscription?: string;
      metadata?: Record<string, string>;
      items?: { data?: { price?: { metadata?: Record<string, string> } }[] };
    };
  };
};

export type SubscriptionUpdate = {
  kind: "update";
  stripeSubscriptionId: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  plan?: PlanId;
  currentPeriodEnd?: Date;
  /** true → le site public doit être archivé */
  archiveSite: boolean;
};

export type WebhookAction = SubscriptionUpdate | { kind: "ignore"; reason: string };

const STATUS_MAP: Record<string, SubscriptionUpdate["status"]> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "past_due",
  incomplete_expired: "canceled",
  canceled: "canceled",
};

function planFromMetadata(meta: Record<string, string> | undefined): PlanId | undefined {
  const plan = meta?.plan;
  return plan === "starter" || plan === "boost" || plan === "scale" ? plan : undefined;
}

export function handleStripeEvent(event: StripeEventLike): WebhookAction {
  const object = event.data.object;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      if (!object.id) return { kind: "ignore", reason: "abonnement sans id" };
      const status = STATUS_MAP[object.status ?? ""] ?? "past_due";
      return {
        kind: "update",
        stripeSubscriptionId: object.id,
        status,
        plan:
          planFromMetadata(object.metadata) ??
          planFromMetadata(object.items?.data?.[0]?.price?.metadata),
        currentPeriodEnd: object.current_period_end
          ? new Date(object.current_period_end * 1000)
          : undefined,
        archiveSite: status === "canceled",
      };
    }

    case "customer.subscription.deleted": {
      if (!object.id) return { kind: "ignore", reason: "abonnement sans id" };
      return {
        kind: "update",
        stripeSubscriptionId: object.id,
        status: "canceled",
        archiveSite: true,
      };
    }

    case "invoice.payment_failed": {
      const subscriptionId = object.subscription;
      if (!subscriptionId) return { kind: "ignore", reason: "facture sans abonnement" };
      return {
        kind: "update",
        stripeSubscriptionId: subscriptionId,
        status: "past_due",
        archiveSite: false,
      };
    }

    default:
      return { kind: "ignore", reason: `événement non géré : ${event.type}` };
  }
}
