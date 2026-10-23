/**
 * Helpers de calendrier mensuel partagés par Publications et Réseaux sociaux.
 * Tout est calculé en UTC, comme les requêtes de lecture (`getMonthItems`,
 * `getSocialMonth`).
 */

export const WEEKDAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;

/** Grille du mois : semaines lundi→dimanche, null hors du mois. */
export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = lundi

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** « novembre 2026 » (en minuscules, à capitaliser en CSS). */
export function monthLabelFr(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** « 2026-12 » : valeur du paramètre `?mois=` décalée de `delta` mois. */
export function shiftMonthParam(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * « 6 nov. » (short) ou « mercredi 12 novembre » (long) depuis "YYYY-MM-DD"
 * ou un horodatage ISO complet, en UTC comme le reste du calendrier.
 */
export function formatDayFr(iso: string, style: "short" | "long" = "short"): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(
    "fr-FR",
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" },
  ).format(date);
}

/** « novembre » depuis "YYYY-MM-DD" (UTC). */
export function monthNameFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/**
 * Lecture du paramètre `?mois=YYYY-MM` (repli : mois courant UTC), comme sur
 * la page Publications.
 */
export function parseMonthParam(mois: string | undefined, now = new Date()): { year: number; month: number } {
  const [yearStr, monthStr] = (mois ?? "").split("-");
  const year = Number(yearStr) || now.getUTCFullYear();
  const month = Number(monthStr) || now.getUTCMonth() + 1;
  return { year, month: Math.min(12, Math.max(1, month)) };
}
