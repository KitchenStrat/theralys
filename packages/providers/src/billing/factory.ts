import { MockBillingProvider } from "./mock";
import { StripeBillingProvider } from "./stripe";
import type { BillingProvider } from "./types";

export function resolveBillingMode(env: NodeJS.ProcessEnv = process.env): "stripe" | "mock" {
  return env.STRIPE_SECRET_KEY ? "stripe" : "mock";
}

export function createBillingProvider(env: NodeJS.ProcessEnv = process.env): BillingProvider {
  return resolveBillingMode(env) === "stripe"
    ? new StripeBillingProvider(env.STRIPE_SECRET_KEY!)
    : new MockBillingProvider();
}
