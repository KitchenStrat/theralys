import Stripe from "stripe";
import { PLANS, type PlanId } from "@theralys/db";
import type { BillingPeriod, BillingProvider, SubscriptionResult } from "./types";

/**
 * Stripe Billing réel. Les prix sont créés/résolus par lookup key
 * `theralys_<plan>_<period>` (créés à la volée au premier usage si absents,
 * pour éviter toute configuration manuelle du dashboard).
 */
export class StripeBillingProvider implements BillingProvider {
  readonly mode = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  private lookupKey(plan: PlanId, period: BillingPeriod): string {
    return `theralys_${plan}_${period}`;
  }

  private async resolvePrice(plan: PlanId, period: BillingPeriod): Promise<string> {
    const lookupKey = this.lookupKey(plan, period);
    const existing = await this.stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (existing.data[0]) return existing.data[0].id;

    const def = PLANS[plan];
    const price = await this.stripe.prices.create({
      currency: "eur",
      lookup_key: lookupKey,
      // Engagement annuel facturé mensuellement au tarif réduit
      unit_amount: (period === "annual" ? def.annualMonthlyPrice : def.monthlyPrice) * 100,
      recurring: { interval: "month" },
      metadata: { plan, period },
      product_data: { name: `Theralys ${def.label} (${period === "annual" ? "engagement annuel" : "mensuel"})` },
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
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
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
