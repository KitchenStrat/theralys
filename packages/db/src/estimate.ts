/**
 * Simulateur de rentabilité de la vitrine : ses bornes, son calcul, et
 * l'estimation envoyée par e-mail au praticien qui la demande.
 *
 * Le simulateur ne promet rien : le praticien pose ses propres hypothèses
 * (tarif, nouveaux patients, séances par patient) et lit ce qu'elles
 * représentent face au prix de l'abonnement, lu dans la définition des
 * formules. La page et l'e-mail partagent ce module : ils ne peuvent pas
 * afficher deux résultats différents.
 */

import { PLANS, PLAN_COMPLETE, PLAN_SCALE, PLAN_SITE, BILLING_PERIODS, planPrice, type BillingPeriod, type PlanId } from "./plans";

/** Les curseurs du simulateur. */
export const ESTIMATE_BOUNDS = {
  price: { min: 30, max: 150, step: 5, default: 60 },
  patients: { min: 1, max: 40, step: 1, default: 10 },
  sessions: { min: 1, max: 10, step: 1, default: 3 },
} as const;

/** Une formule seule, ou les deux. */
export const ESTIMATE_CHOICES = ["site", "scale", "both"] as const;
export type EstimateChoice = (typeof ESTIMATE_CHOICES)[number];

const CHOICE_PLAN: Record<EstimateChoice, PlanId> = { site: PLAN_SITE, scale: PLAN_SCALE, both: PLAN_COMPLETE };

/** La durée telle qu'elle se lit après « votre abonnement » ou « au tarif Scale ». */
export const ESTIMATE_PERIOD_PHRASES: Record<BillingPeriod, string> = {
  monthly: "en mensuel",
  quarterly: "en trimestriel",
  annual: "en annuel",
  triennial: "sur 3 ans",
};

export type EstimateInput = {
  /** Tarif d'une séance, en euros */
  price: number;
  /** Nouveaux patients venus d'internet, par mois */
  patients: number;
  /** Séances par patient, en moyenne */
  sessions: number;
  choice: EstimateChoice;
  period: BillingPeriod;
};

export type RoiFigures = {
  /** Ce que ces patients représentent, par mois */
  revenue: number;
  /** Nombre de séances qui couvrent un mois d'abonnement */
  breakEven: number;
  /** Rapport entre ce revenu et le prix de l'abonnement */
  ratio: number;
};

/** Le calcul lui-même, pour un prix d'abonnement par mois donné. */
export function roiFigures(price: number, patients: number, sessions: number, monthlyCost: number): RoiFigures {
  const revenue = price * patients * sessions;
  return { revenue, breakEven: Math.max(1, Math.ceil(monthlyCost / price)), ratio: monthlyCost > 0 ? revenue / monthlyCost : 0 };
}

/** « environ 18 fois », « plus que », « moins que » — ce que le revenu représente face au prix de l'abonnement. */
export function roiComparison(ratio: number): string {
  return ratio >= 1.5 ? `environ ${Math.round(ratio).toLocaleString("fr-FR")} fois` : ratio >= 1 ? "plus que" : "moins que";
}

const NBSP = String.fromCharCode(160);

export const estimateEuros = (amount: number): string => `${Math.round(amount).toLocaleString("fr-FR")}${NBSP}€`;
export const estimatePlural = (count: number, one: string, many: string): string => `${count.toLocaleString("fr-FR")} ${count > 1 ? many : one}`;

function onStep(value: unknown, bounds: { min: number; max: number; step: number }): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= bounds.min && value <= bounds.max && (value - bounds.min) % bounds.step === 0;
}

/**
 * Relit des hypothèses venues du navigateur : chaque valeur doit être une
 * position possible de son curseur, la formule et la durée des valeurs
 * connues. Null sinon.
 */
export function checkEstimateInput(raw: unknown): EstimateInput | null {
  if (!raw || typeof raw !== "object") return null;
  const { price, patients, sessions, choice, period } = raw as Record<string, unknown>;
  if (!onStep(price, ESTIMATE_BOUNDS.price) || !onStep(patients, ESTIMATE_BOUNDS.patients) || !onStep(sessions, ESTIMATE_BOUNDS.sessions)) return null;
  if (!(ESTIMATE_CHOICES as readonly unknown[]).includes(choice) || !(BILLING_PERIODS as readonly unknown[]).includes(period)) return null;
  return { price, patients, sessions, choice: choice as EstimateChoice, period: period as BillingPeriod };
}

export type Estimate = EstimateInput &
  RoiFigures & {
    /** « Site », « Scale », « Site + Scale » */
    planLabel: string;
    /** Prix de l'abonnement par mois, sur la durée choisie */
    monthlyCost: number;
    periodPhrase: string;
  };

/** L'estimation complète, au prix de la définition des formules. Null si la formule n'est pas proposée sur cette durée. */
export function buildEstimate(input: EstimateInput): Estimate | null {
  const plan = CHOICE_PLAN[input.choice];
  const monthlyCost = planPrice(plan, input.period);
  if (monthlyCost === null || monthlyCost <= 0) return null;
  return {
    ...input,
    ...roiFigures(input.price, input.patients, input.sessions, monthlyCost),
    planLabel: PLANS[plan].label,
    monthlyCost,
    periodPhrase: ESTIMATE_PERIOD_PHRASES[input.period],
  };
}

