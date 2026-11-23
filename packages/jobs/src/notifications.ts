/**
 * Notifications e-mail des jobs (Resend si configuré, sinon mock) :
 *
 * - sendWeeklyContentDigests : chaque lundi (jour civil Europe/Paris), « Vos
 *   contenus de la semaine » — pour chaque site (client ou démo) ayant au
 *   moins un compte client et au moins un contenu `ready` (réseaux sociaux ou
 *   fiche Google) daté dans la semaine ISO en cours, la liste par jour des
 *   textes à coller et des liens profonds vers le studio ;
 * - sendMonthReminders : le 25 de chaque mois (Europe/Paris), « Préparez
 *   votre mois » — pour les sites avec accès réseaux sociaux et/ou fiche
 *   Google dont le mois suivant n'a encore aucun contenu sur ce canal.
 *
 * Rattrapage : ce qui n'est pas parti le lundi (passage manqué, échéance
 * atteinte, fournisseur en panne) part le mardi ou le mercredi ; le rappel du
 * 25 se rattrape jusqu'au 28. `notification_log` dit qui a déjà été servi :
 * un passage de rattrapage ne reprend que les sites sans ligne pour la
 * période. Tout le parc est parcouru, par pages de NOTIFICATION_PAGE sites
 * (seuls les contenus de la page en cours sont en mémoire), jusqu'à
 * l'échéance du passage.
 *
 * Idempotence : une ligne `notification_log` (site, kind, période) est
 * réservée AVANT l'envoi, dans une transaction courte, avec
 * `on conflict do nothing` ; si elle existe déjà (cron relancé, deux
 * instances), rien ne part. `sent` est mis à jour avec le résultat du
 * fournisseur (false en mock ou en refus définitif : pas de seconde
 * tentative). Une erreur transitoire du fournisseur (429, 5xx, délai) est
 * relancée SEND_RETRIES fois, après l'attente qu'il demande ; si elle
 * persiste, la réservation est libérée pour un passage de rattrapage
 * seulement si aucun e-mail n'est parti ; après au moins un envoi réussi, la
 * réservation reste (`sent = true`) et l'échec restant est journalisé —
 * jamais de doublon. Après SEND_FAILURE_BREAKER sites en échec d'affilée, le
 * passage s'arrête (fournisseur en panne). Tous les envois d'un passage sont
 * espacés de SEND_SPACING_MS (limite de débit du fournisseur), d'un site à
 * l'autre comme entre deux destinataires d'un même site. La colonne
 * `recipient` ne porte que des identifiants de comptes (`user:<id>`), jamais
 * d'adresse.
 *
 * Les décisions (jour, bornes de période, contenus, déjà envoyé), le tri par
 * jour et le rendu texte/HTML sont des fonctions pures, testées sans base.
 * Les e-mails ne contiennent aucune donnée personnelle autre que le prénom ;
 * les textes injectés dans le HTML sont échappés. Les visuels ne sont pas
 * joints (ils exigent une session) : le lien profond y mène.
 */

import { and, asc, eq, gte, inArray, isNotNull, lt, lte, ne } from "drizzle-orm";
import {
  getDb,
  googlePosts,
  hasGoogleProfile,
  hasSocialMedia,
  notificationLog,
  sites,
  socialPosts,
  users,
  type Database,
  type PlanId,
} from "@theralys/db";
import { captionFor, isoWeekday, type GooglePostContent, type SocialPostContent } from "@theralys/shared";
import { createMailProvider, sendMailWithRetry, type MailProvider } from "@theralys/providers/mail";
import { withApiUsage } from "@theralys/shared/usage-runtime";
import { errorLabel, pastDeadline, sleep, tickError, tickOk, type TickOptions, type TickReport } from "./tick-utils";

/** Fuseau des praticiens : jour civil des envois et bornes des périodes. */
export const PARIS_TZ = "Europe/Paris";
/** Sites dont les contenus sont chargés ensemble : tout le parc est parcouru, page après page, jusqu'à l'échéance. */
export const NOTIFICATION_PAGE = 100;
/** Espacement minimal entre deux envois d'un passage (ms) : limite de débit du fournisseur. */
export const SEND_SPACING_MS = 500;
/** Relances d'un envoi sur erreur transitoire du fournisseur (429, 5xx, délai dépassé). */
export const SEND_RETRIES = 2;
/** Sites en échec d'affilée au-delà desquels le passage s'arrête : le fournisseur est en panne, le rattrapage reprendra. */
export const SEND_FAILURE_BREAKER = 5;
/** Dernier jour ISO (1 = lundi) où l'e-mail hebdomadaire part encore : rattrapage le mardi et le mercredi. */
export const WEEKLY_DIGEST_LAST_WEEKDAY = 3;
/** `notification_log.kind` de l'e-mail hebdomadaire (période "YYYY-Www"). */
export const WEEKLY_DIGEST_KIND = "content_weekly";
/** `notification_log.kind` du rappel mensuel (période "YYYY-MM" du mois suivant). */
export const MONTH_REMINDER_KIND = "month_reminder";
/** Jour du mois (Europe/Paris) du rappel « Préparez votre mois ». */
export const MONTH_REMINDER_DAY = 25;
/** Dernier jour du mois où le rappel part encore : rattrapage du 26 au 28 (février compris). */
export const MONTH_REMINDER_LAST_DAY = 28;
/** URL publique du studio quand STUDIO_BASE_URL n'est pas définie. */
export const DEFAULT_STUDIO_BASE_URL = "https://app.harmony-web.fr";

