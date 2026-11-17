import { BILLING_PERIOD_LABELS, PLANS, planPrice, type BillingPeriod, type PlanId } from "@theralys/db";
import { periodEnd } from "./period";
import type { BillingProvider, SubscriptionResult } from "./types";

/** Mode mock : abonnement actif immédiatement, identifiants factices stables. */
export class MockBillingProvider implements BillingProvider {
  readonly mode = "mock" as const;

  async startSubscription(opts: {
    siteId: string;
    plan: PlanId;
    period: BillingPeriod;
    customerEmail: string;
    customerName: string;
  }): Promise<SubscriptionResult> {
    // Même refus qu'en réel : une durée qui n'est pas proposée pour la formule
    if (planPrice(opts.plan, opts.period) === null) {
      throw new Error(`La formule ${PLANS[opts.plan].label} n'est pas proposée sur la durée « ${BILLING_PERIOD_LABELS[opts.period]} ».`);
    }
    const suffix = opts.siteId.slice(0, 8);
    return {
      stripeCustomerId: `cus_mock_${suffix}`,
      stripeSubscriptionId: `sub_mock_${suffix}`,
      status: "active",
      currentPeriodEnd: periodEnd(opts.period),
      checkoutUrl: null,
    };
  }

  async createPortalUrl(): Promise<string | null> {
    return null;
  }
}
