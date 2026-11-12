import type { Site } from "@theralys/db";
import {
  ANALYTICS_ORIGIN_EXTERNAL,
  ANDROID_APP_SOURCES,
  EXTERNAL_MEASURE_EVENTS,
  bareHost,
  externalHosts,
  parseExternalMeasure,
  sourceFromReferrer,
  type AnalyticsSource,
  type ExternalMeasurePayload,
} from "@theralys/shared";
import { pgErrorCode } from "./pg-errors";
import { isBotUserAgent } from "./visitor";

/**
 * Réception des visites mesurées sur le site du client (`POST /api/m`) :
 * toute la décision — accepter ou ignorer, quelle provenance retenir — est
 * ici, en fonctions pures testées sans base ; la route ne fait que lire la
 * requête et écrire la ligne.
 *
 * Une visite ignorée reçoit la même réponse qu'une visite acceptée (204, sans
 * détail) : la clé est publique, la réponse ne doit rien apprendre à qui
 * l'essaie.
 */

/**
 * Taille maximale du corps lu (octets). Une visite tient en quelques
 * centaines d'octets et `parseExternalMeasure` refuse au-delà de 1 000
 * caractères : inutile de lire davantage.
 */
export const MEASURE_BODY_MAX_BYTES = 2048;

/** Ce que `readBoundedText` lit d'une requête : ses en-têtes et son corps en flux. */
export type BodySource = { headers: Pick<Headers, "get">; body: ReadableStream<Uint8Array> | null };

/**
 * Corps de la requête, lu en texte sans jamais dépasser `maxBytes` : `null`
 * dès que la taille annoncée ou la taille réellement reçue dépasse la borne
 * (la lecture s'arrête alors, le reste n'est pas chargé en mémoire).
 */
export async function readBoundedText(source: BodySource, maxBytes: number): Promise<string | null> {
  const declared = Number(source.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maxBytes) return null;
  if (!source.body) return "";
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Site du client désigné par une clé de mesure, avec ce qu'il faut savoir du site hébergé auquel il est rattaché. */
export type MeasureTarget = {
  /** Ligne `external_sites` */
  id: string;
  siteId: string;
  /** Adresse d'accueil du site du client (`external_sites.url`) */
  url: string;
  /** Première visite déjà reçue ; `null` tant que le code de mesure n'a rien envoyé */
  measureSeenAt: Date | null;
  siteStatus: Site["status"];
  /** Lien de rendez-vous du praticien (`sites.booking_url`) */
  bookingUrl: string | null;
};

/** Ligne à inscrire dans `analytics_events` (l'identifiant de visiteur est ajouté par la route). */
export type MeasureEventRow = {
  siteId: string;
  type: (typeof EXTERNAL_MEASURE_EVENTS)[keyof typeof EXTERNAL_MEASURE_EVENTS];
  path: string;
  source: AnalyticsSource | null;
  origin: typeof ANALYTICS_ORIGIN_EXTERNAL;
};

/** Motifs d'une visite ignorée. Jamais renvoyés au navigateur : ils servent aux tests et à la lecture du code. */
export type MeasureIgnoreReason = "invalid" | "bot" | "unknown_key" | "archived" | "origin";

/** Issue du premier tri : la visite validée, ou le motif pour lequel elle est ignorée sans lire la base. */
export type MeasureScreening =
  | { ok: true; payload: ExternalMeasurePayload }
  | { ok: false; reason: Extract<MeasureIgnoreReason, "invalid" | "bot"> };

/**
 * Premier tri, avant toute lecture en base : corps illisible ou hors contrat
 * (`parseExternalMeasure`), puis robots — même règle que `/api/track`.
 */
export function screenMeasureRequest(body: string | null | undefined, userAgent: string | null | undefined): MeasureScreening {
  const payload = parseExternalMeasure(body);
  if (!payload) return { ok: false, reason: "invalid" };
  if (isBotUserAgent(userAgent)) return { ok: false, reason: "bot" };
  return { ok: true, payload };
}

/** Hôte d'une adresse web, ou `null` (absente, illisible, origine opaque « null », autre protocole). */
function webHostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : null;
  } catch {
    return null;
  }
}

/**
 * Hôte de la page qui envoie la visite : l'en-tête `Origin`, que le
 * navigateur joint à tout envoi vers un autre site, et à défaut (absent, ou
 * « null » quand le site masque son adresse) l'en-tête `Referer`.
 */