const DAY_MS = 86_400_000;
const SIGNATURE = "L'équipe Harmony";

// ─── Dates (Europe/Paris, semaines ISO, mois) ────────────────────────────────

/** "YYYY-MM-DD" du jour civil Europe/Paris d'un instant. */
export function parisDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" décalé de `days` jours. */
export function shiftDay(day: string, days: number): string {
  return isoDay(new Date(utcDate(day).getTime() + days * DAY_MS));
}

export type IsoWeek = {
  /** Clé de période : "2026-W45" */
  key: string;
  /** Année ISO (peut différer de l'année civile autour du 1er janvier) */
  year: number;
  /** Numéro de semaine ISO, 1..53 */
  week: number;
  /** "YYYY-MM-DD" du lundi */
  monday: string;
  /** "YYYY-MM-DD" du dimanche */
  sunday: string;
};

/** Semaine ISO (lundi → dimanche) contenant le jour civil `day`. */
export function isoWeekOf(day: string): IsoWeek {
  const weekday = isoWeekday(day);
  const monday = shiftDay(day, 1 - weekday);
  const sunday = shiftDay(monday, 6);
  // L'année ISO est celle du jeudi de la semaine ; la semaine 1 contient le 4 janvier
  const thursday = utcDate(shiftDay(monday, 3));
  const year = thursday.getUTCFullYear();
  const jan4 = utcDate(`${year}-01-04`);
  const week1Monday = shiftDay(isoDay(jan4), 1 - isoWeekday(isoDay(jan4)));
  const week = Math.round((utcDate(monday).getTime() - utcDate(week1Monday).getTime()) / (7 * DAY_MS)) + 1;
  return { key: `${year}-W${String(week).padStart(2, "0")}`, year, week, monday, sunday };
}

/** Semaine ISO du jour civil Europe/Paris de `now`. */
export function weekPeriodOf(now: Date): IsoWeek {
  return isoWeekOf(parisDay(now));
}

export type MonthPeriod = {
  /** Clé de période et valeur de `?mois=` : "2026-11" */
  key: string;
  year: number;
  /** 1..12 */
  month: number;
  /** "YYYY-MM-01" */
  startIso: string;
  /** "YYYY-MM-01" du mois suivant (borne exclue) */
  endIso: string;
};

function monthPeriod(year: number, month: number): MonthPeriod {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    startIso: isoDay(start),
    endIso: isoDay(end),
  };
}

/** Mois civil (Europe/Paris) contenant `now`. */
export function monthOf(now: Date): MonthPeriod {
  const day = parisDay(now);
  return monthPeriod(Number(day.slice(0, 4)), Number(day.slice(5, 7)));
}

/** Mois suivant celui du jour civil Europe/Paris de `now`. */
export function nextMonthOf(now: Date): MonthPeriod {
  const current = monthOf(now);
  return monthPeriod(current.year, current.month + 1);
}

/** Jour du mois (1..31) du jour civil Europe/Paris de `now`. */
export function parisDayOfMonth(now: Date): number {
  return Number(parisDay(now).slice(8, 10));
}

// ─── Liens profonds vers le studio ───────────────────────────────────────────

export function studioBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.STUDIO_BASE_URL ?? DEFAULT_STUDIO_BASE_URL).replace(/\/$/, "");
}

/** Page Réseaux sociaux du mois, ouverte sur un contenu (`?post=`, implémenté par le studio). */
export function socialPostUrl(base: string, monthKey: string, postId: string): string {
  return `${base}/reseaux-sociaux?mois=${monthKey}&post=${encodeURIComponent(postId)}`;
}

/** Onglet Posts de la fiche Google du mois, ouvert sur un post. */
export function googlePostUrl(base: string, monthKey: string, postId: string): string {
  return `${base}/fiche-google?onglet=posts&mois=${monthKey}&post=${encodeURIComponent(postId)}`;
}

/** Page Réseaux sociaux d'un mois (bouton « Préparer mon mois »). */
export function socialMonthUrl(base: string, monthKey: string): string {
  return `${base}/reseaux-sociaux?mois=${monthKey}`;
}

