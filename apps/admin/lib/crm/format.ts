/** Mises en forme partagées par les écrans du CRM (dates d'échéance, montants). Sans dépendance serveur. */

import { parisDayBounds } from "./filters";

const DAY = 86_400_000;

export const euros = (value: number) => `${value.toLocaleString("fr-FR")}\u00a0€`;

const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });
const DATE_YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" });

/** « 18 nov. », avec l'année quand ce n'est pas celle en cours. */
export function shortDate(date: Date, now: Date): string {
  return YEAR.format(date) === YEAR.format(now) ? DATE.format(date) : DATE_YEAR.format(date);
}

export function dateTime(date: Date): string {
  return DATE_TIME.format(date);
}

export type DueTone = "danger" | "warning" | "neutral";

/** Échéance d'une tâche, dite par rapport à aujourd'hui (heure de Paris). */
export function dueLabel(due: Date, now: Date): { text: string; tone: DueTone } {
  const { start, end } = parisDayBounds(now);
  if (due < start) {
    const days = Math.max(1, Math.ceil((start.getTime() - due.getTime()) / DAY));
    return { text: days === 1 ? "en retard depuis hier" : `en retard de ${days} jours`, tone: "danger" };
  }
  if (due < end) return { text: "aujourd'hui", tone: "warning" };
  if (due.getTime() < end.getTime() + DAY) return { text: "demain", tone: "neutral" };
  return { text: shortDate(due, now), tone: "neutral" };
}

/** Valeur d'un champ `<input type="date">` pour une date, vue de Paris. */
export function dateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(date);
}

/**
 * Instant d'une échéance saisie comme un jour (« 2026-11-20 ») : midi à
 * Paris, pour que la tâche tombe ce jour-là quel que soit le fuseau du
 * navigateur.
 */
export function dueDateFromInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const noonUtc = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime())) return null;
  // Décalage de Paris ce jour-là (une ou deux heures)
  const parisHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(noonUtc));
  return new Date(noonUtc.getTime() - (parisHour - 12) * 3_600_000).toISOString();
}
