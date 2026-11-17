import Stripe from "stripe";
import {
  BILLING_PERIOD_LABELS,
  PLANS,
  periodTotal,
  type BillingPeriod,
  type PlanId,
} from "@theralys/db";
import { periodEnd } from "./period";
import type { BillingProvider, SubscriptionResult } from "./types";

/** Rythme de prélèvement Stripe de chaque durée (Stripe accepte jusqu'à 3 ans entre deux échéances). */
const STRIPE_RECURRING: Record<BillingPeriod, Stripe.PriceCreateParams.Recurring> = {
  monthly: { interval: "month" },
  quarterly: { interval: "month", interval_count: 3 },
  annual: { interval: "year" },
  triennial: { interval: "year", interval_count: 3 },
};

/**
 * Clé du prix Stripe d'une formule sur une durée. Le montant en fait partie :
 * un changement de tarif crée un nouveau prix au lieu de réutiliser l'ancien,
 * et les abonnements en cours gardent le leur.
 */
export function stripePriceKey(plan: PlanId, period: BillingPeriod, amountCents: number): string {
  return `harmony_${plan}_${period}_${amountCents}`;
}

/**
 * Stripe Billing réel. Les prix sont résolus par clé (`stripePriceKey`) et
 * créés à la volée au premier usage, pour éviter toute configuration manuelle
 * du dashboard. Chaque durée est réglée d'avance : 321 € tous les trimestres,
 * 1 032 € tous les ans, 2 304 € tous les 3 ans. Les montants sont TTC.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly mode = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  private async resolvePrice(plan: PlanId, period: BillingPeriod): Promise<string> {
    const def = PLANS[plan];
    const total = periodTotal(plan, period);
    if (total === null) {
      throw new Error(`La formule ${def.label} n'est pas proposée sur la durée « ${BILLING_PERIOD_LABELS[period]} ».`);
    }
    const amountCents = total * 100;
    const lookupKey = stripePriceKey(plan, period, amountCents);
    const existing = await this.stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (existing.data[0]) return existing.data[0].id;

    const price = await this.stripe.prices.create({
      currency: "eur",
      lookup_key: lookupKey,
      unit_amount: amountCents,
      recurring: STRIPE_RECURRING[period],
      metadata: { plan, period },
      product_data: { name: `Harmony ${def.label} (${BILLING_PERIOD_LABELS[period].toLowerCase()})` },
    });
    return price.id;
  }

  async startSubscription(opts: {
    siteId: string;
    plan: PlanId;
    period: BillingPeriod;
    customerEmail: string;
    customerName: string;
  }): Promise<SubscriptionResult> {
    const customer = await this.stripe.customers.create({
      email: opts.customerEmail,
      name: opts.customerName,
      metadata: { siteId: opts.siteId },
    });

    const priceId = await this.resolvePrice(opts.plan, opts.period);
    const session = await this.stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { siteId: opts.siteId, plan: opts.plan } },
      success_url: "https://theralys-web.fr/merci",
      cancel_url: "https://theralys-web.fr",
    });

    return {
      stripeCustomerId: customer.id,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : "",
      status: "trialing", // actif après paiement (webhook customer.subscription.created)
      currentPeriodEnd: periodEnd(opts.period),
      checkoutUrl: session.url,
    };
  }

  async createPortalUrl(stripeCustomerId: string, returnUrl: string): Promise<string | null> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return session.url;
  }
}
