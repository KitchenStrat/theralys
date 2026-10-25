import { hasSocialMedia } from "@theralys/db";
import { Card } from "@theralys/ui";
import { monthRange } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { clampIsoDay, parisDay, parseMonthParam, shiftIsoDay } from "@/lib/calendar";
import { getSite } from "@/lib/data";
import {
  getSocialMonth,
  getSocialRequestUsage,
  isMissingSchemaError,
  SOCIAL_HORIZON_DAYS,
  type SocialMonthData,
  type SocialRequestUsage,
} from "@/lib/social/data";
import { swatchesFor } from "@/lib/social/render/theme";
import { SocialClient } from "./social-client";

export const metadata = { title: "Réseaux sociaux" };
export const dynamic = "force-dynamic";
// Préparation du mois en mode live : 25-60 s attendus (§5.5)
export const maxDuration = 300;

type Props = { searchParams: Promise<{ mois?: string }> };

export default async function SocialPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Les démos présentent l'offre complète ; les clients suivent leur formule (Scale)
  if (site.type !== "demo" && !hasSocialMedia(site.plan)) {
    return (
      <Fallback title="Les contenus réseaux sociaux ne sont pas inclus dans votre formule">
        Passez à la formule <strong>Scale</strong> pour recevoir chaque mois vos contenus
        réseaux sociaux prêts à poster — visuels dans vos couleurs, carrousels, stories et
        légendes — préparés à partir de votre site, en plus du blog SEO, des outils de
        mots-clés et de l&apos;Académie.
      </Fallback>
    );
  }

  const { mois } = await searchParams;
  const now = new Date();
  const { year, month } = parseMonthParam(mois, now);

  let data: SocialMonthData;
  let usage: SocialRequestUsage;
  try {
    [data, usage] = await Promise.all([
      getSocialMonth(site.id, year, month, now),
      getSocialRequestUsage(site.id, now),
    ]);
  } catch (err) {
    // Déploiement avant la migration `social_posts` : page utilisable plutôt qu'une erreur 500
    if (!isMissingSchemaError(err)) throw err;
    console.error("[social] schéma absent — migration 0001 non appliquée ?", err);
    return (
      <Fallback title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        Vos contenus prêts à poster seront préparés à partir de votre site dès l&apos;activation.
      </Fallback>
    );
  }

  // Bornes des formulaires au jour civil des praticiens (Europe/Paris) ; les
  // créneaux et les bornes de mois restent en UTC.
  const todayIso = parisDay(now);
  const min = shiftIsoDay(todayIso, 1);
  const max = shiftIsoDay(todayIso, SOCIAL_HORIZON_DAYS);
  // Date par défaut de la barre : prochain créneau à pourvoir, sinon le premier
  // jour ≥ demain du mois affiché, sinon demain — toujours dans [min, max].
  const { startIso, endIso } = monthRange(year, month);
  const firstInMonth = startIso > min ? startIso : min;
  const wanted = data.state.freeSlots[0]?.date ?? (firstInMonth < endIso ? firstInMonth : min);

  return (
    <SocialClient
      year={year}
      month={month}
      items={data.items}
      state={data.state}
      usage={usage}
      swatches={swatchesFor(site.theme)}
      siteName={site.name}
      todayIso={todayIso}
      requestDates={{ default: clampIsoDay(wanted, min, max), min, max }}
    />
  );
}

function Fallback({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-4xl font-bold">Réseaux sociaux</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </Card>
    </div>
  );
}
