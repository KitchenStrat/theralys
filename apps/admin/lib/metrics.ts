import { normalizePlan, PLANS, type OfferedPlanId, type PlanId } from "@theralys/db";

/**
 * Métriques de la vue d'ensemble — fonctions pures, testées unitairement.
 */

// ─── MRR ──────────────────────────────────────────────────────────────────────

export type SubscriptionLike = {
  plan: PlanId;
  billingPeriod: "monthly" | "annual";
  status: "active" | "trialing" | "past_due" | "canceled";
};

export type MrrSummary = {
  /** €/mois — abonnements actifs et impayés (churn non acté), hors essais/annulés */
  total: number;
  byPlan: Record<OfferedPlanId, number>;
  payingCount: number;
  pastDueCount: number;
};

export function computeMrr(subscriptions: SubscriptionLike[]): MrrSummary {
  // Offre à 2 formules : les anciens abonnements « Scale » comptent avec Boost
  const byPlan: Record<OfferedPlanId, number> = { starter: 0, boost: 0 };
  let total = 0;
  let payingCount = 0;
  let pastDueCount = 0;

  for (const subscription of subscriptions) {
    if (subscription.status !== "active" && subscription.status !== "past_due") continue;
    const def = PLANS[subscription.plan];
    const monthly =
      subscription.billingPeriod === "annual" ? def.annualMonthlyPrice : def.monthlyPrice;
    total += monthly;
    byPlan[normalizePlan(subscription.plan)] += monthly;
    payingCount++;
    if (subscription.status === "past_due") pastDueCount++;
  }
  return { total, byPlan, payingCount, pastDueCount };
}

// ─── Coûts API (estimation) ───────────────────────────────────────────────────

/**
 * Coûts unitaires estimés en euros :
 * - article : claude-sonnet-5 (~1 k tokens in / ~1,5 k out par article)
 * - image : fal.ai FLUX.1 schnell facturé au mégapixel (1024×768 ≈ 0,79 MP)
 * - démo : ~10 appels Claude (accueil, 6 motifs, avis, articles)
 */
export const UNIT_COSTS_EUR = {
  article: 0.03,
  image: 0.0025,
  demoGeneration: 0.3,
} as const;

export type AiUsage = {
  articlesGenerated: number;
  imagesGenerated: number;
  demosGenerated: number;
};

export type AiCostEstimate = {
  totalEur: number;
  details: { label: string; count: number; costEur: number }[];
};

export function estimateAiCosts(usage: AiUsage): AiCostEstimate {
  const details = [
    {
      label: "Articles rédigés",
      count: usage.articlesGenerated,
      costEur: usage.articlesGenerated * UNIT_COSTS_EUR.article,
    },
    {
      label: "Images générées",
      count: usage.imagesGenerated,
      costEur: usage.imagesGenerated * UNIT_COSTS_EUR.image,
    },
    {
      label: "Démos générées",
      count: usage.demosGenerated,
      costEur: usage.demosGenerated * UNIT_COSTS_EUR.demoGeneration,
    },
  ];
  return {
    totalEur: Math.round(details.reduce((sum, d) => sum + d.costEur, 0) * 100) / 100,
    details,
  };
}

// ─── Santé du blog ────────────────────────────────────────────────────────────

export type BlogHealth = {
  status: "ok" | "late" | "none";
  label: string;
};

/**
 * Un blog est « en retard » si le dernier article publié est plus vieux que
 * deux intervalles de cadence (Boost 2/sem → 7 jours, Scale 4/sem → 3,5 jours).
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
