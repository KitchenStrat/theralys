import type { NextRequest } from "next/server";
import { getDb } from "@theralys/db";
import { isExternalMeasureKey } from "@theralys/shared";
import {
  MEASURE_BODY_MAX_BYTES,
  decideMeasureEvent,
  measureVisitorScope,
  readBoundedText,
  screenMeasureRequest,
  type MeasureTarget,
} from "@/lib/measure";
import {
  INERT_MEASURE_SCRIPT,
  MEASURE_INERT_MAX_AGE_S,
  MEASURE_SCRIPT_MAX_AGE_S,
  measureBookingHosts,
  measureEndpoint,
  measureScript,
} from "@/lib/measure-script";
import { findMeasureTarget, recordMeasureEvent, reportMeasureFailure } from "@/lib/measure-store";
import { anonymousVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/**
 * Code de mesure du site du client (cf. « Code de mesure » dans
 * `@theralys/shared` external-site.ts) — un praticien qui a déjà son site y
 * colle une balise, et ses visites alimentent les statistiques du studio.
 *
 * - `GET /api/m?k=<clé>` : le script (`lib/measure-script.ts`), inerte pour
 *   une clé invalide, inconnue ou d'un site archivé.
 * - `POST /api/m` : une visite. Toujours 204, sans détail, qu'elle soit
 *   enregistrée ou ignorée (`lib/measure.ts`) : la clé est publique, la
 *   réponse ne doit rien apprendre. Jamais de cookie, ni lu ni posé — le
 *   visiteur est compté par le même identifiant anonyme journalier que sur le
 *   site hébergé, et la ligne porte `origin = external`.
 * - Base pas encore migrée (0009) ou en échec : script inerte, visite
 *   ignorée, jamais d'erreur renvoyée au site du client.
 *
 * Aucune adresse IP, aucun chemin de page ni aucune clé dans les journaux.
 */

// Le script envoie des requêtes « simples » (texte brut, sans lecture de la réponse) : ces en-têtes ne servent
// qu'à un navigateur ou un outil qui ferait malgré tout une requête préalable. Rien de lisible n'est renvoyé.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function received(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

function scriptResponse(script: string, maxAgeSeconds: number): Response {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
      "X-Content-Type-Options": "nosniff",
      // Script fait pour être chargé depuis un autre site, y compris par une page qui isole ses ressources
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const key = request.nextUrl.searchParams.get("k");
  if (!isExternalMeasureKey(key)) return scriptResponse(INERT_MEASURE_SCRIPT, MEASURE_INERT_MAX_AGE_S);

  let target: MeasureTarget | null = null;
  try {
    target = await findMeasureTarget(getDb(), key);
  } catch (err) {
    reportMeasureFailure(err);
  }
  // Site archivé : ses visites seraient ignorées, autant ne rien faire envoyer aux navigateurs
  if (!target || target.siteStatus === "archived") {
    return scriptResponse(INERT_MEASURE_SCRIPT, MEASURE_INERT_MAX_AGE_S);
  }

  return scriptResponse(
    measureScript({
      key,
      endpoint: measureEndpoint(request.nextUrl, request.headers.get("x-forwarded-proto")),
      bookingHosts: measureBookingHosts(target.bookingUrl, target.url),
    }),
    MEASURE_SCRIPT_MAX_AGE_S,
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const screening = screenMeasureRequest(
      await readBoundedText(request, MEASURE_BODY_MAX_BYTES),
      request.headers.get("user-agent"),
    );
    if (!screening.ok) return received();

    const db = getDb();
    const decision = decideMeasureEvent(screening.payload, await findMeasureTarget(db, screening.payload.k), {
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
    });
    if (!decision.ok) return received();

    await recordMeasureEvent(db, {
      event: decision.event,
      visitorId: anonymousVisitorId(request.headers, measureVisitorScope(decision.event.siteId)),
      externalSiteId: decision.externalSiteId,
      first: decision.first,
    });
  } catch (err) {
    reportMeasureFailure(err);
  }
  return received();
}

export function OPTIONS(): Response {
  return received();
}
