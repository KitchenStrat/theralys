import { hasSocialMedia } from "@theralys/db";
import { Card } from "@theralys/ui";
import { isoDay, monthRange } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { parseMonthParam } from "@/lib/calendar";
import { getSite } from "@/lib/data";
import { getSocialMonth, getSocialMonthState, getSocialRequestUsage } from "@/lib/social/data";
import { swatchesFor } from "@/lib/social/render/theme";
import { SocialClient } from "./social-client";

export const metadata = { title: "Réseaux sociaux" };
export const dynamic = "force-dynamic";
// Préparation du mois en mode live : 25-60 s attendus (§5.5)
export const maxDuration = 300;

/** Horizon des demandes « sur mesure » (jours), aligné sur l'action. */
const REQUEST_HORIZON_DAYS = 120;

type Props = { searchParams: Promise<{ mois?: string }> };

export default async function SocialPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Incluse dans toutes les formules (démos comprises) — repli conservé si le gating changeait
  if (!hasSocialMedia(site.plan)) {
    return (
      <div>
        <h1 className="text-4xl font-bold">Réseaux sociaux</h1>
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">
            Les contenus réseaux sociaux ne sont pas inclus dans votre formule
          </p>
          <p className="mt-1 text-sm">
            Contactez Harmony pour activer vos contenus prêts à poster, préparés chaque mois
            à partir de votre site.
          </p>
        </Card>
      </div>
    );
  }

  const { mois } = await searchParams;
  const now = new Date();
  const { year, month } = parseMonthParam(mois, now);

  const [items, state, usage] = await Promise.all([
    getSocialMonth(site.id, year, month),
    getSocialMonthState(site.id, year, month, now),
    getSocialRequestUsage(site.id, now),
  ]);

  // Date par défaut de la barre : prochain créneau libre, sinon le premier
  // jour ≥ demain du mois affiché, sinon demain.
  const todayIso = isoDay(now);
  const tomorrow = isoDay(new Date(now.getTime() + 86_400_000));
  const { startIso, endIso } = monthRange(year, month);
  const firstInMonth = startIso > tomorrow ? startIso : tomorrow;
  const defaultRequestDate =
    state.freeSlots[0]?.date ?? (firstInMonth < endIso ? firstInMonth : tomorrow);

  return (
    <SocialClient
      year={year}
      month={month}
      items={items}
      state={state}
      usage={usage}
      swatches={swatchesFor(site.theme)}
      siteName={site.name}
      todayIso={todayIso}
      requestDates={{
        default: defaultRequestDate,
        min: tomorrow,
        max: isoDay(new Date(now.getTime() + REQUEST_HORIZON_DAYS * 86_400_000)),
      }}
    />
  );
}
