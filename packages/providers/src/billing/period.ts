import { BILLING_PERIOD_MONTHS, type BillingPeriod } from "@theralys/db";

/** Fin de la première période d'un abonnement, en attendant la date exacte donnée par le webhook Stripe. */
export function periodEnd(period: BillingPeriod, from: Date = new Date()): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + BILLING_PERIOD_MONTHS[period]);
  return end;
}
