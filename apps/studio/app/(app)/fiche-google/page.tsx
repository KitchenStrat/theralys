import { hasGoogleProfile } from "@theralys/db";
import { Card } from "@theralys/ui";
import { monthRange } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { clampIsoDay, parisDay, parseMonthParam, shiftIsoDay } from "@/lib/calendar";
import { getProspect, getSite } from "@/lib/data";
import { getGoogleProfileData, type GoogleProfileData } from "@/lib/google/data";
import { GOOGLE_HORIZON_DAYS } from "@/lib/google/posts";
import { isMissingSchemaError } from "@/lib/social/data";
import { swatchesFor } from "@/lib/social/render/theme";
import { GoogleClient } from "./google-client";
import { isGoogleTab, type GoogleTab } from "./tabs";

export const metadata = { title: "Fiche Google" };
export const dynamic = "force-dynamic";
// Préparation du mois et relevés de visibilité en mode live : jusqu'à quelques minutes
export const maxDuration = 300;

type Props = { searchParams: Promise<{ onglet?: string; mois?: string }> };

export default async function GoogleProfilePage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Les démos présentent l'offre complète ; les clients suivent leur formule (Scale)
  if (site.type !== "demo" && !hasGoogleProfile(site.plan)) {
    return (
      <Fallback title="La section Fiche Google n'est pas incluse dans votre formule">
        Passez à la formule <strong>Scale</strong> pour auditer votre fiche Google, suivre votre
        visibilité sur Google Maps mot-clé par mot-clé, répondre à vos avis avec des réponses
        proposées et publier chaque semaine un post Google préparé à partir de votre site.
      </Fallback>
    );
  }

  const { onglet, mois } = await searchParams;
  const now = new Date();
  const calendar = parseMonthParam(mois, now);
  const tab: GoogleTab = isGoogleTab(onglet) ? onglet : "audit";

  let data: GoogleProfileData;
  const prospect = await getProspect(site);
  try {
    data = await getGoogleProfileData(site, prospect, calendar, now);
  } catch (err) {
    // Déploiement avant la migration 0003 : page utilisable plutôt qu'une erreur 500
    if (!isMissingSchemaError(err)) throw err;
    console.error("[google] schéma absent — migration 0003 non appliquée ?", err);
    return (
      <Fallback title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        L&apos;audit de votre fiche, votre visibilité locale, vos avis et vos posts Google seront
        disponibles dès l&apos;activation.
      </Fallback>
    );
  }

  const todayIso = parisDay(now);
  const min = shiftIsoDay(todayIso, 1);
  const max = shiftIsoDay(todayIso, GOOGLE_HORIZON_DAYS);
  const { startIso, endIso } = monthRange(calendar.year, calendar.month);
  const firstInMonth = startIso > min ? startIso : min;
  const wanted = data.posts.state.freeSlots[0]?.date ?? (firstInMonth < endIso ? firstInMonth : min);

  return (
    <GoogleClient
      initialTab={tab}
      siteName={site.name}
      data={data}
      calendar={calendar}
      todayIso={todayIso}
      requestDates={{ default: clampIsoDay(wanted, min, max), min, max }}
      swatches={swatchesFor(site.theme)}
    />
  );
}

function Fallback({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-4xl font-bold">Fiche Google</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </Card>
    </div>
  );
}
