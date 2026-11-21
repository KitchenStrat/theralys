import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@theralys/db";
import { refreshMetaMarket } from "@theralys/jobs";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { metaAccess } from "@/lib/meta-ads/access";
import { createMetaMediaStore } from "@/lib/meta-ads/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Collecte de la bibliothèque, visuels et synthèse : jusqu'à quelques minutes sur la vraie bibliothèque
export const maxDuration = 300;

const NO_STORE = "private, no-store";

/** L'en-tête Origin, quand le navigateur l'envoie, doit désigner l'hôte servi (comme pour les server actions). */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * POST /api/meta-ads/market/refresh — « veille seule » : rattrape la veille
 * de la dernière analyse du site quand elle a été enregistrée avec d'anciennes
 * règles de sélection et montre trop peu d'annonces (`refreshMetaMarket`).
 * Aucune analyse n'est décomptée ; créas et plans ne sont pas touchés. Le
 * service décide seul s'il y a lieu de rattraper et n'accepte qu'une
 * tentative par jour : rappeler la route ne relance rien. Une route plutôt
 * qu'une server action : le rattrapage ne retient pas les gestes « garder » /
 * « supprimer » ni le lancement d'une analyse pendant qu'il tourne.
 * Accès : session et formule ; même origine seulement.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  // Requête d'un autre site (formulaire ou script tiers) : refusée, elle solliciterait la bibliothèque au nom du praticien
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return NextResponse.json({ error: "La section Meta Ads n'est pas incluse dans votre formule." }, { status: 403 });

  const started = Date.now();
  try {
    const outcome = await refreshMetaMarket(getDb(), site.id, { now: new Date(), mediaStore: createMetaMediaStore() });
    revalidatePath("/meta-ads");
    console.info("[meta-ads] veille seule demandée par le studio", { siteId: site.id, outcome, ms: Date.now() - started });
    const refreshed = outcome.status === "done";
    return NextResponse.json({ refreshed, ...(refreshed ? { ads: outcome.ads } : {}) }, { headers: { "Cache-Control": NO_STORE } });
  } catch (err) {
    console.error("[meta-ads] veille seule en échec", { siteId: site.id, ms: Date.now() - started, err });
    return NextResponse.json({ refreshed: false }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}
