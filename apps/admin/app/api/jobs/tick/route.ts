import { NextResponse, type NextRequest } from "next/server";
import { runAllTicks } from "@theralys/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Point d'entrée des jobs planifiés (e-mails hebdomadaire et mensuel,
 * calendrier éditorial, rédaction J-7, publication auto, sync Search Console
 * + avis Google, fiche Google). Appelé une fois par jour, à 6 h UTC, par le
 * cron Vercel (voir vercel.json) ; protégé par CRON_SECRET. Les ticks sont
 * idempotents, l'état vit en base.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const reports = await runAllTicks();
  return NextResponse.json({ ok: true, reports });
}