/** Onglet Posts de la fiche Google d'un mois. */
export function googleMonthUrl(base: string, monthKey: string): string {
  return `${base}/fiche-google?onglet=posts&mois=${monthKey}`;
}

// ─── Décisions ───────────────────────────────────────────────────────────────

export type WeeklyDigestDecision =
  | { send: true; week: IsoWeek }
  | { send: false; reason: "not_send_day" | "no_recipient" | "no_content" | "already_sent" };

/** Jour d'envoi de l'e-mail hebdomadaire : le lundi, ou un jour de rattrapage (mardi, mercredi). `day` : jour civil Europe/Paris. */
export function isWeeklyDigestDay(day: string): boolean {
  return isoWeekday(day) <= WEEKLY_DIGEST_LAST_WEEKDAY;
}

/** Jour d'envoi du rappel mensuel : le 25, ou un jour de rattrapage (jusqu'au 28), Europe/Paris. */
export function isMonthReminderDay(now: Date): boolean {
  const day = parisDayOfMonth(now);
  return day >= MONTH_REMINDER_DAY && day <= MONTH_REMINDER_LAST_DAY;
}

/**
 * Envoyer l'e-mail hebdomadaire ? Lundi (Europe/Paris) — ou mardi, mercredi
 * en rattrapage —, au moins un destinataire, au moins un contenu de la
 * semaine, pas encore envoyé.
 */
export function decideWeeklyDigest(input: {
  now: Date;
  recipients: number;
  contents: number;
  alreadySent: boolean;
}): WeeklyDigestDecision {
  const day = parisDay(input.now);
  if (!isWeeklyDigestDay(day)) return { send: false, reason: "not_send_day" };
  if (input.recipients <= 0) return { send: false, reason: "no_recipient" };
  if (input.contents <= 0) return { send: false, reason: "no_content" };
  if (input.alreadySent) return { send: false, reason: "already_sent" };
  return { send: true, week: isoWeekOf(day) };
}

export type ReminderChannel = "social" | "google";

export type MonthReminderDecision =
  | { send: true; month: MonthPeriod; channels: ReminderChannel[] }
  | { send: false; reason: "not_reminder_day" | "no_recipient" | "nothing_to_prepare" | "already_sent" };

/**
 * Envoyer le rappel « Préparez votre mois » ? Le 25 (Europe/Paris) — ou du
 * 26 au 28 en rattrapage —, au moins un destinataire, au moins un canal
 * accessible sans contenu le mois suivant, pas encore envoyé. `channels`
 * liste les canaux concernés.
 */
export function decideMonthReminder(input: {
  now: Date;
  recipients: number;
  alreadySent: boolean;
  social: { access: boolean; nextMonthPosts: number };
  google: { access: boolean; nextMonthPosts: number };
}): MonthReminderDecision {
  if (!isMonthReminderDay(input.now)) return { send: false, reason: "not_reminder_day" };
  if (input.recipients <= 0) return { send: false, reason: "no_recipient" };
  const channels: ReminderChannel[] = [];
  if (input.social.access && input.social.nextMonthPosts <= 0) channels.push("social");
  if (input.google.access && input.google.nextMonthPosts <= 0) channels.push("google");
  if (channels.length === 0) return { send: false, reason: "nothing_to_prepare" };
  if (input.alreadySent) return { send: false, reason: "already_sent" };
  return { send: true, month: nextMonthOf(input.now), channels };
}

// ─── Contenus de la semaine ──────────────────────────────────────────────────

export type DigestItem = {
  kind: "social" | "google";
  id: string;
  /** "YYYY-MM-DD" (scheduledFor) */
  date: string;
  topic: string;
  /** Texte à coller (légende Instagram + hashtags, ou résumé du post Google) */
  text: string;
  /** Lien profond vers le studio */
  url: string;
};

export type DigestDay = { date: string; label: string; items: DigestItem[] };

const KIND_ORDER: Record<DigestItem["kind"], number> = { social: 0, google: 1 };

export const DIGEST_KIND_LABELS: Record<DigestItem["kind"], string> = {
  social: "Instagram / Facebook / LinkedIn",
  google: "Fiche Google",
};

/** Contenus groupés par jour, jours croissants ; dans un jour, réseaux sociaux avant fiche Google, puis sujet. */
export function groupDigestByDay(items: DigestItem[]): DigestDay[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.topic.localeCompare(b.topic, "fr"),
  );
  const days: DigestDay[] = [];
  for (const item of sorted) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date, label: dayLabel(item.date), items: [item] });
  }
  return days;
}

/** Légende Instagram prête à coller : légende + tous les hashtags (contrat `captionFor`). */
export function instagramCaption(content: Pick<SocialPostContent, "caption" | "hashtags">): string {
  return captionFor("instagram", { caption: content.caption, hashtags: content.hashtags }, "", "");
}