export function senderHost(origin: string | null | undefined, referer: string | null | undefined): string | null {
  return webHostOf(origin) ?? webHostOf(referer);
}

/** L'hôte est-il celui du site du client (avec ou sans « www. ») ? */
function isExternalSiteHost(host: string, siteUrl: string): boolean {
  return externalHosts(siteUrl).includes(bareHost(host));
}

/**
 * Provenance d'une visite du site du client, dans les mêmes catégories que
 * le site hébergé :
 * - clic (rendez-vous, appel) → `null`, la provenance ne se compte que sur
 *   les pages vues ;
 * - page vue sans `r` (navigation interne, rechargement, retour arrière) →
 *   `null` ;
 * - `r: "direct"` → accès direct ;
 * - `r` = hôte du site lui-même (passage de « www. » à l'hôte nu, par
 *   exemple) → `null`, jamais « autres sites » ;
 * - sinon l'hôte est classé par `sourceFromReferrer`. Une application Android
 *   se présente par le nom de son paquet (`android-app://<paquet>`), dont le
 *   code de mesure ne transmet que la partie hôte : elle est reconnue ici,
 *   comme sur le site hébergé.
 */
export function externalMeasureSource(payload: Pick<ExternalMeasurePayload, "t" | "r">, siteUrl: string): AnalyticsSource | null {
  if (payload.t !== "p" || payload.r === undefined) return null;
  if (payload.r === "direct") return "direct";
  if (isExternalSiteHost(payload.r, siteUrl)) return null;
  if (Object.hasOwn(ANDROID_APP_SOURCES, payload.r)) return sourceFromReferrer(`android-app://${payload.r}`, null);
  return sourceFromReferrer(`https://${payload.r}`, null);
}

/** Issue de la décision : la ligne à inscrire, ou le motif pour lequel la visite est ignorée. */
export type MeasureDecision =
  | {
      ok: true;
      event: MeasureEventRow;
      /** Ligne `external_sites` du site mesuré */
      externalSiteId: string;
      /** Première visite reçue de ce site : `measure_seen_at` est à renseigner */
      first: boolean;
    }
  | { ok: false; reason: Extract<MeasureIgnoreReason, "unknown_key" | "archived" | "origin"> };

/**
 * Une visite reçue doit-elle être enregistrée ? Non si la clé ne désigne
 * aucun site, si le site est archivé (abonnement arrêté), ou si la page qui
 * l'envoie n'est pas sur le site du client : la clé est publique, n'importe
 * quelle page pourrait sinon gonfler les chiffres d'un praticien.
 */
export function decideMeasureEvent(
  payload: ExternalMeasurePayload,
  target: MeasureTarget | null,
  sender: { origin: string | null | undefined; referer: string | null | undefined },
): MeasureDecision {
  if (!target) return { ok: false, reason: "unknown_key" };
  if (target.siteStatus === "archived") return { ok: false, reason: "archived" };
  const host = senderHost(sender.origin, sender.referer);
  if (!host || !isExternalSiteHost(host, target.url)) return { ok: false, reason: "origin" };
  return {
    ok: true,
    event: {
      siteId: target.siteId,
      type: EXTERNAL_MEASURE_EVENTS[payload.t],
      path: payload.p,
      source: externalMeasureSource(payload, target.url),
      origin: ANALYTICS_ORIGIN_EXTERNAL,
    },
    externalSiteId: target.id,
    first: target.measureSeenAt === null,
  };
}

/**
 * Périmètre de l'identifiant anonyme de visiteur (`anonymousVisitorId`) pour
 * le site du client. Distinct de celui du site hébergé (l'identifiant du site
 * seul) : la CNIL demande que l'empreinte porte une composante propre au site
 * visité, pour qu'un même identifiant ne suive personne d'un domaine à
 * l'autre — ici, du site hébergé au site du client d'un même praticien.
 */
export function measureVisitorScope(siteId: string): string {
  return `${siteId}:${ANALYTICS_ORIGIN_EXTERNAL}`;
}

// « relation does not exist » (42P01) et « column does not exist » (42703)
const SCHEMA_MISSING_CODES = new Set(["42P01", "42703"]);

/**
 * La base n'a-t-elle pas encore reçu la migration 0009 (table
 * `external_sites`, colonne `analytics_events.origin`) ? La visite est alors
 * ignorée — l'inscrire sans `origin` la compterait comme une visite du site
 * hébergé.
 */
export function isMeasureSchemaMissing(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code !== null && SCHEMA_MISSING_CODES.has(code);
}
