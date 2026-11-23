/**
 * Offre Harmony et gating des fonctionnalités.
 *
 * Depuis le 21 novembre 2026, le produit se compose de **deux formules
 * indépendantes** ; un client prend l'une, l'autre, ou les deux :
 *
 * - **Site** : le site internet hébergé, ses pages de spécialités et le blog
 *   SEO automatisé ;
 * - **Scale** : tout le reste (fiche Google, réseaux sociaux, Google Ads,
 *   Meta Ads, Académie), sans le site. Les outils s'appuient alors sur le site
 *   que le praticien possède déjà (section « Mon site » du studio).
 *
 * Les deux ensemble donnent l'offre complète, celle que présentent toutes les
 * démos. Le prix des deux est la somme des deux prix.
 *
 * ── Ce qui est enregistré en base ──
 * Un compte porte une seule valeur, dans l'enum Postgres `plan`, dont les noms
 * datent de l'offre précédente. Leur sens aujourd'hui (voir `PLAN_FORMULAS`) :
 *
 *   `starter` → formule Site seule
 *   `boost`   → formule Scale seule
 *   `scale`   → les deux formules (offre complète)
 *
 * Ce choix garde justes toutes les lignes existantes sans migration : les
 * démos et les comptes d'avant le découpage étaient en `scale`, l'offre
 * complète d'alors. Hors de ce fichier, le code parle en formules
 * (`planFormulas`, `hasSite`, `hasBlog`…) ou passe par les constantes
 * `PLAN_SITE`, `PLAN_SCALE`, `PLAN_COMPLETE`, jamais par ces noms.
 */

/**
 * Découpage de l'offre en deux formules. Les comptes clients dont
 * l'abonnement a été ouvert avant avaient l'offre d'alors : ils ont tout,
 * Site et Scale (l'admin les aligne une fois, voir
 * `apps/admin/lib/formulas.ts`).
 */
export const FORMULAS_SPLIT_AT = new Date("2026-11-21T00:00:00Z");

/** Valeur de l'enum Postgres `plan` (noms hérités, voir l'en-tête). */
export type PlanId = "starter" | "boost" | "scale";

/** Les deux formules vendues. */
export const FORMULAS = ["site", "scale"] as const;
export type FormulaId = (typeof FORMULAS)[number];

/** Formule Site seule. */
export const PLAN_SITE: PlanId = "starter";
/** Formule Scale seule (sans le site). */
export const PLAN_SCALE: PlanId = "boost";
/** Les deux formules : l'offre complète, celle des démos. */
export const PLAN_COMPLETE: PlanId = "scale";

const PLAN_FORMULAS: Record<PlanId, readonly FormulaId[]> = {
  starter: ["site"],
  boost: ["scale"],
  scale: ["site", "scale"],
};

/** Les trois choix possibles, dans l'ordre où on les présente : Site, Scale, les deux. */
export const OFFERED_PLANS = [PLAN_SITE, PLAN_SCALE, PLAN_COMPLETE] as const;
export type OfferedPlanId = PlanId;

/** Formules souscrites par un compte. */
export function planFormulas(plan: PlanId): readonly FormulaId[] {
  return PLAN_FORMULAS[plan];
}

export function hasFormula(plan: PlanId, formula: FormulaId): boolean {
  return PLAN_FORMULAS[plan].includes(formula);
}

/** Valeur à enregistrer pour un choix de formules ; null si aucune n'est choisie. */
export function planFromFormulas(formulas: Iterable<FormulaId>): PlanId | null {
  const chosen = new Set(formulas);
  if (chosen.has("site") && chosen.has("scale")) return PLAN_COMPLETE;
  if (chosen.has("site")) return PLAN_SITE;
  if (chosen.has("scale")) return PLAN_SCALE;
  return null;
}

export function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "boost" || value === "scale";
}

/**
 * Durées de facturation. Le prix d'une formule est toujours donné par mois ;
 * la somme est réglée d'avance pour toute la durée (74 € par mois en
 * trimestriel = 222 € tous les trimestres).
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

/** Rythme des échéances, à lire après un montant : « 222 € tous les trimestres ». */
export const BILLING_PERIOD_CADENCE: Record<BillingPeriod, string> = {
  monthly: "tous les mois",
  quarterly: "tous les trimestres",
  annual: "tous les ans",
  triennial: "tous les 3 ans",
};

/** Engagement minimal, en mois, quelle que soit la durée de facturation choisie. */
export const MIN_COMMITMENT_MONTHS = 12;

// ─── Les deux formules ───────────────────────────────────────────────────────

/**
 * Prix par mois sur chaque durée, à partir du mensuel : 10 mois réglés sur 12
 * en trimestriel, 8 sur 12 en annuel, 18 sur 36 sur 3 ans, à l'euro inférieur.
 */