export function digestItemFromSocial(
  post: { id: string; scheduledFor: string; topic: string; content: Pick<SocialPostContent, "caption" | "hashtags"> },
  base: string,
): DigestItem {
  return {
    kind: "social",
    id: post.id,
    date: post.scheduledFor,
    topic: post.topic,
    text: instagramCaption(post.content),
    url: socialPostUrl(base, post.scheduledFor.slice(0, 7), post.id),
  };
}

export function digestItemFromGoogle(
  post: { id: string; scheduledFor: string; topic: string; content: Pick<GooglePostContent, "summary"> },
  base: string,
): DigestItem {
  return {
    kind: "google",
    id: post.id,
    date: post.scheduledFor,
    topic: post.topic,
    text: post.content.summary.trim(),
    url: googlePostUrl(base, post.scheduledFor.slice(0, 7), post.id),
  };
}

// ─── Rendu texte + HTML ──────────────────────────────────────────────────────

export type RenderedMail = { subject: string; text: string; html: string };

/** Échappe `& < > "` (et l'apostrophe) pour injecter un texte dans le HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** « 1 novembre » → « 1er novembre » (Intl écrit le premier du mois sans ordinal). */
function ordinalFirst(label: string): string {
  return label.replace(/(^|\s)1(?=\s)/u, "$11er");
}

/** « Lundi 2 novembre », « Dimanche 1er novembre » */
export function dayLabel(day: string): string {
  return capitalize(
    ordinalFirst(
      new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
        utcDate(day),
      ),
    ),
  );
}

/** « novembre 2026 » */
export function monthLabel(month: Pick<MonthPeriod, "year" | "month">): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(month.year, month.month - 1, 1)),
  );
}

/** « du 2 au 8 novembre 2026 », « du 30 novembre au 6 décembre 2026 », « du 29 décembre 2025 au 4 janvier 2026 ». */
export function weekRangeLabel(week: Pick<IsoWeek, "monday" | "sunday">): string {
  const from = utcDate(week.monday);
  const to = utcDate(week.sunday);
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" });
  const sameMonth = week.monday.slice(0, 7) === week.sunday.slice(0, 7);
  const sameYear = week.monday.slice(0, 4) === week.sunday.slice(0, 4);
  const fromLabel = sameMonth
    ? fmt({ day: "numeric" })
    : sameYear
      ? fmt({ day: "numeric", month: "long" })
      : fmt({ day: "numeric", month: "long", year: "numeric" });
  return ordinalFirst(`du ${fromLabel.format(from)} au ${fmt({ day: "numeric", month: "long", year: "numeric" }).format(to)}`);
}

/** Première partie du nom (prénom), repli sur le nom complet. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const HTML_STYLE = {
  wrapper: "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1f2937;font-size:15px;line-height:1.5",
  brand: "margin:0 0 20px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280",
  h1: "margin:0 0 12px;font-size:20px;font-weight:600;color:#111827",
  h2: "margin:28px 0 8px;font-size:15px;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;padding-bottom:6px",
  kind: "margin:14px 0 2px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280",
  topic: "margin:0 0 6px;font-weight:600",
  paste: "margin:0 0 8px;padding:12px 14px;background:#f5f5f4;border-radius:8px;white-space:pre-wrap;font-size:14px;font-family:inherit",
  link: "color:#1f2937;font-weight:600",
  button: "display:inline-block;margin:8px 0 4px;padding:11px 22px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600",
  muted: "margin:24px 0 0;font-size:13px;color:#6b7280",
} as const;

/**
 * Lien général de l'e-mail hebdomadaire, selon les canaux présents : la page
 * Réseaux sociaux dès qu'un contenu social figure dans la semaine, sinon
 * (fiche Google seule) l'onglet Posts de la fiche Google.
 */
export function digestStudioLink(studioUrl: string, monthKey: string, items: readonly Pick<DigestItem, "kind">[]): string {
  return items.some((item) => item.kind === "social") ? socialMonthUrl(studioUrl, monthKey) : googleMonthUrl(studioUrl, monthKey);
}

