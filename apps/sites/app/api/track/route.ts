import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE_S,
  parseConsent,
  trackEventSchema,
  type AnalyticsEventType,
} from "@theralys/analytics";
import { analyticsEvents, getDb, sites, type Database } from "@theralys/db";
import type { AnalyticsSource } from "@theralys/shared";
import { eq, sql } from "drizzle-orm";
import { isInvalidEnumError, isMissingColumnError } from "@/lib/pg-errors";
import { ownHostsFor, resolveTrackSource } from "@/lib/track-source";
import { anonymousVisitorId, isBotUserAgent } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/**
 * Ingestion du tracking maison (pageview, rdv_click, call_click).
 * - Consentement accordé → cookie visiteur first-party (13 mois max, CNIL),
 *   événement rattaché à cet identifiant durable (visiteurs uniques exacts).
 * - Pas de consentement → aucun cookie : identifiant anonyme haché
 *   (IP + navigateur + sel secret) qui tourne chaque jour, à la façon des
 *   outils de mesure d'audience exemptés de consentement. Impossible à
 *   recouper d'un jour sur l'autre, mais les visiteurs comptent quand même.
 * - Provenance (`source`) : déduite du referrer et du `src` (lien de bio,
 *   annonce Google) envoyés avec la première page vue de la session ; un
 *   referrer sur le site lui-même vaut navigation interne (null). Les clics
 *   (RDV, appel) reçoivent le `src` de session mémorisé par le navigateur :
 *   provenance connue ou null, jamais « accès direct ».
 * - Déploiement avant migration : colonne `origin` absente (0009) → événement
 *   enregistré tel quel, provenance comprise ; colonne `source` absente (0004)
 *   → enregistré sans provenance ; valeur `call_click` absente de l'enum (0005)
 *   → `{ ok: true, ignored: "schema" }`, jamais de 500.
 *
 * La reconnaissance des robots et l'identifiant anonyme vivent dans
 * `lib/visitor.ts`, partagés avec la mesure du site du client (`/api/m`).
 */
type TrackRow = { siteId: string; type: AnalyticsEventType; visitorId: string; path: string };

/**
 * Inscrit l'événement. Drizzle liste toutes les colonnes du schéma dans son
 * INSERT, même sans valeur : une colonne que la base n'a pas encore reçue
 * fait échouer la ligne entière (42703). Déployé avant une migration, on
 * réessaie donc en SQL explicite, du schéma le plus récent au plus ancien,
 * pour perdre le moins possible :
 * - avant 0009 (`origin` absente) : même ligne, provenance comprise — une
 *   visite du site hébergé n'a de toute façon pas d'origine ;
 * - avant 0004 (`source` absente) : la page vue compte, sans provenance.
 */
async function insertTrackEvent(db: Database, row: TrackRow, source: AnalyticsSource | null): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({ ...row, source });
    return;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  try {
    await db.execute(
      sql`insert into analytics_events (site_id, type, visitor_id, path, source) values (${row.siteId}, ${row.type}, ${row.visitorId}, ${row.path}, ${source})`,
    );
    return;
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
  }
  await db.execute(
    sql`insert into analytics_events (site_id, type, visitor_id, path) values (${row.siteId}, ${row.type}, ${row.visitorId}, ${row.path})`,
  );
}

export async function POST(request: NextRequest) {
  let payload;
  try {
    payload = trackEventSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  // Les robots (crawlers, aperçus, sondes) ne comptent ni en visiteurs ni en clics
  if (isBotUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true, ignored: "bot" });
  }

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, payload.siteId) });
  if (!site) {
    return NextResponse.json({ error: "Site inconnu" }, { status: 404 });
  }

  const consent = parseConsent(request.cookies.get(CONSENT_COOKIE)?.value);
  let visitorId: string | null = null;
  let setVisitorCookie = false;

  if (consent === "granted") {
    visitorId = request.cookies.get(VISITOR_COOKIE)?.value ?? null;
    if (!visitorId) {
      visitorId = randomUUID();
      setVisitorCookie = true;
    }
  }
  if (!visitorId) {
    visitorId = anonymousVisitorId(request.headers, site.id);
  }

  const source = resolveTrackSource(payload, ownHostsFor(request.headers.get("host"), site));

  const row = { siteId: site.id, type: payload.type, visitorId, path: payload.path };
  let ignored: "schema" | null = null;
  try {
    await insertTrackEvent(db, row, source);
  } catch (err) {
    // Déploiement avant la migration 0005 (`call_click` absent de l'enum analytics_event_type, 22P02) : clic ignoré, sans erreur
    if (!isInvalidEnumError(err)) throw err;
    console.warn(`[track] type « ${row.type} » refusé par l'enum analytics_event_type — migration 0005 non appliquée ?`);
    ignored = "schema";
  }

  const response = NextResponse.json(ignored ? { ok: true, ignored } : { ok: true });
  if (setVisitorCookie && visitorId) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      maxAge: VISITOR_MAX_AGE_S,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}
