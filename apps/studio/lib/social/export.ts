/**
 * Export des contenus d'un mois vers un planificateur (CSV importable dans
 * Metricool, Buffer ou Later) ou un agenda (ICS, RFC 5545). Fonctions pures,
 * testées sans base : construction du CSV (UTF-8 avec BOM, virgule, champs
 * entre guillemets doublés), lignes par réseau, échappement et repliement
 * ICS (lignes ≤ 75 octets), calendrier complet.
 */

import { captionFor, SOCIAL_NETWORKS, type CaptionSource, type SocialFormat, type SocialNetwork } from "@theralys/shared";

/** Heure de publication proposée au planificateur (Europe/Paris). */
export const EXPORT_HOUR = "09:00";
/** Au-delà, les contenus suivants sont exportés sans visuel (rendu satori + sharp coûteux). */
export const EXPORT_RENDER_MAX = 12;
/** Studio en production : base des liens profonds du calendrier ICS. */
export const STUDIO_DEFAULT_BASE_URL = "https://app.harmony-web.fr";

export const CSV_HEADER = ["date", "heure", "texte", "image_url", "reseau"] as const;

const NETWORK_LABEL: Record<SocialNetwork, string> = Object.fromEntries(
  SOCIAL_NETWORKS.map((n) => [n.id, n.label]),
) as Record<SocialNetwork, string>;

/** Réseaux où un contenu se publie : LinkedIn n'a pas de stories. */
export function networksFor(format: SocialFormat): SocialNetwork[] {
  return SOCIAL_NETWORKS.map((n) => n.id).filter((id) => format !== "story" || id !== "linkedin");
}

export type ExportablePost = {
  id: string;
  /** "YYYY-MM-DD" */
  scheduledFor: string;
  topic: string;
  format: SocialFormat;
  content: CaptionSource;
  /** URL publique du visuel (première diapositive), vide si non rendu */
  imageUrl: string;
};

export type PlannerRow = {
  date: string;
  time: string;
  text: string;
  imageUrl: string;
  network: string;
};

/**
 * Champ CSV : toujours entre guillemets, guillemets internes doublés
 * (RFC 4180). Un champ qui commence par `=`, `+`, `-`, `@`, une tabulation ou
 * un retour chariot serait interprété comme une formule par un tableur : il
 * est préfixé d'une apostrophe.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Contenus à envoyer au planificateur : ceux qui restent à publier (statut
 * autre que `published`) et datés d'aujourd'hui (`today`, jour civil
 * Europe/Paris) ou plus tard. L'agenda ICS, lui, reçoit tout le mois.
 */
export function plannerExportable<T extends { status: string; scheduledFor: string }>(posts: readonly T[], today: string): T[] {
  return posts.filter((post) => post.status !== "published" && post.scheduledFor >= today);
}

/**
 * CSV complet : BOM UTF-8 (Excel reconnaît l'encodage), en-tête non quoté,
 * champs entre guillemets, lignes terminées par CRLF.
 */
export function buildPlannerCsv(rows: readonly PlannerRow[]): string {
  const lines = [
    CSV_HEADER.join(","),
    ...rows.map((row) => [row.date, row.time, row.text, row.imageUrl, row.network].map(csvField).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * Une ligne par contenu et par réseau (dans l'ordre Instagram, Facebook,
 * LinkedIn), avec la légende propre au réseau (`captionFor`).
 */
export function plannerRows(posts: readonly ExportablePost[], siteUrl: string, bioLine: string): PlannerRow[] {
  const rows: PlannerRow[] = [];
  for (const post of posts) {
    for (const network of networksFor(post.format)) {
      rows.push({
        date: post.scheduledFor,
        time: EXPORT_HOUR,
        text: captionFor(network, post.content, siteUrl, bioLine),
        imageUrl: post.imageUrl,
        network: NETWORK_LABEL[network],
      });
    }
  }
  return rows;
}

// ─── ICS (RFC 5545) ──────────────────────────────────────────────────────────

/** Valeur texte ICS : `\` `;` `,` échappés, sauts de ligne → `\n`. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n?|\n/g, "\\n");
}

/** Longueur maximale d'une ligne physique ICS (octets, hors fin de ligne). */
const ICS_LINE_OCTETS = 75;

/**
 * Repliement d'une ligne logique : lignes physiques ≤ 75 octets, les suivantes
 * précédées d'une espace (comptée dans les 75), sans jamais couper un
 * caractère UTF-8 multi-octets.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = ICS_LINE_OCTETS;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch, "utf8");
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      // Les lignes de continuation commencent par une espace, comprise dans les 75 octets
      limit = ICS_LINE_OCTETS - 1;
    }
    current += ch;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

/** Dépliement (tests et lecteurs) : une continuation est « CRLF + espace ». */
export function unfoldIcs(text: string): string {
  return text.replace(/\r\n[ \t]/g, "");
}

export type IcsEvent = {
  /** Identifiant stable (id du contenu) */
  uid: string;
  /** "YYYY-MM-DD" : événement sur la journée */
  date: string;
  summary: string;
  description: string;
  url: string;
};

function icsDate(day: string): string {
  return day.replace(/-/g, "");
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function icsStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Calendrier ICS : un événement « journée entière » par contenu
 * (`DTSTART;VALUE=DATE`, `DTEND` exclusif au lendemain pour les agendas qui
 * l'exigent), résumé = sujet, description = légende, URL = lien profond du
 * studio. Lignes repliées, CRLF.
 */
export function buildIcs(events: readonly IcsEvent[], options: { name: string; now: Date; uidDomain?: string }): string {
  const domain = options.uidDomain ?? "harmony-web.fr";
  const stamp = icsStamp(options.now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Harmony//Reseaux sociaux//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(options.name)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@${domain}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(event.date))}`,
      `SUMMARY:${icsEscape(event.summary)}`,
      `DESCRIPTION:${icsEscape(event.description)}`,
      `URL:${event.url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Lien profond d'un contenu dans le studio : `/reseaux-sociaux?mois=YYYY-MM&post=<id>`. */
export function socialPostDeepLink(baseUrl: string, month: string, postId: string): string {
  const params = new URLSearchParams({ mois: month, post: postId });
  return `${baseUrl.replace(/\/$/, "")}/reseaux-sociaux?${params.toString()}`;
}

/** Nom de fichier d'un export : `reseaux-sociaux-YYYY-MM.csv|ics`. */
export function exportFilename(month: string, format: "csv" | "ics"): string {
  return `reseaux-sociaux-${month}.${format}`;
}