/** « Vos contenus de la semaine » : texte + HTML sobre (inline, sans framework). */
export function renderWeeklyDigest(input: {
  firstName: string;
  week: IsoWeek;
  items: DigestItem[];
  /** Base du studio (sans barre finale), pour le lien général */
  studioUrl: string;
}): RenderedMail {
  const days = groupDigestByDay(input.items);
  const range = weekRangeLabel(input.week);
  const subject = `Vos contenus de la semaine (${range})`;
  const studioLink = digestStudioLink(input.studioUrl, input.week.monday.slice(0, 7), input.items);

  const text: string[] = [
    `Bonjour ${input.firstName},`,
    "",
    `Voici vos contenus prêts à publier cette semaine (${range}) : pour chacun,`,
    "le texte à coller et le lien vers votre espace pour télécharger le visuel.",
  ];
  for (const day of days) {
    text.push("", `— ${day.label} —`);
    for (const item of day.items) {
      text.push("", `${DIGEST_KIND_LABELS[item.kind]} · ${item.topic}`, "", item.text, "", `Visuel et détails : ${item.url}`);
    }
  }
  text.push("", `Tous vos contenus : ${studioLink}`, "", "À très vite,", SIGNATURE);

  const html: string[] = [
    `<div style="${HTML_STYLE.wrapper}">`,
    `<p style="${HTML_STYLE.brand}">Harmony</p>`,
    `<h1 style="${HTML_STYLE.h1}">Vos contenus de la semaine</h1>`,
    `<p style="margin:0 0 4px">Bonjour ${escapeHtml(input.firstName)},</p>`,
    `<p style="margin:0">Voici vos contenus prêts à publier ${escapeHtml(range)} : pour chacun, le texte à coller et le lien vers votre espace pour télécharger le visuel.</p>`,
  ];
  for (const day of days) {
    html.push(`<h2 style="${HTML_STYLE.h2}">${escapeHtml(day.label)}</h2>`);
    for (const item of day.items) {
      html.push(
        `<p style="${HTML_STYLE.kind}">${escapeHtml(DIGEST_KIND_LABELS[item.kind])}</p>`,
        `<p style="${HTML_STYLE.topic}">${escapeHtml(item.topic)}</p>`,
        `<div style="${HTML_STYLE.paste}">${escapeHtml(item.text)}</div>`,
        `<p style="margin:0 0 4px"><a href="${escapeHtml(item.url)}" style="${HTML_STYLE.link}">Visuel et détails →</a></p>`,
      );
    }
  }
  html.push(
    `<p style="margin:28px 0 0"><a href="${escapeHtml(studioLink)}" style="${HTML_STYLE.button}">Tous mes contenus</a></p>`,
    `<p style="${HTML_STYLE.muted}">À très vite,<br/>${escapeHtml(SIGNATURE)}</p>`,
    "</div>",
  );

  return { subject, text: text.join("\n"), html: html.join("\n") };
}

/** « Préparez votre mois » : une section par canal concerné (social, fiche Google). */
export function renderMonthReminder(input: {
  firstName: string;
  month: MonthPeriod;
  /** Lien « Préparer mon mois » des réseaux sociaux, null si canal non concerné */
  social: string | null;
  /** Lien « Préparer mon mois » de la fiche Google, null si canal non concerné */
  google: string | null;
}): RenderedMail {
  const label = monthLabel(input.month);
  const subject = `Préparez votre mois de ${label}`;
  const sections: { title: string; url: string }[] = [];
  if (input.social) sections.push({ title: "Réseaux sociaux (Instagram, Facebook, LinkedIn)", url: input.social });
  if (input.google) sections.push({ title: "Fiche Google", url: input.google });

  const text: string[] = [
    `Bonjour ${input.firstName},`,
    "",
    `${capitalize(label)} approche et vos contenus ne sont pas encore préparés.`,
    "Un clic suffit : Harmony prépare votre mois à partir de votre site,",
    "visuels et textes prêts à poster compris.",
  ];
  for (const section of sections) {
    text.push("", `${section.title} :`, `Préparer mon mois → ${section.url}`);
  }
  text.push("", "À très vite,", SIGNATURE);

  const html: string[] = [
    `<div style="${HTML_STYLE.wrapper}">`,
    `<p style="${HTML_STYLE.brand}">Harmony</p>`,
    `<h1 style="${HTML_STYLE.h1}">Préparez votre mois de ${escapeHtml(label)}</h1>`,
    `<p style="margin:0 0 4px">Bonjour ${escapeHtml(input.firstName)},</p>`,
    `<p style="margin:0">${escapeHtml(capitalize(label))} approche et vos contenus ne sont pas encore préparés. Un clic suffit : Harmony prépare votre mois à partir de votre site, visuels et textes prêts à poster compris.</p>`,
  ];
  for (const section of sections) {
    html.push(
      `<h2 style="${HTML_STYLE.h2}">${escapeHtml(section.title)}</h2>`,
      `<p style="margin:0"><a href="${escapeHtml(section.url)}" style="${HTML_STYLE.button}">Préparer mon mois</a></p>`,
    );
  }
  html.push(`<p style="${HTML_STYLE.muted}">À très vite,<br/>${escapeHtml(SIGNATURE)}</p>`, "</div>");

  return { subject, text: text.join("\n"), html: html.join("\n") };
}

// ─── Ticks ───────────────────────────────────────────────────────────────────

/**
 * Options des ticks de notification : fournisseur e-mail, environnement et
 * attente injectables (tests, test de fumée).
 */
export type NotificationOptions = TickOptions & { mail?: MailProvider; env?: NodeJS.ProcessEnv; sleep?: (ms: number) => Promise<void> };

