/**
 * Formules Harmony et gating des fonctionnalités.
 * Source : pricing de theralys-web.fr (cahier des charges §2).
 */

export type PlanId = "starter" | "boost" | "scale";

export type PlanDefinition = {
  id: PlanId;
  label: string;
  /** €/mois avec engagement annuel */
  annualMonthlyPrice: number;
  /** €/mois sans engagement */
  monthlyPrice: number;
  /** Pages secondaires (spécialités / « motifs ») autorisées */
  maxMotifPages: number;
  /** Articles SEO automatisés par semaine (0 = pas de blog automatisé) */
  blogArticlesPerWeek: number;
  /** Articles par an (104 = 2/semaine, 208 = 4/semaine) */
  blogArticlesPerYear: number;
  /** Suivi des mots-clés Google (Search Console) */
  searchConsoleAccess: boolean;
  /** Toujours inclus, toutes formules */
  googleReviewsSync: true;
  advancedAnalytics: true;
  hostingAndDomain: true;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    label: "Starter",
    annualMonthlyPrice: 48,
    monthlyPrice: 69,
    maxMotifPages: 0,
    blogArticlesPerWeek: 0,
    blogArticlesPerYear: 0,
    searchConsoleAccess: false,
    googleReviewsSync: true,
    advancedAnalytics: true,
    hostingAndDomain: true,
  },
  boost: {
    id: "boost",
    label: "Boost",
    annualMonthlyPrice: 55,
    monthlyPrice: 79,
    maxMotifPages: 3,
    blogArticlesPerWeek: 2,
    blogArticlesPerYear: 104,
    searchConsoleAccess: true,
    googleReviewsSync: true,
    advancedAnalytics: true,
    hostingAndDomain: true,
  },
  scale: {
    id: "scale",
    label: "Scale",
    annualMonthlyPrice: 62,
    monthlyPrice: 89,
    maxMotifPages: 6,
    blogArticlesPerWeek: 4,
    blogArticlesPerYear: 208,
    searchConsoleAccess: true,
    googleReviewsSync: true,
    advancedAnalytics: true,
    hostingAndDomain: true,
  },
};

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id];
}

/** Peut-on ajouter une page de motif supplémentaire à ce site ? */
export function canAddMotifPage(plan: PlanId, currentMotifPageCount: number): boolean {
  return currentMotifPageCount < PLANS[plan].maxMotifPages;
}

/** Nombre de pages de motifs à générer pour une démo (plafonné par la formule). */
export function motifPagesAllowance(plan: PlanId): number {
  return PLANS[plan].maxMotifPages;
}

export function hasBlog(plan: PlanId): boolean {
  return PLANS[plan].blogArticlesPerWeek > 0;
}

export function hasSearchConsole(plan: PlanId): boolean {
  return PLANS[plan].searchConsoleAccess;
}
