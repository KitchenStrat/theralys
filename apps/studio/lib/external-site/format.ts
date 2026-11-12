/**
 * Écran « Mon site » : mises en forme du site du client (adresse, dates,
 * nature des pages lues, ce qui a été repéré dans son code). Module pur.
 *
 * Les dates sont rendues au fuseau de Paris, quel que soit celui du serveur :
 * elles sont formatées une fois, côté serveur, et passées en texte aux
 * composants (jamais reformatées dans le navigateur).
 */

import { EXTERNAL_CMS_LABELS, type ExternalPageKind, type ExternalSiteFacts } from "@theralys/shared";

const PARIS_TZ = "Europe/Paris";
/** Espace insécable : « 10 h 32 », « 3 lectures » ne se coupent pas en fin de ligne. */
const NBSP = " ";

/** Adresse telle qu'on la lit : sans protocole ni barre finale (`www.mon-cabinet.fr`). */
export function siteAddressLabel(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** « 12 novembre 2026 » (jour civil à Paris). */
export function formatDayParis(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: PARIS_TZ }).format(date);
}

/** « 12 novembre 2026 à 10 h 32 » (heure de Paris). */
export function formatMomentParis(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: PARIS_TZ }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${formatDayParis(date)} à ${hour}${NBSP}h${NBSP}${minute}`;
}

/** Accord simple : `plural(1, "lecture", "lectures")` → « lecture ». Zéro reste au singulier, comme en français. */
export function plural(count: number, one: string, many: string): string {
  return count > 1 ? many : one;
}

/** Lectures encore possibles ce mois-ci. */
export function readsRemaining(reads: { used: number; limit: number }): number {
  return Math.max(0, reads.limit - reads.used);
}

/** « Il vous reste 4 lectures ce mois-ci (sur 6). » — ou ce qui se passe quand il n'en reste plus. */
export function readsRemainingLabel(reads: { used: number; limit: number }): string {
  const left = readsRemaining(reads);
  if (left === 0) return `Vous avez utilisé vos ${reads.limit} lectures de ce mois : la prochaine sera possible le mois prochain.`;
  return `Il vous reste ${left}${NBSP}${plural(left, "lecture", "lectures")} ce mois-ci (sur ${reads.limit}).`;
}

/** Nature d'une page lue, dite au praticien. */
export const PAGE_KIND_LABELS: Record<ExternalPageKind, string> = {
  home: "Accueil",
  about: "À propos",
  specialty: "Spécialité",
  services: "Prestations",
  pricing: "Tarifs",
  contact: "Contact",
  booking: "Prise de rendez-vous",
  faq: "Questions fréquentes",
  blog: "Blog",
  article: "Article",
  legal: "Mentions légales",
  other: "Autre page",
};

export type DetectedItem = {
  id: "cms" | "google" | "meta" | "consent";
  label: string;
  /** Repéré dans le code des pages */
  found: boolean;
  /** Ce qui a été repéré, ou « non repéré » */
  detail: string;
};

/**
 * Ce qui a été repéré dans le code des pages à la dernière lecture : l'outil
 * de création du site, une balise Google, le pixel Meta, un bandeau de
 * consentement. Toujours les quatre lignes, dans cet ordre : « non repéré »
 * est une information aussi.
 */
export function detectedItems(facts: Pick<ExternalSiteFacts, "cms" | "tags">): DetectedItem[] {
  const tags = facts.tags;
  const google = [
    tags.googleAnalyticsId ? "Google Analytics" : null,
    tags.googleTagManagerId ? "Google Tag Manager" : null,
    tags.googleAdsId ? "Google Ads" : null,
  ].filter((name): name is string => name !== null);
  return [
    { id: "cms", label: "Outil de création du site", found: facts.cms !== undefined, detail: facts.cms ? EXTERNAL_CMS_LABELS[facts.cms] : "non reconnu" },
    { id: "google", label: "Balise Google", found: google.length > 0, detail: google.length > 0 ? `repérée (${google.join(", ")})` : "non repérée" },
    { id: "meta", label: "Pixel Meta", found: Boolean(tags.metaPixelId), detail: tags.metaPixelId ? "repéré" : "non repéré" },
    { id: "consent", label: "Bandeau de consentement", found: tags.consentBanner === true, detail: tags.consentBanner === true ? "repéré" : "non repéré" },
  ];
}