type Recipient = { id: string; email: string; name: string };
type SiteRecipients = { siteId: string; type: "demo" | "client"; plan: PlanId; recipients: Recipient[] };

/**
 * Comptes clients des sites non archivés, groupés par site (ordre de création
 * des sites, puis des comptes).
 */
async function loadSiteRecipients(db: Database): Promise<SiteRecipients[]> {
  const rows = await db
    .select({ siteId: sites.id, type: sites.type, plan: sites.plan, userId: users.id, email: users.email, name: users.name })
    .from(users)
    .innerJoin(sites, eq(sites.id, users.siteId))
    .where(and(eq(users.role, "client"), isNotNull(users.siteId), ne(sites.status, "archived")))
    .orderBy(asc(sites.createdAt), asc(users.createdAt));
  const bySite = new Map<string, SiteRecipients>();
  for (const row of rows) {
    const entry = bySite.get(row.siteId) ?? { siteId: row.siteId, type: row.type, plan: row.plan, recipients: [] };
    entry.recipients.push({ id: row.userId, email: row.email, name: row.name });
    bySite.set(row.siteId, entry);
  }
  return [...bySite.values()];
}

/** Sites déjà journalisés pour (kind, période). */
async function loggedSiteIds(db: Database, kind: string, periodKey: string): Promise<Set<string>> {
  const rows = await db.query.notificationLog.findMany({
    where: and(eq(notificationLog.kind, kind), eq(notificationLog.periodKey, periodKey)),
    columns: { siteId: true },
  });
  return new Set(rows.map((r) => r.siteId));
}

/**
 * Réserve la ligne `notification_log` (transaction courte, `on conflict do
 * nothing`) : null si elle existait déjà — rien ne doit partir.
 */
async function reserveNotification(
  db: Database,
  entry: { siteId: string; kind: string; periodKey: string; recipient: string },
  now: Date,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(notificationLog)
      .values({ ...entry, sent: false, sentAt: now })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });
    return inserted[0]?.id ?? null;
  });
}

/**
 * Envois d'un passage : fournisseur, espacement commun à tous les envois (d'un
 * site à l'autre comme entre deux destinataires), compteurs.
 */
type SendRun = {
  mail: MailProvider;
  wait: (ms: number) => Promise<void>;
  /** Instant du dernier envoi (ms), 0 avant le premier */
  lastSendAt: number;
  processed: number;
  failed: number;
  /** Sites en échec d'affilée (remis à zéro par un site servi) */
  streak: number;
  lastError: string;
};

function startSendRun(opts: NotificationOptions): SendRun {
  return { mail: opts.mail ?? createMailProvider(opts.env), wait: opts.sleep ?? sleep, lastSendAt: 0, processed: 0, failed: 0, streak: 0, lastError: "" };
}

/** Attend ce qu'il faut pour que deux envois du passage soient espacés de SEND_SPACING_MS (sans fournisseur réel, rien ne part : aucune attente). */
async function pace(run: SendRun): Promise<void> {
  if (run.mail.mode === "mock") return;
  const remaining = run.lastSendAt + SEND_SPACING_MS - Date.now();
  if (run.lastSendAt > 0 && remaining > 0) await run.wait(remaining);
  run.lastSendAt = Date.now();
}

/**
 * Envoie un e-mail à chaque destinataire du site sous la réservation `logId`
 * (envois espacés, erreurs transitoires relancées SEND_RETRIES fois) et
 * inscrit le résultat (`sent` = au moins un envoi réel). Une erreur qui
 * persiste libère la réservation (un passage de rattrapage réessaiera) tant
 * qu'aucun e-mail n'est parti ; après un premier envoi réussi, la
 * réservation est confirmée (`sent = true`) et l'échec des destinataires
 * restants est journalisé, sans nouvelle tentative — un site ne reçoit
 * jamais deux fois le même e-mail.
 */
async function deliver(
  db: Database,
  run: SendRun,
  logId: string,
  recipients: Recipient[],
  render: (recipient: Recipient) => RenderedMail,
  now: Date,
): Promise<boolean> {
  let sent = false;
  try {
    for (const recipient of recipients) {
      await pace(run);
      const message = render(recipient);
      const result = await sendMailWithRetry(
        run.mail,
        { to: recipient.email, subject: message.subject, text: message.text, html: message.html },
        { retries: SEND_RETRIES, sleep: run.wait },
      );
      sent = sent || result.sent;
      // Refus définitif (adresse invalide, domaine non vérifié) : le détail du fournisseur peut citer l'adresse, il n'est pas journalisé
      if (result.error) console.warn(`[notifications] envoi refusé par le fournisseur (réservation ${logId})`);
    }
  } catch (err) {
    if (!sent) {
      await db.delete(notificationLog).where(eq(notificationLog.id, logId));
      throw err;
    }
    console.error(`[notifications] envoi partiel (réservation ${logId} conservée, destinataires restants non servis) : ${errorLabel(err)}`);
  }
  await db.update(notificationLog).set({ sent, sentAt: now }).where(eq(notificationLog.id, logId));
  return sent;
}

