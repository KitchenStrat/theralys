/**
 * Traduction des événements Stripe en actions sur notre modèle — fonctions
 * pures, testées unitairement. Le gating des fonctionnalités suit l'abonnement :
 * impayé → past_due (bandeau côté studio), annulation → canceled + site archivé.
 *
 * La FORMULE ne vient jamais d'un événement : elle se choisit dans l'admin, et
 * un webhook (dont les métadonnées datent de la souscription) ne doit pas
 * défaire un changement fait à la main.
 */

export type StripeEventLike = {
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string | { id?: string } | null;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      subscription?: string | { id?: string } | null;
      metadata?: Record<string, string>;
      items?: { data?: { price?: { metadata?: Record<string, string> } }[] };
    };
  };
};

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type SubscriptionUpdate = {
  kind: "update";
  stripeSubscriptionId: string;
  /**
   * Client Stripe de l'abonnement, quand l'événement le porte. La page de
   * paiement ne connaît pas encore l'abonnement quand elle est créée : la ligne
   * enregistrée à la conversion n'a que le client, et c'est par lui qu'on la
   * retrouve au premier événement.
   */
  stripeCustomerId?: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date;
  /** true → le site public doit être archivé */
  archiveSite: boolean;
};

/** Paiement terminé : l'abonnement Stripe est rattaché à la ligne du client, sans changer son état. */
export type SubscriptionLink = { kind: "link"; stripeCustomerId: string; stripeSubscriptionId: string };

export type WebhookAction = SubscriptionUpdate | SubscriptionLink | { kind: "ignore"; reason: string };

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "past_due",
  incomplete_expired: "canceled",
  canceled: "canceled",
};

/** Identifiant d'un objet Stripe donné tel quel ou « développé » (`{ id }`). */
function idOf(value: string | { id?: string } | null | undefined): string | undefined {
  if (typeof value === "string") return value || undefined;
  return value && typeof value.id === "string" && value.id ? value.id : undefined;
}

export function handleStripeEvent(event: StripeEventLike): WebhookAction {
  const object = event.data.object;
  const stripeCustomerId = idOf(object.customer);

  switch (event.type) {
    case "checkout.session.completed": {
      const subscriptionId = idOf(object.subscription);
      if (!subscriptionId || !stripeCustomerId) return { kind: "ignore", reason: "paiement sans abonnement" };
      return { kind: "link", stripeCustomerId, stripeSubscriptionId: subscriptionId };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      if (!object.id) return { kind: "ignore", reason: "abonnement sans id" };
      const status = STATUS_MAP[object.status ?? ""] ?? "past_due";
      return {
        kind: "update",
        stripeSubscriptionId: object.id,
        stripeCustomerId,
        status,
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
        stripeCustomerId,
        status: "canceled",
        archiveSite: true,
      };
    }

    case "invoice.payment_failed": {
      const subscriptionId = idOf(object.subscription);
      if (!subscriptionId) return { kind: "ignore", reason: "facture sans abonnement" };
      return {
        kind: "update",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId,
        status: "past_due",
        archiveSite: false,
      };
    }

    default:
      return { kind: "ignore", reason: `événement non géré : ${event.type}` };
  }
}

/** Ce que la base sait de l'abonnement visé par un événement. */
export type StoredSubscription = { status: SubscriptionStatus; stripeSubscriptionId: string | null };

/**
 * La ligne retrouvée par client Stripe peut-elle recevoir cet abonnement ?
 * Oui si elle n'en a pas encore (première souscription : la page de paiement
 * ne le connaissait pas), si c'est déjà le sien, ou si le précédent est
 * terminé (réabonnement). Jamais pour remplacer un abonnement en cours.
 */
export function canAttachSubscription(stored: StoredSubscription, stripeSubscriptionId: string): boolean {
  if (!stored.stripeSubscriptionId) return true;
  return stored.stripeSubscriptionId === stripeSubscriptionId || stored.status === "canceled";
}

export type SubscriptionEffect =
  | { kind: "ignore"; reason: string }
  | {
      kind: "apply";
      subscription: { status: SubscriptionStatus; stripeSubscriptionId: string; currentPeriodEnd?: Date };
      /** État à donner au site, quand il change : archivé à l'annulation, republié à la reprise d'un abonnement terminé. */
      site?: "archived" | "published";
    };

/**
 * Effet d'une mise à jour sur la ligne enregistrée.
 * - Un abonnement terminé ne redevient pas actif : un événement arrivé en
 *   retard (Stripe ne garantit pas l'ordre) ne republie pas un site annulé.
 * - Un site n'est republié que par la reprise d'un abonnement (nouvel
 *   abonnement actif après une annulation) — un simple « actif » ne remet pas
 *   en ligne un site archivé à la main.
 */
export function subscriptionEffect(stored: StoredSubscription, update: SubscriptionUpdate): SubscriptionEffect {
  const sameSubscription = stored.stripeSubscriptionId === update.stripeSubscriptionId;
  if (stored.status === "canceled" && sameSubscription && update.status !== "canceled") {
    return { kind: "ignore", reason: "abonnement terminé" };
  }
  const resumed = stored.status === "canceled" && !sameSubscription && update.status === "active";
  return {
    kind: "apply",
    subscription: {
      status: update.status,
      stripeSubscriptionId: update.stripeSubscriptionId,
      ...(update.currentPeriodEnd ? { currentPeriodEnd: update.currentPeriodEnd } : {}),
    },
    ...(update.archiveSite ? { site: "archived" as const } : resumed ? { site: "published" as const } : {}),
  };
}
