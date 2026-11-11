import { USD_TO_EUR_RATE } from "@theralys/shared";

/**
 * Mise en forme des chiffres du pilotage des API — fonctions pures, testées
 * unitairement, sans dépendance serveur (utilisables par un composant client).
 *
 * Le registre est en dollars ; tout l'affichage est en euros, au format
 * français. Les coûts unitaires valent souvent moins d'un centime : la
 * précision s'adapte au montant.
 */

/** Fuseau d'affichage des dates et des heures (les périodes, elles, sont découpées en temps universel). */
export const DISPLAY_TIME_ZONE = "Europe/Paris";

const NBSP = "\u00a0";
const MINUS = "\u2212";

const finite = (value: number | null | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Dollars du registre → euros affichés (`USD_TO_EUR_RATE`). */
export function usdToEur(usd: number): number {
  return finite(usd) * USD_TO_EUR_RATE;
}

function decimalsFor(abs: number): number {
  if (abs >= 1000) return 0;
  if (abs >= 0.1) return 2;
  if (abs >= 0.001) return 3;
  if (abs >= 0.0001) return 4;
  return 5;
}

/**
 * Montant en euros, précision adaptée : « 1 235 € », « 12,34 € », « 0,35 € »,
 * « 0,004 € », « 0,0004 € ». En dessous du cent-millième : « < 0,00001 € ».
 */
export function formatEur(eur: number | null | undefined): string {
  const value = finite(eur);
  const abs = Math.abs(value);
  if (abs === 0) return `0${NBSP}€`;
  if (abs < 0.00001) return `<${NBSP}0,00001${NBSP}€`;
  const decimals = decimalsFor(abs);
  const text = abs.toLocaleString("fr-FR", {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? MINUS : ""}${text}${NBSP}€`;
}

/** Prix d'un abonnement : sans décimales quand il est rond (« 79 € »), au centime sinon (« 65,83 € »). */
export function formatPrice(eur: number | null | undefined): string {
  const value = finite(eur);
  const text = Math.abs(value).toLocaleString("fr-FR", Number.isInteger(value) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? MINUS : ""}${text}${NBSP}€`;
}

/** Coût du registre (dollars) affiché en euros. */
export function formatUsdAsEur(usd: number | null | undefined): string {
  return formatEur(usdToEur(finite(usd)));
}

/** Montant en dollars (prix catalogue rappelé à côté de l'euro). */
export function formatUsd(usd: number | null | undefined): string {
  const value = finite(usd);
  const abs = Math.abs(value);
  if (abs === 0) return `0${NBSP}$`;
  const decimals = decimalsFor(abs);
  const text = abs.toLocaleString("fr-FR", {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? MINUS : ""}${text}${NBSP}$`;
}

/** Nombre entier au format français : « 1 234 ». */
export function formatCount(value: number | null | undefined): string {
  return Math.round(finite(value)).toLocaleString("fr-FR");
}

/** Grand nombre abrégé : « 999 », « 1,2 k », « 340 k », « 1,2 M », « 3,4 Md ». */
export function formatCompact(value: number | null | undefined): string {
  const n = finite(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  const scaled = (divisor: number, suffix: string) => {
    const quotient = abs / divisor;
    const text = quotient.toLocaleString("fr-FR", { maximumFractionDigits: quotient >= 100 ? 0 : 1 });
    return `${sign}${text}${NBSP}${suffix}`;
  };
  // Les seuils tiennent compte de l'arrondi : 999 950 s'écrit « 1 M », pas « 1 000 k »
  if (abs >= 999_950_000) return scaled(1_000_000_000, "Md");
  if (abs >= 999_500) return scaled(1_000_000, "M");
  if (abs >= 1000) return scaled(1000, "k");
  return `${sign}${abs.toLocaleString("fr-FR", { maximumFractionDigits: Number.isInteger(abs) ? 0 : 1 })}`;
}

/** Volume Anthropic : « 1,2 M entrée / 340 k sortie ». */
export function formatTokens(inputTokens: number, outputTokens: number): string {
  return `${formatCompact(inputTokens)} entrée / ${formatCompact(outputTokens)} sortie`;
}

/** Volume dans l'unité du fournisseur, accordée au nombre : « 1 image », « 49 requêtes ». */
export function formatUnits(units: number | null | undefined, unit: string): string {
  const n = finite(units);
  const label = Math.abs(n) < 2 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  return `${formatCompact(n)} ${label}`;
}

/** Part ou taux (0 à 1) en pourcentage : « 12 % », « 3,4 % », « 0,4 % », « < 0,1 % ». */
export function formatPercent(ratio: number | null | undefined): string {
  const pct = finite(ratio) * 100;
  const abs = Math.abs(pct);
  if (abs === 0) return `0${NBSP}%`;
  if (abs < 0.1) return `<${NBSP}0,1${NBSP}%`;
  const text = abs.toLocaleString("fr-FR", { maximumFractionDigits: abs >= 10 ? 0 : 1 });
  return `${pct < 0 ? MINUS : ""}${text}${NBSP}%`;
}

/**
 * Variation par rapport à la période précédente (`null` : pas de point de
 * comparaison). `value` est un ratio : 0,12 → « +12 % ».
 */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const abs = Math.abs(pct);
  if (abs < 0.5) return "stable";
  // Au-delà de +1 000 %, un multiple se lit mieux qu'un pourcentage
  if (pct >= 1000) return `×${NBSP}${(value + 1).toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;
  return `${pct > 0 ? "+" : MINUS}${abs.toLocaleString("fr-FR", { maximumFractionDigits: abs >= 10 ? 0 : 1 })}${NBSP}%`;
}

/** Durée d'un appel : « 850 ms », « 2,4 s », « 1 min 12 s ». */
export function formatDuration(ms: number | null | undefined): string {
  const value = Math.max(0, finite(ms));
  if (value < 1000) return `${Math.round(value)}${NBSP}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toLocaleString("fr-FR", { maximumFractionDigits: seconds >= 10 ? 0 : 1 })}${NBSP}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest > 0 ? `${minutes}${NBSP}min ${rest}${NBSP}s` : `${minutes}${NBSP}min`;
}

/**
 * Montant d'une graduation d'axe : autant de décimales que le pas en demande,
 * les mêmes sur tout l'axe (« 0 € », « 25 € », « 2,50 € », « 0,005 € »).
 */
export function formatAxisEur(value: number, step: number): string {
  const safeStep = Math.abs(finite(step));
  let decimals = 0;
  // Pas entier : pas de décimales ; sinon au moins les centimes, davantage si le pas est plus fin
  if (safeStep > 0 && !Number.isInteger(safeStep)) {
    decimals = 2;
    while (decimals < 6 && Math.abs(safeStep * 10 ** decimals - Math.round(safeStep * 10 ** decimals)) > 1e-9) decimals++;
  }
  const amount = finite(value);
  if (amount === 0) return `0${NBSP}€`;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${NBSP}€`;
}

/**
 * Ancienneté courte d'un événement : « à l'instant », « il y a 3 min »,
 * « il y a 2 h », « il y a 5 j » ; au-delà d'un mois, la date (« 3 oct. 2026 »).
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}${NBSP}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours}${NBSP}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `il y a ${days}${NBSP}j`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: DISPLAY_TIME_ZONE }).format(date);
}

/** Heure d'affichage : « 14:32 ». */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE }).format(date);
}

/** Date et heure d'une ligne du journal : « 11/11/2026 14:32:05 ». */
export function formatDateTime(date: Date): string {
  const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: DISPLAY_TIME_ZONE }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: DISPLAY_TIME_ZONE }).format(date);
  return `${day} ${time}`;
}