export function pricesFromMonthly(monthly: number): Record<BillingPeriod, number> {
  return {
    monthly,
    quarterly: Math.floor((monthly * 10) / 12),
    annual: Math.floor((monthly * 8) / 12),
    triennial: Math.floor((monthly * 18) / 36),
  };
}

export type FormulaDefinition = {
  id: FormulaId;
  label: string;
  /** € TTC par mois, selon la durée de facturation */
  prices: Record<BillingPeriod, number>;
};

export const FORMULA_DEFINITIONS: Record<FormulaId, FormulaDefinition> = {
  // 59 € par mois ; 147 € par trimestre, 468 € par an, 1 044 € pour 3 ans
  site: { id: "site", label: "Site", prices: pricesFromMonthly(59) },
  // 89 € par mois ; 222 € par trimestre, 708 € par an, 1 584 € pour 3 ans
  scale: { id: "scale", label: "Scale", prices: pricesFromMonthly(89) },
};

/** Prix par mois (€ TTC) d'une formule sur une durée. */
export function formulaPrice(formula: FormulaId, period: BillingPeriod): number {
  return FORMULA_DEFINITIONS[formula].prices[period];
}

// ─── Ce qu'ouvre chaque choix ────────────────────────────────────────────────

export type PlanDefinition = {
  id: PlanId;
  /** « Site », « Scale » ou « Site + Scale » */
  label: string;
  formulas: readonly FormulaId[];
  /** € TTC par mois, selon la durée de facturation : la somme des formules souscrites */
  prices: Partial<Record<BillingPeriod, number>>;
  /** Site internet hébergé par Harmony (éditeur, domaine, hébergement) — formule Site */
  site: boolean;
  /** Spécialités présentées sur la page d'accueil du site */
  homeSpecialties: number;
  /** Pages secondaires de spécialités (« motifs ») autorisées */
  maxMotifPages: number;
  /** Articles SEO automatisés par semaine (0 = pas de blog automatisé) — formule Site */
  blogArticlesPerWeek: number;
  /** Articles par an (208 = 4/semaine) */
  blogArticlesPerYear: number;
  /** Suivi des mots-clés Google du site (Search Console) — formule Site */
  searchConsoleAccess: boolean;
  /** Académie (formations du studio) — formule Scale */
  academy: boolean;
  /** Toujours inclus */
  googleReviewsSync: true;
  /** Section « Réseaux sociaux » du studio (contenus prêts à poster) — formule Scale */
  socialMedia: boolean;
  /** Section « Fiche Google » du studio (audit, visibilité, avis, posts) — formule Scale */
  googleProfile: boolean;
  /** Section « Google Ads » du studio (diagnostic, mots-clés, plan d'action, tuto et suivi) — formule Scale */
  googleAds: boolean;
  /** Section « Meta Ads » du studio (diagnostic, veille, annonces, plan vidéo, plan de campagne) — formule Scale */
  metaAds: boolean;
  /** Toujours inclus : statistiques du site hébergé, ou du site du praticien une fois connecté */
  advancedAnalytics: true;
  /** Hébergement et nom de domaine — formule Site */
  hostingAndDomain: boolean;
};

function definePlan(id: PlanId): PlanDefinition {
  const formulas = PLAN_FORMULAS[id];
  const site = formulas.includes("site");
  const scale = formulas.includes("scale");
  return {
    id,
    label: formulas.map((formula) => FORMULA_DEFINITIONS[formula].label).join(" + "),
    formulas,
    prices: Object.fromEntries(BILLING_PERIODS.map((period) => [period, formulas.reduce((total, formula) => total + formulaPrice(formula, period), 0)])),
    site,
    homeSpecialties: site ? 6 : 0,
    maxMotifPages: site ? 6 : 0,
    blogArticlesPerWeek: site ? 4 : 0,
    blogArticlesPerYear: site ? 208 : 0,
    searchConsoleAccess: site,
    academy: scale,
    googleReviewsSync: true,
    socialMedia: scale,
    googleProfile: scale,
    googleAds: scale,
    metaAds: scale,
    advancedAnalytics: true,
    hostingAndDomain: site,
  };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: definePlan("starter"),
  boost: definePlan("boost"),
  scale: definePlan("scale"),
};

// ─── Prix et durées ──────────────────────────────────────────────────────────

/** Durées proposées pour un choix de formules, de la plus courte à la plus longue. */
export function planPeriods(plan: PlanId): BillingPeriod[] {
  return BILLING_PERIODS.filter((period) => PLANS[plan].prices[period] !== undefined);
}

/** Prix par mois (€ TTC) d'un choix de formules sur une durée ; null si la durée n'est pas proposée. */
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
 * Économie d'une durée par rapport au mensuel, en euros sur la durée
 * d'engagement : l'écart de prix par mois × les mois d'engagement. Site en
 * annuel : (59 − 39) × 12 = 240 €.
 */
