/**
 * Ce que l'assistant de l'équipe commerciale sait du produit, écrit à partir
 * de sa définition (`@theralys/db`) : formules, contenu, prix sur chaque
 * durée, économies, engagement. Aucun chiffre n'est recopié ici — changer un
 * prix dans la définition le change dans les réponses de l'assistant, comme
 * sur la vitrine et dans la facturation.
 */

import {
  BILLING_PERIODS,
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  MIN_COMMITMENT_MONTHS,
  PLANS,
  PLAN_COMPLETE,
  PLAN_SCALE,
  PLAN_SITE,
  commitmentMonths,
  periodTotal,
  planPrice,
  savedAmount,
  savedMonths,
  savedPercent,
  type BillingPeriod,
  type PlanId,
} from "@theralys/db/plans";

const euros = (value: number) => `${value.toLocaleString("fr-FR").replace(/[\u00a0\u202f]/g, " ")} €`;

const duration = (months: number) => (months % 12 === 0 && months > 12 ? `${months / 12} ans` : `${months} mois`);

function priceLine(plan: PlanId): string {
  const parts = BILLING_PERIODS.map((period) => {
    const price = planPrice(plan, period);
    const total = periodTotal(plan, period);
    if (price === null || total === null) return null;
    const label = BILLING_PERIOD_LABELS[period].toLowerCase();
    return period === "monthly" ? `${label} ${euros(price)} par mois` : `${label} ${euros(price)} par mois (soit ${euros(total)} réglés ${BILLING_PERIOD_CADENCE[period]})`;
  }).filter(Boolean);
  return `- ${PLANS[plan].label} : ${parts.join(" ; ")}.`;
}

function savingLine(period: BillingPeriod): string | null {
  const months = savedMonths(PLAN_COMPLETE, period);
  if (months === 0) return null;
  const amounts = [PLAN_SITE, PLAN_SCALE, PLAN_COMPLETE].map((plan) => `${PLANS[plan].label} ${euros(savedAmount(plan, period))}`).join(", ");
  return `- ${BILLING_PERIOD_LABELS[period]} : ${months} mois offerts (−${savedPercent(PLAN_COMPLETE, period)} % par rapport au mensuel), soit sur ${duration(commitmentMonths(period))} : ${amounts}.`;
}

/** Les faits du produit, en clair, tels qu'ils partent dans le prompt de l'assistant. */
export function productFacts(): string {
  const site = PLANS[PLAN_SITE];
  const scale = PLANS[PLAN_SCALE];
  const ads = [scale.googleAds && "Google Ads", scale.metaAds && "Meta Ads"].filter(Boolean).join(" et ");
  const siteLines = [
    "site professionnel clé en main, aux couleurs du praticien, hébergé par Harmony",
    `${site.maxMotifPages} pages de spécialités pour le référencement local`,
    `blog rédigé automatiquement : ${site.blogArticlesPerWeek} articles par semaine, soit ${site.blogArticlesPerYear} par an`,
    site.hostingAndDomain && "hébergement et nom de domaine inclus",
    "statistiques et avis Google",
  ].filter(Boolean);
  const scaleLines = [
    scale.googleProfile && "fiche Google : audit, visibilité, avis et posts",
    scale.socialMedia && "réseaux sociaux : contenus prêts à poster",
    ads && `${ads} : diagnostic, plan d'action et contenus (le budget publicitaire n'est pas compris)`,
    "statistiques et avis Google",
  ].filter(Boolean);
  const longest = BILLING_PERIODS.filter((period) => commitmentMonths(period) > MIN_COMMITMENT_MONTHS);
  return [
    "FORMULES",
    "- Harmony se compose de deux formules indépendantes, Site et Scale : un praticien prend l'une, l'autre, ou les deux.",
    `- Formule Site : ${siteLines.join(" ; ")}.`,
    `- Formule Scale : ${scaleLines.join(" ; ")}. Elle ne comprend pas le site : ses outils s'appuient sur le site Harmony du praticien s'il a aussi la formule Site, sinon sur son propre site, qu'il connecte.`,
    "- Les deux formules ensemble forment l'offre complète ; son prix est la somme des deux.",
    "",
    "PRIX (TTC, par mois ; la somme est réglée d'avance à chaque échéance)",
    priceLine(PLAN_SITE),
    priceLine(PLAN_SCALE),
    priceLine(PLAN_COMPLETE),
    "",
    "ÉCONOMIES SELON LA DURÉE",
    ...BILLING_PERIODS.map(savingLine).filter((line): line is string => line !== null),
    "",
    "ENGAGEMENT",
    `- ${MIN_COMMITMENT_MONTHS} mois minimum, quelle que soit la durée de facturation.`,
    ...longest.map((period) => `- ${BILLING_PERIOD_LABELS[period]} : engagement de ${duration(commitmentMonths(period))}.`),
  ].join("\n");
}
