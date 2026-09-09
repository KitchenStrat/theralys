/**
 * Formules Harmony et gating des fonctionnalités.
 * Offre actuelle : 2 formules (Starter, Scale). Toutes les démos présentent
 * l'offre complète (équivalent Scale) — les restrictions ne s'appliquent
 * qu'aux clients ayant choisi Starter.
 * « boost » est une ancienne formule conservée pour compatibilité (valeur
 * encore présente dans l'enum Postgres) : elle est servie comme Scale.
 */

export type PlanId = "starter" | "boost" | "scale";

/** Formules réellement proposées à la vente. */
export const OFFERED_PLANS = ["starter", "scale"] as const;
export type OfferedPlanId = (typeof OFFERED_PLANS)[number];

/** Ramène les valeurs héritées (boost) sur l'offre actuelle. */
export function normalizePlan(plan: PlanId): OfferedPlanId {
  return plan === "starter" ? "starter" : "scale";
}

export type PlanDefinition = {
  id: PlanId;
  label: string;
  /** €/mois avec engagement annuel */
  annualMonthlyPrice: number;
  /** €/mois sans engagement */
  monthlyPrice: number;
  /** Spécialités présentées sur la page d'accueil (toutes formules) */
  homeSpecialties: number;
  /** Pages secondaires de spécialités (« motifs ») autorisées */
  maxMotifPages: number;
  /** Articles SEO automatisés par semaine (0 = pas de blog automatisé) */
  blogArticlesPerWeek: number;
  /** Articles par an (208 = 4/semaine) */
  blogArticlesPerYear: number;
  /** Suivi des mots-clés Google (Search Console) */
  searchConsoleAccess: boolean;
  /** Outil de recherche de mots-clés SEO (studio) */
  keywordResearch: boolean;
  /** Académie (formations du studio) */
  academy: boolean;
  /** Toujours inclus, toutes formules */
  googleReviewsSync: true;
  advancedAnalytics: true;
  hostingAndDomain: true;
};

const STARTER: PlanDefinition = {
  id: "starter",
  label: "Starter",
  annualMonthlyPrice: 48,
  monthlyPrice: 69,
  homeSpecialties: 6,
  maxMotifPages: 0,
  blogArticlesPerWeek: 0,
  blogArticlesPerYear: 0,
  searchConsoleAccess: false,
  keywordResearch: false,
  academy: false,
  googleReviewsSync: true,
  advancedAnalytics: true,
  hostingAndDomain: true,
};

const SCALE: PlanDefinition = {
  id: "scale",
  label: "Scale",
  annualMonthlyPrice: 55,
  monthlyPrice: 79,
  homeSpecialties: 6,
  maxMotifPages: 6,
  blogArticlesPerWeek: 4,
  blogArticlesPerYear: 208,
  searchConsoleAccess: true,
  keywordResearch: true,
  academy: true,
  googleReviewsSync: true,
  advancedAnalytics: true,
  hostingAndDomain: true,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: STARTER,
  scale: SCALE,
  // Héritage : les anciens abonnements « Boost » sont servis comme Scale
  boost: { ...SCALE, id: "boost" },
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

/** Outil de recherche de mots-clés SEO (page Mots-clés du studio). */
export function hasKeywordResearch(plan: PlanId): boolean {
  return PLANS[plan].keywordResearch;
}

/** Académie (formations du studio). */
export function hasAcademy(plan: PlanId): boolean {
  return PLANS[plan].academy;
}