/** La phrase de synthèse, la même sur la page et dans l'e-mail. */
export function estimateSentence(estimate: Estimate): string {
  return `Avec ces hypothèses, ${estimatePlural(estimate.patients, "nouveau patient", "nouveaux patients")} par mois ${estimate.patients > 1 ? "représentent" : "représente"} ${roiComparison(estimate.ratio)} le prix de l'abonnement.`;
}

/** Ce que le CRM retient de l'estimation demandée. */
export function estimateLeadNotes(estimate: Estimate): string {
  return `Estimation du simulateur : séance à ${estimateEuros(estimate.price)}, ${estimatePlural(estimate.patients, "nouveau patient", "nouveaux patients")} par mois, ${estimatePlural(estimate.sessions, "séance", "séances")} par patient — ${estimateEuros(estimate.revenue)} par mois face à un abonnement ${estimate.planLabel} ${estimate.periodPhrase} à ${estimateEuros(estimate.monthlyCost)}, couvert dès ${estimatePlural(estimate.breakEven, "séance", "séances")}.`;
}

const DISCLAIMER =
  "C'est une simulation sur vos propres hypothèses : Harmony ne promet pas un nombre de patients. Vos résultats dépendent de votre ville, de votre spécialité et de la concurrence.";

/**
 * L'e-mail « Votre estimation » : les hypothèses, le calcul, et le lien vers
 * la demande de démo. Il ne contient aucun texte saisi par le visiteur — que
 * des nombres relus et des phrases écrites ici.
 */
export function estimateEmail(estimate: Estimate, siteUrl: string): { subject: string; text: string; html: string } {
  const demoUrl = `${siteUrl.replace(/\/+$/, "")}/#demo`;
  const hypotheses: [string, string][] = [
    ["Tarif de votre séance", estimateEuros(estimate.price)],
    ["Nouveaux patients venus d'internet", `${estimate.patients.toLocaleString("fr-FR")} par mois`],
    ["Séances par patient", `${estimate.sessions.toLocaleString("fr-FR")} en moyenne`],
  ];
  const results: [string, string][] = [
    ["Ce que ces patients représentent", `${estimateEuros(estimate.revenue)} par mois`],
    [`Votre abonnement Harmony (${estimate.planLabel}, ${estimate.periodPhrase})`, `${estimateEuros(estimate.monthlyCost)} par mois`],
    ["L'abonnement est couvert dès", `${estimatePlural(estimate.breakEven, "séance", "séances")} par mois`],
  ];
  const sentence = estimateSentence(estimate);
  const subject = `Votre estimation Harmony : couvert dès ${estimatePlural(estimate.breakEven, "séance", "séances")} par mois`;
  const lines = (rows: [string, string][]) => rows.map(([label, value]) => `- ${label} : ${value}`).join("\n");
  const text = [
    "Bonjour,",
    "Voici l'estimation que vous venez de faire sur le simulateur de Harmony.",
    `Vos hypothèses\n${lines(hypotheses)}`,
    `Le calcul\n${lines(results)}`,
    sentence,
    DISCLAIMER,
    `Envie de voir ce que cela donnerait pour votre cabinet ? Demandez votre démo personnalisée, gratuite et sans engagement :\n${demoUrl}`,
    "L'équipe Harmony",
  ].join("\n\n");
  const cell = "padding:8px 0;border-bottom:1px solid #e6eef5;font-size:15px;";
  const table = (rows: [string, string][]) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows
      .map(([label, value]) => `<tr><td style="${cell}color:#3d5266;">${label}</td><td style="${cell}color:#0f2a3d;font-weight:600;text-align:right;white-space:nowrap;">${value}</td></tr>`)
      .join("")}</table>`;
  const heading = "margin:24px 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#5b7186;";
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f2a3d;line-height:1.55;">`,
    `<p style="font-size:22px;font-weight:700;color:#036fa8;margin:0 0 16px;">Harmony</p>`,
    `<p style="font-size:15px;margin:0;">Bonjour,</p>`,
    `<p style="font-size:15px;">Voici l'estimation que vous venez de faire sur le simulateur de Harmony.</p>`,
    `<p style="${heading}">Vos hypothèses</p>`,
    table(hypotheses),
    `<p style="${heading}">Le calcul</p>`,
    table(results),
    `<p style="font-size:15px;background:#f0f8ff;border-radius:12px;padding:14px 16px;margin:20px 0;">${sentence}</p>`,
    `<p style="font-size:13px;color:#5b7186;">${DISCLAIMER}</p>`,
    `<p style="font-size:15px;margin-top:24px;">Envie de voir ce que cela donnerait pour votre cabinet ?</p>`,
    `<p style="margin:16px 0 24px;"><a href="${demoUrl}" style="display:inline-block;background:#037bbd;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px;">Demander ma démo gratuite</a></p>`,
    `<p style="font-size:13px;color:#5b7186;">Gratuite, sans engagement.<br>L'équipe Harmony</p>`,
    `</div>`,
  ].join("");
  return { subject, text, html };
}
