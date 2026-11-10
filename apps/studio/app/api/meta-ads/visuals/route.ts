import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { metaAccess } from "@/lib/meta-ads/access";
import { VISUALS_MESSAGES, loadVisualsBatch } from "@/lib/meta-ads/visuals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE = "private, no-store";

const bodySchema = z.object({ exclude: z.array(z.string().regex(/^\d{5,25}$/)).max(300).optional() });

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
 * POST /api/meta-ads/visuals — cherche les visuels d'un lot d'annonces de la
 * veille courante du site qui n'en ont pas encore, et rend le décompte du lot
 * (`VisualsBatch`). Le studio enchaîne les lots et rafraîchit la galerie
 * entre deux. Une route plutôt qu'une server action : le chargement ne
 * retient pas les gestes « garder » / « supprimer » pendant qu'il tourne.
 * Accès : session et formule ; même origine seulement.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  // Requête d'un autre site (formulaire ou script tiers) : refusée, elle consommerait le quota du praticien
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return NextResponse.json({ error: "La section Meta Ads n'est pas incluse dans votre formule." }, { status: 403 });

  let raw: unknown = {};
  try {
    const text = await request.text();
    raw = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  try {
    const batch = await loadVisualsBatch(site, { exclude: body.data.exclude ?? [] });
    return NextResponse.json(batch, { headers: { "Cache-Control": NO_STORE } });
  } catch (err) {
    console.error("[meta-ads] chargement des visuels en échec", { siteId: site.id, err });
    return NextResponse.json({ error: VISUALS_MESSAGES.failed }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}
