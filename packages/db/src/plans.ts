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

/**
 * Durées de facturation. Le prix d'une formule est toujours donné par mois ;
 * la somme est réglée d'avance pour toute la durée (107 € par mois en
 * trimestriel = 321 € tous les trimestres).
 */
export const BILLING_PERIODS = ["monthly", "quarterly", "annual", "triennial"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/** Nombre de mois réglés à chaque échéance. */
export const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
  triennial: 36,
};

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  annual: "Annuel",
  triennial: "3 ans",
};

/** Rythme des échéances, à lire après un montant : « 321 € tous les trimestres ». */
export const BILLING_PERIOD_CADENCE: Record<BillingPeriod, string> = {
  monthly: "tous les mois",
  quarterly: "tous les trimestres",
  annual: "tous les ans",
  triennial: "tous les 3 ans",
};

/** Engagement minimal, en mois, quelle que soit la durée de facturation choisie. */
export const MIN_COMMITMENT_MONTHS = 12;

export type PlanDefinition = {
  id: PlanId;
  label: string;
  /** € TTC par mois, selon la durée de facturation ; une durée absente n'est pas proposée pour la formule */
  prices: Partial<Record<BillingPeriod, number>>;
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
  /** Académie (formations du studio) */
  academy: boolean;
  /** Toujours inclus, toutes formules */
  googleReviewsSync: true;
  /** Section « Réseaux sociaux » du studio (contenus prêts à poster) — Scale uniquement */
  socialMedia: boolean;
  /** Section « Fiche Google » du studio (audit, visibilité, avis, posts) — Scale uniquement */
  googleProfile: boolean;
  /** Section « Google Ads » du studio (diagnostic, mots-clés, plan d'action, tuto et suivi) — Scale uniquement */
  googleAds: boolean;
  /** Section « Meta Ads » du studio (diagnostic, veille, annonces, plan vidéo, plan de campagne) — Scale uniquement */
  metaAds: boolean;
  advancedAnalytics: true;
  hostingAndDomain: true;
};

const STARTER: PlanDefinition = {
  id: "starter",
  label: "Starter",
  // Tarif inchangé pour l'instant : mensuel et annuel seulement (nouveaux prix sur les quatre durées à venir)
  prices: { monthly: 69, annual: 48 },
  homeSpecialties: 6,
  maxMotifPages: 0,
  blogArticlesPerWeek: 0,
  blogArticlesPerYear: 0,
  searchConsoleAccess: false,
  academy: false,
  googleReviewsSync: true,
  socialMedia: false,
  googleProfile: false,
  googleAds: false,
  metaAds: false,
  advancedAnalytics: true,
  hostingAndDomain: true,
};

const SCALE: PlanDefinition = {
  id: "scale",
  label: "Scale",
  // Tarif du 17 novembre 2026 : 321 € par trimestre, 1 032 € par an, 2 304 € pour 3 ans
  prices: { monthly: 129, quarterly: 107, annual: 86, triennial: 64 },
  homeSpecialties: 6,
  maxMotifPages: 6,
  blogArticlesPerWeek: 4,
  blogArticlesPerYear: 208,
  searchConsoleAccess: true,
  academy: true,
  googleReviewsSync: true,
  socialMedia: true,
  googleProfile: true,
  googleAds: true,
  metaAds: true,
  advancedAnalytics: true,
  hostingAndDomain: true,
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: STARTER,
  scale: SCALE,
  // Héritage : les anciens abonnements « Boost » sont servis comme Scale
  boost: { ...SCALE, id: "boost" },
};

// ─── Prix et durées ──────────────────────────────────────────────────────────

/** Durées proposées pour une formule, de la plus courte à la plus longue. */
export function planPeriods(plan: PlanId): BillingPeriod[] {
  return BILLING_PERIODS.filter((period) => PLANS[plan].prices[period] !== undefined);
}

/** Prix par mois (€ TTC) d'une formule sur une durée ; null si la durée n'est pas proposée. */
export function planPrice(plan: PlanId, period: BillingPeriod): number | null {
  return PLANS[plan].prices[period] ?? null;
}

/** Montant réglé à chaque échéance (€ TTC) : le prix par mois × les mois de la durée ; null si la durée n'est pas proposée. */
export function periodTotal(plan: PlanId, period: BillingPeriod): number | null {
  const price = planPrice(plan, period);
  return price === null ? null : price * BILLING_PERIOD_MONTHS[period];
}

/** Durée d'engagement d'une durée de facturation : 12 mois au moins, 36 pour le « 3 ans ». */
export function commitmentMonths(period: BillingPeriod): number {
  return Math.max(MIN_COMMITMENT_MONTHS, BILLING_PERIOD_MONTHS[period]);
}

