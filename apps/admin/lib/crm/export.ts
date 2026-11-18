/**
 * Export CSV de la liste des prospects, lisible tel quel par Excel en France :
 * séparateur point-virgule, marque d'ordre des octets pour les accents.
 */

import { BILLING_PERIOD_LABELS, PLANS, type BillingPeriod, type PlanId } from "@theralys/db/plans";
import { STAGE_META, isCrmStage, isPeriodInterest, isPlanInterest, sourceLabel } from "./model";
import { formatPhone } from "./normalize";

export type ExportRow = {
  firstName: string;
  lastName: string;
  company: string;
  profession: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string;
  website: string | null;
  stage: string;
  source: string;
  tags: string[];
  plan: string | null;
  billingPeriod: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  lastContactAt: Date | null;
  doNotContact: boolean;
  notes: string | null;
  createdAt: Date;
};

export const EXPORT_HEADERS = ["Prénom", "Nom", "Cabinet", "Métier", "E-mail", "Téléphone", "Adresse", "Code postal", "Ville", "Site internet", "Étape", "Provenance", "Étiquettes", "Formule envisagée", "Prochaine tâche", "Échéance", "Dernier contact", "Ne pas contacter", "Notes", "Ajouté le"];

/**
 * Une cellule de CSV. Un texte qui commence par =, +, - ou @ serait lu comme
 * une formule par un tableur : on le fait précéder d'une apostrophe.
 */
export function csvCell(value: string): string {
  let text = value.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const day = (date: Date | null) => (date ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date) : "");

function planText(row: ExportRow): string {
  if (!isPlanInterest(row.plan)) return "";
  const label = PLANS[row.plan as PlanId].label;
  return isPeriodInterest(row.billingPeriod) ? `${label} (${BILLING_PERIOD_LABELS[row.billingPeriod as BillingPeriod].toLowerCase()})` : label;
}

export function exportCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.firstName,
        row.lastName,
        row.company,
        row.profession,
        row.email ?? "",
        formatPhone(row.phone),
        row.address ?? "",
        row.postalCode ?? "",
        row.city,
        row.website ?? "",
        isCrmStage(row.stage) ? STAGE_META[row.stage].label : row.stage,
        sourceLabel(row.source),
        row.tags.join(", "),
        planText(row),
        row.nextAction ?? "",
        day(row.nextActionAt),
        day(row.lastContactAt),
        row.doNotContact ? "oui" : "",
        row.notes ?? "",
        day(row.createdAt),
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return `${String.fromCharCode(0xfeff)}${lines.join("\r\n")}\r\n`;
}
