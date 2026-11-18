/**
 * Modèle du CRM : étapes du cycle de vente, provenances, types d'activité et
 * champs d'un prospect. Module sans dépendance serveur : il sert aussi bien
 * aux pages qu'aux composants du navigateur.
 */

import { planPrice, type BillingPeriod, type PlanId } from "@theralys/db/plans";

// ─── Étapes du cycle de vente ────────────────────────────────────────────────

export const CRM_STAGES = ["new", "contacted", "qualified", "demo", "meeting", "proposal", "won", "lost"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

/** Étapes en cours : tout sauf gagné et perdu. */
export const OPEN_STAGES: readonly CrmStage[] = ["new", "contacted", "qualified", "demo", "meeting", "proposal"];

export type StageTone = "neutral" | "info" | "primary" | "warning" | "success" | "danger";

export const STAGE_META: Record<CrmStage, { label: string; hint: string; tone: StageTone }> = {
  new: { label: "À contacter", hint: "Prospect entré dans le CRM, pas encore joint", tone: "neutral" },
  contacted: { label: "Contacté", hint: "Premier appel ou message passé", tone: "info" },
  qualified: { label: "Intéressé", hint: "Le besoin est confirmé", tone: "primary" },
  demo: { label: "Démo envoyée", hint: "Sa démo personnalisée lui a été envoyée", tone: "primary" },
  meeting: { label: "Rendez-vous", hint: "Un rendez-vous de présentation est pris", tone: "warning" },
  proposal: { label: "Proposition", hint: "L'offre est faite, décision attendue", tone: "warning" },
  won: { label: "Client", hint: "Abonnement signé", tone: "success" },
  lost: { label: "Perdu", hint: "Affaire close sans suite", tone: "danger" },
};

export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === "string" && (CRM_STAGES as readonly string[]).includes(value);
}

/** Corbeille : une fiche supprimée garde son étape d'origine derrière ce préfixe (voir `trash.ts`). */
export const TRASH_PREFIX = "trash:";

export function isTrashed(stage: string): boolean {
  return stage.startsWith(TRASH_PREFIX);
}

/** Étape d'une fiche, qu'elle soit ou non à la corbeille. */
export function stageOf(stage: string): CrmStage {
  const own = isTrashed(stage) ? stage.slice(TRASH_PREFIX.length) : stage;
  return isCrmStage(own) ? own : "new";
}

/** Étape du CRM pour un statut de l'ancienne table `leads`. */
export function stageFromLeadStatus(status: string): CrmStage {
  if (status === "demo_sent") return "demo";
  if (status === "meeting") return "meeting";
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  return "new";
}

// ─── Provenances ─────────────────────────────────────────────────────────────

/** Provenances connues ; une liste importée peut porter n'importe quel autre libellé. */
export const SOURCE_LABELS: Record<string, string> = {
  manual: "Saisie manuelle",
  import: "Liste importée",
  landing: "Demande sur la vitrine",
  demo: "Démo créée",
  referral: "Parrainage",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

// ─── Activités ───────────────────────────────────────────────────────────────

/** Activités que l'on saisit à la main sur une fiche. */
export const LOGGABLE_KINDS = ["note", "call", "email", "meeting"] as const;
export type LoggableKind = (typeof LOGGABLE_KINDS)[number];

export const ACTIVITY_KINDS = [...LOGGABLE_KINDS, "task", "stage", "system"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note: "Note",
  call: "Appel",
  email: "E-mail",
  meeting: "Rendez-vous",
  task: "Tâche",
  stage: "Changement d'étape",
  system: "CRM",
};

/** Un appel, un e-mail ou un rendez-vous compte comme un contact avec le prospect. */
export function isContactKind(kind: string): boolean {
  return kind === "call" || kind === "email" || kind === "meeting";
}

// ─── Champs d'un prospect ────────────────────────────────────────────────────

export const CONTACT_TEXT_FIELDS = ["firstName", "lastName", "company", "profession", "email", "phone", "website", "address", "postalCode", "city", "notes"] as const;
export type ContactTextField = (typeof CONTACT_TEXT_FIELDS)[number];

/** Longueur maximale de chaque champ texte (saisie comme import). */
export const FIELD_MAX: Record<ContactTextField, number> = {
  firstName: 80,
  lastName: 80,
  company: 160,
  profession: 120,
  email: 200,
  phone: 30,
  website: 300,
  address: 200,
  postalCode: 12,
  city: 120,
  notes: 4000,
};

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const MAX_EXTRA_FIELDS = 20;
export const MAX_EXTRA_VALUE = 300;

/** Un prospect tel qu'il sort d'un fichier ou d'un formulaire, avant enregistrement. */
export type ContactDraft = {
  firstName: string;
  lastName: string;
  company: string;
  profession: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  tags: string[];
  /** Étape lue dans le fichier, si une colonne la donnait */
  stage?: CrmStage;
  /** Provenance lue dans le fichier, si une colonne la donnait */
  source?: string;
  extra: Record<string, string>;
};

export function emptyDraft(): ContactDraft {
  return { firstName: "", lastName: "", company: "", profession: "", email: "", phone: "", website: "", address: "", postalCode: "", city: "", notes: "", tags: [], extra: {} };
}

/** Nom affiché d'un prospect : la personne, sinon le cabinet, sinon ce qu'on a pour le joindre. */
export function displayName(contact: { firstName: string; lastName: string; company: string; email?: string | null; phone?: string | null }): string {
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return person || contact.company || contact.email || contact.phone || "Prospect sans nom";
}

// ─── Valeur d'un prospect ────────────────────────────────────────────────────

const PLAN_IDS: readonly string[] = ["starter", "scale"];
const PERIOD_IDS: readonly string[] = ["monthly", "quarterly", "annual", "triennial"];

/**
 * Revenu mensuel qu'un prospect représenterait s'il signait : le prix de la
 * formule envisagée sur la durée envisagée (annuel par défaut), lu dans la
 * définition des formules. 0 tant qu'aucune formule n'est renseignée.
 */
export function contactMonthlyValue(contact: { plan: string | null; billingPeriod: string | null }): number {
  if (!contact.plan || !PLAN_IDS.includes(contact.plan)) return 0;
  const period = contact.billingPeriod && PERIOD_IDS.includes(contact.billingPeriod) ? (contact.billingPeriod as BillingPeriod) : "annual";
  return planPrice(contact.plan as PlanId, period) ?? 0;
}

export function isPlanInterest(value: unknown): value is "starter" | "scale" {
  return typeof value === "string" && PLAN_IDS.includes(value);
}

export function isPeriodInterest(value: unknown): value is BillingPeriod {
  return typeof value === "string" && PERIOD_IDS.includes(value);
}