/**
 * Un site du passage : réservation, envoi, compteurs. Un site en échec est
 * journalisé (identifiant du site et type d'erreur) et n'arrête pas les
 * suivants.
 */
async function sendToSite(
  db: Database,
  run: SendRun,
  site: SiteRecipients,
  entry: { kind: string; periodKey: string; label: string },
  render: (recipient: Recipient) => RenderedMail,
  now: Date,
): Promise<void> {
  const logId = await reserveNotification(db, { siteId: site.siteId, kind: entry.kind, periodKey: entry.periodKey, recipient: recipientList(site.recipients) }, now);
  if (!logId) return;
  try {
    await withApiUsage({ feature: "notifications", siteId: site.siteId }, () => deliver(db, run, logId, site.recipients, render, now));
    run.processed += 1;
    run.streak = 0;
  } catch (err) {
    run.failed += 1;
    run.streak += 1;
    run.lastError = errorLabel(err);
    console.error(`[notifications] ${entry.label} du site ${site.siteId} non envoyé (${run.lastError})`);
  }
}

/** Le passage doit s'arrêter : échéance atteinte, ou fournisseur en panne (SEND_FAILURE_BREAKER sites en échec d'affilée). */
function sendRunOver(run: SendRun, opts: TickOptions): boolean {
  return pastDeadline(opts) || run.streak >= SEND_FAILURE_BREAKER;
}

/** Rapport d'un passage d'envois : en erreur si rien n'est parti alors que des envois ont échoué, ou si le fournisseur est en panne. */
function sendReport(task: string, run: SendRun): TickReport {
  if (run.failed > 0 && (run.processed === 0 || run.streak >= SEND_FAILURE_BREAKER)) return tickError(task, run.lastError, run.processed, run.failed);
  return tickOk(task, run.processed, run.failed);
}

/** Valeur de `notification_log.recipient` : identifiants de comptes, jamais d'adresse e-mail (RGPD). */
export function recipientList(recipients: readonly { id: string }[]): string {
  return recipients.map((r) => `user:${r.id}`).join(", ");
}

/** Contenus `ready` de la semaine pour une page de sites, groupés par site. */
async function loadWeekItems(db: Database, siteIds: string[], week: IsoWeek, base: string): Promise<Map<string, DigestItem[]>> {
  const [social, google] = await Promise.all([
    db.query.socialPosts.findMany({
      where: and(
        inArray(socialPosts.siteId, siteIds),
        eq(socialPosts.status, "ready"),
        gte(socialPosts.scheduledFor, week.monday),
        lte(socialPosts.scheduledFor, week.sunday),
      ),
      columns: { id: true, siteId: true, scheduledFor: true, topic: true, content: true },
    }),
    db.query.googlePosts.findMany({
      where: and(
        inArray(googlePosts.siteId, siteIds),
        eq(googlePosts.status, "ready"),
        gte(googlePosts.scheduledFor, week.monday),
        lte(googlePosts.scheduledFor, week.sunday),
      ),
      columns: { id: true, siteId: true, scheduledFor: true, topic: true, content: true },
    }),
  ]);
  const itemsBySite = new Map<string, DigestItem[]>();
  for (const post of social) {
    itemsBySite.set(post.siteId, [...(itemsBySite.get(post.siteId) ?? []), digestItemFromSocial(post, base)]);
  }
  for (const post of google) {
    itemsBySite.set(post.siteId, [...(itemsBySite.get(post.siteId) ?? []), digestItemFromGoogle(post, base)]);
  }
  return itemsBySite;
}

/**
 * Chaque lundi (Europe/Paris) : « Vos contenus de la semaine » aux comptes
 * clients des sites ayant au moins un contenu `ready` (réseaux sociaux ou
 * fiche Google) daté dans la semaine ISO en cours. Les sites non servis le
 * lundi le sont le mardi ou le mercredi (`notification_log` exclut ceux qui
 * l'ont déjà été). Tout le parc est parcouru par pages de NOTIFICATION_PAGE
 * sites ; s'arrête avant le site suivant une fois `opts.deadline` dépassée.
 * `processed` = sites pour lesquels un e-mail a été généré (envoyé ou
 * journalisé en mock).
 */