/**
 * Économie d'une durée par rapport au mensuel, en mois de mensuel offerts sur
 * la durée d'engagement (arrondi vers le bas : jamais surestimée). Scale :
 * 2 mois en trimestriel, 4 en annuel, 18 sur 3 ans.
 */
export function savedMonths(plan: PlanId, period: BillingPeriod): number {
  const monthly = planPrice(plan, "monthly");
  const price = planPrice(plan, period);
  if (monthly === null || price === null || price >= monthly) return 0;
  return Math.floor(((monthly - price) * commitmentMonths(period)) / monthly);
}

// ─── Abonnements souscrits avant le changement de tarif ──────────────────────

/**
 * Le tarif a changé le 17 novembre 2026. Un abonnement souscrit avant garde
 * son prix : Stripe ne modifie pas un abonnement en cours. L'annuel d'alors
 * était un engagement d'un an réglé chaque mois.
 */
export const TARIFF_CHANGED_AT = new Date("2026-11-17T16:15:00Z");

const LEGACY_PRICES: Record<OfferedPlanId, Partial<Record<BillingPeriod, number>>> = {
  starter: { monthly: 69, annual: 48 },
  scale: { monthly: 79, annual: 55 },
};

export type SubscriptionPricing = {
  /** € TTC par mois */
  monthlyPrice: number;
  /** Mois réglés à chaque échéance */
  billedMonths: number;
  /** Abonnement au tarif d'avant le 17 novembre 2026 */
  legacy: boolean;
};

/** Prix réellement payé par un abonnement, selon sa formule, sa durée et sa date de souscription. */
export function subscriptionPricing(subscription: {
  plan: PlanId;
  billingPeriod: BillingPeriod;
  createdAt: Date;
}): SubscriptionPricing {
  const legacyPrice = LEGACY_PRICES[normalizePlan(subscription.plan)][subscription.billingPeriod];
  if (subscription.createdAt < TARIFF_CHANGED_AT && legacyPrice !== undefined) {
    return { monthlyPrice: legacyPrice, billedMonths: 1, legacy: true };
  }
  const price =
    planPrice(subscription.plan, subscription.billingPeriod) ??
    // Durée retirée de la formule depuis la souscription : on retient son prix mensuel
    planPrice(subscription.plan, "monthly") ??
    0;
  return { monthlyPrice: price, billedMonths: BILLING_PERIOD_MONTHS[subscription.billingPeriod], legacy: false };
}

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

/** Académie (formations du studio). */
export function hasAcademy(plan: PlanId): boolean {
  return PLANS[plan].academy;
}

/** Section « Réseaux sociaux » du studio (Scale uniquement ; les démos y ont accès). */
export function hasSocialMedia(plan: PlanId): boolean {
  return getPlan(plan).socialMedia;
}

/** Section « Fiche Google » du studio (Scale uniquement ; les démos y ont accès). */
export function hasGoogleProfile(plan: PlanId): boolean {
  return getPlan(plan).googleProfile;
}

/** Section « Google Ads » du studio (Scale uniquement ; les démos y ont accès). */
export function hasGoogleAds(plan: PlanId): boolean {
  return getPlan(plan).googleAds;
}

/** Section « Meta Ads » du studio (Scale uniquement ; les démos y ont accès). */
export function hasMetaAds(plan: PlanId): boolean {
  return getPlan(plan).metaAds;
}

const NBSP = "\u00a0";
const euros = (value: number) => `${value.toLocaleString("fr-FR")}${NBSP}€`;

/**
 * Ce que paie un abonnement, en une phrase (page Compte du studio, liste des
 * clients de l'admin). Nouveau tarif : « Annuel — 86 € TTC par mois, soit
 * 1 032 € tous les ans ». Avant le 17 novembre 2026 : « Engagement annuel —
 * 55 € par mois (ancien tarif) ».
 */
export function describeSubscriptionPricing(subscription: {
  plan: PlanId;
  billingPeriod: BillingPeriod;
  createdAt: Date;
}): string {
  const pricing = subscriptionPricing(subscription);
  if (pricing.legacy) {
    const label = subscription.billingPeriod === "annual" ? "Engagement annuel" : "Mensuel";
    return `${label} — ${euros(pricing.monthlyPrice)} par mois (ancien tarif)`;
  }
  const label = `${BILLING_PERIOD_LABELS[subscription.billingPeriod]} — ${euros(pricing.monthlyPrice)} TTC par mois`;
  if (pricing.billedMonths === 1) return label;
  return `${label}, soit ${euros(pricing.monthlyPrice * pricing.billedMonths)} ${BILLING_PERIOD_CADENCE[subscription.billingPeriod]}`;
}
