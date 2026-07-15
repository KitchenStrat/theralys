import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE_S,
  parseConsent,
  trackEventSchema,
} from "@theralys/analytics";
import { analyticsEvents, getDb, sites } from "@theralys/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Ingestion du tracking maison (pageview + rdv_click).
 * - Consentement accordé → cookie visiteur first-party (13 mois max, CNIL),
 *   événement rattaché à cet identifiant (visiteurs uniques).
 * - Pas de consentement → événement anonyme, aucun cookie posé
 *   (les clics RDV restent comptés, pas les visiteurs uniques).
 */
export async function POST(request: NextRequest) {
  let payload;
  try {
    payload = trackEventSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
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

  await db.insert(analyticsEvents).values({
    siteId: site.id,
    type: payload.type,
    visitorId,
    path: payload.path,
  });

  const response = NextResponse.json({ ok: true });
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
