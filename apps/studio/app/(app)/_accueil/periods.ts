import type { Period } from "@/lib/data";

/**
 * Les trois périodes de l'accueil, telles qu'on les dit au praticien. La
 * période vit dans l'adresse (`?periode=30j`, absent pour 7 jours) : le
 * sélecteur est fait de liens, la page est relue côté serveur.
 */
export const PERIODS: readonly {
  key: Period;
  /** Libellé du sélecteur */
  tab: string;
  href: string;
  /** Après un chiffre : « 62 visiteurs sur 7 jours » */
  caption: string;
  /** En tête de phrase : « Ces 7 derniers jours, … » */
  lead: string;
  /** Après une variation : « +12 % en 7 jours » */
  delta: string;
  /** La période de comparaison, dite en entier */
  previous: string;
}[] = [
  { key: "7j", tab: "7 jours", href: "/", caption: "sur 7 jours", lead: "Ces 7 derniers jours", delta: "en 7 jours", previous: "les 7 jours précédents" },
  { key: "30j", tab: "30 jours", href: "/?periode=30j", caption: "sur 30 jours", lead: "Ces 30 derniers jours", delta: "en 30 jours", previous: "les 30 jours précédents" },
  { key: "6m", tab: "6 mois", href: "/?periode=6m", caption: "sur 6 mois", lead: "Ces 6 derniers mois", delta: "en 6 mois", previous: "les 6 mois précédents" },
];

export type PeriodLabels = (typeof PERIODS)[number];

export function periodLabels(period: Period): PeriodLabels {
  return PERIODS.find((entry) => entry.key === period) ?? PERIODS[0]!;
}
