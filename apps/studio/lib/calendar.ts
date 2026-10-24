/**
 * Helpers de calendrier mensuel partagés par Publications et Réseaux sociaux.
 * Les bornes de mois et les créneaux sont calculés en UTC, comme les requêtes
 * de lecture (`getMonthItems`, `getSocialMonth`) ; le jour « d'aujourd'hui »
 * et l'affichage des horodatages (« Publié le … ») suivent le jour civil
 * Europe/Paris des praticiens.
 */

export const WEEKDAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;

/** Fuseau des praticiens : jour civil affiché et bornes des formulaires. */
export const PARIS_TZ = "Europe/Paris";

/** Années acceptées dans `?mois=` (au-delà, `monthRange` lèverait RangeError). */
const MONTH_PARAM_MIN_YEAR = 2000;
const MONTH_PARAM_MAX_YEAR = 2100;
const MONTH_PARAM_RE = /^(\d{4})-(\d{1,2})$/;

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

/** "YYYY-MM-DD" du jour civil Europe/Paris d'un instant. */
export function parisDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** "YYYY-MM-DD" décalé de `days` jours (arithmétique de calendrier, sans fuseau). */
export function shiftIsoDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `day` ramené dans [min, max] (comparaison lexicale de "YYYY-MM-DD"). */
export function clampIsoDay(day: string, min: string, max: string): string {
  if (day < min) return min;
  if (day > max) return max;
  return day;
}

export type DayStyle = "short" | "long" | "day";

const DAY_STYLES: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short" },
  long: { weekday: "long", day: "numeric", month: "long" },
  day: { day: "numeric", month: "long" },
};

/**
 * « 6 nov. » (short), « mercredi 12 novembre » (long) ou « 12 décembre » (day).
 * Une date « YYYY-MM-DD » est rendue telle quelle (UTC) ; un horodatage
 * complet est rendu au jour civil Europe/Paris (« Publié le », « Téléchargé le »).
 */
export function formatDayFr(iso: string, style: DayStyle = "short"): string {
  const dayOnly = iso.length === 10;
  const date = new Date(dayOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    ...DAY_STYLES[style],
    timeZone: dayOnly ? "UTC" : PARIS_TZ,
  }).format(date);
}

/** « novembre » depuis "YYYY-MM-DD" (UTC). */
export function monthNameFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** « de novembre » ou, devant une voyelle, « d'octobre » / « d'août » / « d'avril ». */
export function ofMonthFr(iso: string): string {
  const name = monthNameFr(iso);
  return /^[aeiouyàâäéèêëïîôöùûü]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/**
 * Lecture du paramètre `?mois=YYYY-MM` : année 2000..2100 et mois 1..12,
 * sinon repli sur le mois courant (UTC), comme sur la page Publications.
 */
export function parseMonthParam(mois: string | undefined, now = new Date()): { year: number; month: number } {
  const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const match = MONTH_PARAM_RE.exec((mois ?? "").trim());
  if (!match) return current;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MONTH_PARAM_MIN_YEAR || year > MONTH_PARAM_MAX_YEAR || month < 1 || month > 12) {
    return current;
  }
  return { year, month };
}
