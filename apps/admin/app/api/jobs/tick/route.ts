import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@theralys/db";
import { TICK_GROUPS, isTickGroup, runTicks } from "@theralys/jobs";
import { alignLegacyAccounts } from "@/lib/formulas";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * L'appel porte-t-il le secret du cron ? Comparaison en temps constant, sur
 * des empreintes de même longueur : le temps de réponse ne dit rien du secret.
 * Sans secret configuré, tout est refusé.
 */
function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

/**
 * Point d'entrée des jobs planifiés (publication auto, calendrier éditorial,
 * rédaction J-7, e-mails hebdomadaire et mensuel, sync Search Console + avis
 * Google, fiche Google, relecture des sites des clients). Protégé par
 * CRON_SECRET. Les ticks sont idempotents, l'état vit en base.
 *
 * `?task=<groupe>` n'exécute qu'un groupe de tâches (`TICK_GROUPS`), avec sa
 * propre échéance : le cron Vercel appelle chaque groupe à son heure (voir
 * vercel.json). Sans paramètre, tout est exécuté en un passage (lancement à
 * la main). Un groupe inconnu est refusé (400).
 *
 * Réponse : 200 quand toutes les tâches ont abouti, 500 dès qu'une tâche est
 * en erreur — les autres ont tout de même été exécutées, le rapport de
 * chacune est dans le corps (type de l'erreur seulement, jamais son message).
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const task = request.nextUrl.searchParams.get("task");
  if (task !== null && !isTickGroup(task)) {
    return NextResponse.json({ error: "Tâche inconnue", tasks: TICK_GROUPS }, { status: 400 });
  }

  // Comptes d'avant le découpage de l'offre : les deux formules, une fois pour toutes (aussi fait à l'ouverture de l'admin)
  await alignLegacyAccounts(getDb()).catch((error) => console.error("[formules] alignement des comptes impossible", error instanceof Error ? error.name : "erreur"));
  const reports = await runTicks(task ?? undefined);
  const failed = reports.filter((report) => report.status === "error");
  if (failed.length > 0) console.error(`[ticks] ${failed.length} tâche(s) en erreur : ${failed.map((report) => `${report.task} (${report.error ?? "erreur"})`).join(", ")}`);
  return NextResponse.json({ ok: failed.length === 0, reports }, { status: failed.length > 0 ? 500 : 200 });
}
