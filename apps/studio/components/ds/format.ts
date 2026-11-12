/** Espace insécable : le nombre et son unité ne se séparent jamais en fin de ligne. */
export const NBSP = "\u00a0";

/** Mise en forme française des nombres : « 1 284 », « 4,9 », « +12 % ». */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("fr-FR", options).format(value);
}

/** Variation signée : « +12 % », « −3 % », « 0 % » (signe moins typographique, espace insécable). */
export function formatDelta(value: number, unit = "%", options?: Intl.NumberFormatOptions): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = formatNumber(Math.abs(value), { maximumFractionDigits: 1, ...options });
  return unit ? `${sign}${abs}${NBSP}${unit}` : `${sign}${abs}`;
}

/** Accord simple : `plural(3, "visite", "visites")` → « 3 visites ». */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)}${NBSP}${Math.abs(count) < 2 ? singular : pluralForm}`;
}

/** Durée écoulée : 42 → « 0:42 », 95 → « 1:35 ». */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
