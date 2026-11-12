import { and, eq, isNull } from "drizzle-orm";
import { analyticsEvents, externalSites, sites, type Database } from "@theralys/db";
import { isMeasureSchemaMissing, type MeasureEventRow, type MeasureTarget } from "./measure";

/**
 * Accès à la base du code de mesure (`/api/m`) : trois requêtes, sans
 * logique — la décision vit dans `measure.ts`.
 */

/**
 * Site du client désigné par une clé de mesure, avec le statut et le lien de
 * rendez-vous de son site hébergé. Colonnes listées une à une : les pages
 * lues et le profil du site (JSONB volumineux) ne sont pas chargés à chaque
 * visite.
 */
export async function findMeasureTarget(db: Database, key: string): Promise<MeasureTarget | null> {
  const [row] = await db
    .select({
      id: externalSites.id,
      siteId: externalSites.siteId,
      url: externalSites.url,
      measureSeenAt: externalSites.measureSeenAt,
      siteStatus: sites.status,
      bookingUrl: sites.bookingUrl,
    })
    .from(externalSites)
    .innerJoin(sites, eq(sites.id, externalSites.siteId))
    .where(eq(externalSites.measureKey, key))
    .limit(1);
  return row ?? null;
}

/**
 * Inscrit une visite acceptée puis, pour la première reçue d'un site, date
 * l'installation du code de mesure (`measure_seen_at`) — après l'insertion,
 * pour ne jamais annoncer « code installé » sans visite enregistrée. La
 * condition `IS NULL` garde la date de la toute première visite quand
 * plusieurs arrivent ensemble.
 */
export async function recordMeasureEvent(
  db: Database,
  visit: { event: MeasureEventRow; visitorId: string; externalSiteId: string; first: boolean },
  now: Date = new Date(),
): Promise<void> {
  await db.insert(analyticsEvents).values({ ...visit.event, visitorId: visit.visitorId });
  if (visit.first) {
    await db
      .update(externalSites)
      .set({ measureSeenAt: now })
      .where(and(eq(externalSites.id, visit.externalSiteId), isNull(externalSites.measureSeenAt)));
  }
}

/** Migration 0009 absente : signalé une fois, puis silencieux. */
let schemaMissingLogged = false;

/** Code court d'une erreur (SQLSTATE, code réseau de Node) ou, à défaut, son type. */
function errorLabel(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{3,24}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return err instanceof Error ? err.name : "erreur inconnue";
}

/**
 * Journalise un échec de la base sans jamais reprendre le message de
 * l'erreur : drizzle y recopie la requête et ses paramètres (clé de mesure,
 * chemin de la page, identifiant de visiteur), qui ne doivent pas se
 * retrouver dans les journaux. Seul un code est écrit.
 */
export function reportMeasureFailure(err: unknown): void {
  if (isMeasureSchemaMissing(err)) {
    if (!schemaMissingLogged) {
      schemaMissingLogged = true;
      console.warn(
        "[measure] table external_sites ou colonne analytics_events.origin absente — migration 0009 non appliquée ? Les visites des sites des clients ne sont pas comptées.",
      );
    }
    return;
  }
  console.error(`[measure] base de données en échec (${errorLabel(err)})`);
}
