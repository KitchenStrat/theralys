import { normalizePlan, PLANS, subscriptionPricing, type BillingPeriod, type OfferedPlanId, type PlanId } from "@theralys/db";

/**
 * Métriques de la vue d'ensemble — fonctions pures, testées unitairement.
 * Les coûts des API (réels, lus dans le registre `api_usage`) sont dans
 * `./api-usage`.
 */

// ─── MRR ──────────────────────────────────────────────────────────────────────

export type SubscriptionLike = {
  plan: PlanId;
  billingPeriod: BillingPeriod;
  status: "active" | "trialing" | "past_due" | "canceled";
  /** Date de souscription : un abonnement d'avant le changement de tarif garde son prix */
  createdAt: Date;
};

export type MrrSummary = {
  /** €/mois — abonnements actifs et impayés (churn non acté), hors essais/annulés */
  total: number;
  byPlan: Record<OfferedPlanId, number>;
  payingCount: number;
  pastDueCount: number;
};

/**
 * Revenu mensuel d'un abonnement (€ TTC par mois) : le prix par mois de la
 * durée souscrite, que la somme soit réglée chaque mois ou d'avance pour un
 * trimestre, un an ou trois ans. Un abonnement souscrit avant le changement de
 * tarif compte à son ancien prix. Zéro pour un essai ou un abonnement annulé.
 */
export function subscriptionMrr(subscription: SubscriptionLike): number {
  if (subscription.status !== "active" && subscription.status !== "past_due") return 0;
  return subscriptionPricing(subscription).monthlyPrice;
}

export function computeMrr(subscriptions: SubscriptionLike[]): MrrSummary {
  // Offre à 2 formules : les anciens abonnements « Boost » comptent avec Scale
  const byPlan: Record<OfferedPlanId, number> = { starter: 0, scale: 0 };
  let total = 0;
  let payingCount = 0;
  let pastDueCount = 0;

  for (const subscription of subscriptions) {
    if (subscription.status !== "active" && subscription.status !== "past_due") continue;
    const monthly = subscriptionMrr(subscription);
    total += monthly;
    byPlan[normalizePlan(subscription.plan)] += monthly;
    payingCount++;
    if (subscription.status === "past_due") pastDueCount++;
  }
  return { total, byPlan, payingCount, pastDueCount };
}

// ─── Santé du blog ────────────────────────────────────────────────────────────

export type BlogHealth = {
  status: "ok" | "late" | "none";
  label: string;
};

/**
 * Un blog est « en retard » si le dernier article publié est plus vieux que
 * deux intervalles de cadence (Scale 4/sem → 3,5 jours).
 */
export function blogHealth(input: {
  plan: PlanId;
  lastPublishedAt: Date | null;
  nextScheduledFor: Date | null;
  now?: Date;
}): BlogHealth {
  const cadence = PLANS[input.plan].blogArticlesPerWeek;
  if (cadence === 0) return { status: "none", label: "Pas de blog (Starter)" };

  const now = input.now ?? new Date();
  if (!input.lastPublishedAt) {
    return input.nextScheduledFor
      ? { status: "ok", label: "Premier article planifié" }
      : { status: "late", label: "Aucun article" };
  }

  const maxGapMs = 2 * (7 / cadence) * 86_400_000;
  const gapMs = now.getTime() - input.lastPublishedAt.getTime();
  if (gapMs > maxGapMs) {
    const days = Math.floor(gapMs / 86_400_000);
    return { status: "late", label: `Dernier article il y a ${days} j` };
  }
  return { status: "ok", label: `À jour (${cadence}/sem)` };
}