export async function sendWeeklyContentDigests(now = new Date(), opts: NotificationOptions = {}): Promise<TickReport> {
  const task = "weekly-content-digests";
  const day = parisDay(now);
  if (!isWeeklyDigestDay(day)) return tickOk(task, 0);
  const week = isoWeekOf(day);
  const db = getDb();

  const [socialSites, googleSites, logged, candidates] = await Promise.all([
    db
      .selectDistinct({ siteId: socialPosts.siteId })
      .from(socialPosts)
      .where(and(eq(socialPosts.status, "ready"), gte(socialPosts.scheduledFor, week.monday), lte(socialPosts.scheduledFor, week.sunday))),
    db
      .selectDistinct({ siteId: googlePosts.siteId })
      .from(googlePosts)
      .where(and(eq(googlePosts.status, "ready"), gte(googlePosts.scheduledFor, week.monday), lte(googlePosts.scheduledFor, week.sunday))),
    loggedSiteIds(db, WEEKLY_DIGEST_KIND, week.key),
    loadSiteRecipients(db),
  ]);
  const withContent = new Set([...socialSites, ...googleSites].map((r) => r.siteId));
  const due = candidates.filter((c) => withContent.has(c.siteId) && !logged.has(c.siteId));
  if (due.length === 0) return tickOk(task, 0);

  const base = studioBaseUrl(opts.env);
  const run = startSendRun(opts);
  for (let offset = 0; offset < due.length && !sendRunOver(run, opts); offset += NOTIFICATION_PAGE) {
    const page = due.slice(offset, offset + NOTIFICATION_PAGE);
    const itemsBySite = await loadWeekItems(
      db,
      page.map((c) => c.siteId),
      week,
      base,
    );
    for (const site of page) {
      if (sendRunOver(run, opts)) break;
      const items = itemsBySite.get(site.siteId) ?? [];
      const decision = decideWeeklyDigest({ now, recipients: site.recipients.length, contents: items.length, alreadySent: false });
      if (!decision.send) continue;
      await sendToSite(
        db,
        run,
        site,
        { kind: WEEKLY_DIGEST_KIND, periodKey: week.key, label: "e-mail hebdomadaire" },
        (recipient) => renderWeeklyDigest({ firstName: firstNameOf(recipient.name), week, items, studioUrl: base }),
        now,
      );
    }
  }
  return sendReport(task, run);
}

/**
 * Le 25 de chaque mois (Europe/Paris) : « Préparez votre mois » aux comptes
 * clients des sites avec accès réseaux sociaux (démo ou formule) sans aucun
 * contenu social non archivé le mois suivant, et/ou avec accès fiche Google
 * sans aucun post Google le mois suivant — un seul e-mail, une section par
 * canal concerné. Les sites non servis le 25 le sont jusqu'au 28. Tout le
 * parc est parcouru, échéance respectée.
 */
export async function sendMonthReminders(now = new Date(), opts: NotificationOptions = {}): Promise<TickReport> {
  const task = "month-reminders";
  if (!isMonthReminderDay(now)) return tickOk(task, 0);
  const month = nextMonthOf(now);
  const db = getDb();

  const [socialSites, googleSites, logged, candidates] = await Promise.all([
    db
      .selectDistinct({ siteId: socialPosts.siteId })
      .from(socialPosts)
      .where(and(ne(socialPosts.status, "archived"), gte(socialPosts.scheduledFor, month.startIso), lt(socialPosts.scheduledFor, month.endIso))),
    db
      .selectDistinct({ siteId: googlePosts.siteId })
      .from(googlePosts)
      .where(and(ne(googlePosts.status, "archived"), gte(googlePosts.scheduledFor, month.startIso), lt(googlePosts.scheduledFor, month.endIso))),
    loggedSiteIds(db, MONTH_REMINDER_KIND, month.key),
    loadSiteRecipients(db),
  ]);
  const socialPlanned = new Set(socialSites.map((r) => r.siteId));
  const googlePlanned = new Set(googleSites.map((r) => r.siteId));

  const base = studioBaseUrl(opts.env);
  const run = startSendRun(opts);
  for (const site of candidates) {
    if (logged.has(site.siteId)) continue;
    const decision = decideMonthReminder({
      now,
      recipients: site.recipients.length,
      alreadySent: false,
      social: { access: site.type === "demo" || hasSocialMedia(site.plan), nextMonthPosts: socialPlanned.has(site.siteId) ? 1 : 0 },
      google: { access: site.type === "demo" || hasGoogleProfile(site.plan), nextMonthPosts: googlePlanned.has(site.siteId) ? 1 : 0 },
    });
    if (!decision.send) continue;
    if (sendRunOver(run, opts)) break;
    const social = decision.channels.includes("social") ? socialMonthUrl(base, month.key) : null;
    const google = decision.channels.includes("google") ? googleMonthUrl(base, month.key) : null;
    await sendToSite(
      db,
      run,
      site,
      { kind: MONTH_REMINDER_KIND, periodKey: month.key, label: "rappel mensuel" },
      (recipient) => renderMonthReminder({ firstName: firstNameOf(recipient.name), month, social, google }),
      now,
    );
  }
  return sendReport(task, run);
}
