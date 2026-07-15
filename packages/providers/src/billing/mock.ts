import type { PlanId } from "@theralys/db";
import type { BillingPeriod, BillingProvider, SubscriptionResult } from "./types";

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
    const suffix = opts.siteId.slice(0, 8);
    const periodDays = opts.period === "annual" ? 365 : 30;
    return {
      stripeCustomerId: `cus_mock_${suffix}`,
      stripeSubscriptionId: `sub_mock_${suffix}`,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + periodDays * 86_400_000),
      checkoutUrl: null,
    };
  }

  async createPortalUrl(): Promise<string | null> {
    return null;
  }
}