/** Date et heure sans les secondes : « 11 novembre 2026 à 14:32 ». */
export function formatLongDateTime(date: Date): string {
  return `${formatLongDate(date)} à ${formatTime(date)}`;
}

/** Horodatage compact du journal, sans l'année : « 11/11 14:32:05 ». */
export function formatDayTime(date: Date): string {
  const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: DISPLAY_TIME_ZONE }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: DISPLAY_TIME_ZONE }).format(date);
  return `${day} ${time}`;
}

/** Date longue : « 3 novembre 2026 ». */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: DISPLAY_TIME_ZONE }).format(date);
}

/**
 * Libellé d'un intervalle du graphique. Jour (`2026-11-03`, temps universel) :
 * « 3 nov. » — ou « mardi 3 novembre » en version longue. Heure
 * (`2026-11-11T14`) : « 15 h », à l'heure de Paris.
 */
export function formatBucket(bucket: string, style: "short" | "long" = "short"): string {
  if (bucket.length > 10) {
    const date = new Date(`${bucket}:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return bucket;
    const hour = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: DISPLAY_TIME_ZONE }).format(date).replace(/\D+/g, "");
    if (style === "short") return `${Number(hour)}${NBSP}h`;
    const next = (Number(hour) + 1) % 24;
    return `de ${Number(hour)}${NBSP}h à ${next}${NBSP}h`;
  }
  const date = new Date(`${bucket}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  return new Intl.DateTimeFormat(
    "fr-FR",
    style === "short" ? { day: "numeric", month: "short", timeZone: "UTC" } : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
  ).format(date);
}
