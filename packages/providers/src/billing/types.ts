import type { PlanId } from "@theralys/db";

export type BillingPeriod = "monthly" | "annual";

export type SubscriptionResult = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  currentPeriodEnd: Date;
  /** Lien de paiement à transmettre au client (null en mode mock : actif direct) */
  checkoutUrl: string | null;
};

export interface BillingProvider {
  readonly mode: "stripe" | "mock";
  /**
   * Démarre l'abonnement d'un site client (activation manuelle par l'admin).
   * En mode Stripe : crée le customer + un lien de paiement Checkout.
   * En mode mock : abonnement actif immédiatement.
   */
  startSubscription(opts: {
    siteId: string;
    plan: PlanId;
    period: BillingPeriod;
    customerEmail: string;
    customerName: string;
  }): Promise<SubscriptionResult>;

  /** URL du portail de facturation client (null si indisponible). */
  createPortalUrl(stripeCustomerId: string, returnUrl: string): Promise<string | null>;
}