export function savedAmount(plan: PlanId, period: BillingPeriod): number {
  const monthly = planPrice(plan, "monthly");
  const price = planPrice(plan, period);
  if (monthly === null || price === null || price >= monthly) return 0;
  return (monthly - price) * commitmentMonths(period);
}

/**
 * La même économie, en mois de mensuel offerts sur la durée d'engagement
 * (arrondi vers le bas : jamais surestimée). Pour chaque formule comme pour
 * les deux : 2 mois en trimestriel, 4 en annuel, 18 sur 3 ans.
 */
export function savedMonths(plan: PlanId, period: BillingPeriod): number {
  const monthly = planPrice(plan, "monthly");
  return monthly ? Math.floor(savedAmount(plan, period) / monthly) : 0;
}

/**
 * La même économie, en pourcentage du prix mensuel (arrondi vers le bas) :
 * 16 % en trimestriel, 33 % en annuel, 50 % sur 3 ans.
 */
export function savedPercent(plan: PlanId, period: BillingPeriod): number {
  const monthly = planPrice(plan, "monthly");
  const price = planPrice(plan, period);
  if (monthly === null || price === null || price >= monthly) return 0;
  return Math.floor(((monthly - price) * 100) / monthly);
}

// ─── Ce que paie un abonnement ───────────────────────────────────────────────

export type SubscriptionPricing = {
  /** € TTC par mois */
  monthlyPrice: number;
  /** Mois réglés à chaque échéance */
  billedMonths: number;
};

/**
 * Prix d'un abonnement selon ses formules et sa durée. Les comptes ouverts
 * avant le découpage en deux formules étaient des comptes d'essai : ils
 * suivent l'offre actuelle comme les autres.
 */
export function subscriptionPricing(subscription: { plan: PlanId; billingPeriod: BillingPeriod }): SubscriptionPricing {
  const price = planPrice(subscription.plan, subscription.billingPeriod) ?? planPrice(subscription.plan, "monthly") ?? 0;
  return { monthlyPrice: price, billedMonths: BILLING_PERIOD_MONTHS[subscription.billingPeriod] };
}

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id];
}

// ─── Droits ──────────────────────────────────────────────────────────────────

/** Site internet hébergé par Harmony : éditeur, domaine, pages publiques (formule Site). */
export function hasSite(plan: PlanId): boolean {
  return PLANS[plan].site;
}

/** Peut-on ajouter une page de motif supplémentaire à ce site ? */
export function canAddMotifPage(plan: PlanId, currentMotifPageCount: number): boolean {
  return currentMotifPageCount < PLANS[plan].maxMotifPages;
}

/** Nombre de pages de motifs à générer pour une démo (plafonné par la formule). */
export function motifPagesAllowance(plan: PlanId): number {
  return PLANS[plan].maxMotifPages;
}

/** Blog SEO automatisé (formule Site). */
export function hasBlog(plan: PlanId): boolean {
  return PLANS[plan].blogArticlesPerWeek > 0;
}

export function hasSearchConsole(plan: PlanId): boolean {
  return PLANS[plan].searchConsoleAccess;
}

/** Académie, les formations du studio (formule Scale). */
export function hasAcademy(plan: PlanId): boolean {
  return PLANS[plan].academy;
}

/** Section « Réseaux sociaux » du studio (formule Scale ; les démos y ont accès). */
export function hasSocialMedia(plan: PlanId): boolean {
  return getPlan(plan).socialMedia;
}

/** Section « Fiche Google » du studio (formule Scale ; les démos y ont accès). */
export function hasGoogleProfile(plan: PlanId): boolean {
  return getPlan(plan).googleProfile;
}

/** Section « Google Ads » du studio (formule Scale ; les démos y ont accès). */
export function hasGoogleAds(plan: PlanId): boolean {
  return getPlan(plan).googleAds;
}

/** Section « Meta Ads » du studio (formule Scale ; les démos y ont accès). */
export function hasMetaAds(plan: PlanId): boolean {
  return getPlan(plan).metaAds;
}

const NBSP = "\u00a0";
const euros = (value: number) => `${value.toLocaleString("fr-FR")}${NBSP}€`;

/**
 * Ce que paie un abonnement, en une phrase (page Compte du studio, liste des
 * clients de l'admin) : « Annuel — 98 € TTC par mois, soit 1 176 € tous les
 * ans ».
 */
export function describeSubscriptionPricing(subscription: { plan: PlanId; billingPeriod: BillingPeriod }): string {
  const pricing = subscriptionPricing(subscription);
  const label = `${BILLING_PERIOD_LABELS[subscription.billingPeriod]} — ${euros(pricing.monthlyPrice)} TTC par mois`;
  if (pricing.billedMonths === 1) return label;
  return `${label}, soit ${euros(pricing.monthlyPrice * pricing.billedMonths)} ${BILLING_PERIOD_CADENCE[subscription.billingPeriod]}`;
}
