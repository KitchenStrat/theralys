import { hasGoogleAds } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getProspect, getSite, siteUrl } from "@/lib/data";
import { getGoogleAdsData, type GoogleAdsData } from "@/lib/google-ads/data";
import { isMissingSchemaError } from "@/lib/social/data";
import { AdsClient } from "./ads-client";
import { isAdsTab, type AdsTab } from "./tabs";

export const metadata = { title: "Google Ads" };
export const dynamic = "force-dynamic";
// L'analyse (idées de mots-clés + prévision + plan IA) peut prendre plusieurs minutes en mode réel
export const maxDuration = 300;

type Props = { searchParams: Promise<{ onglet?: string }> };

export default async function GoogleAdsPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Les démos présentent l'offre complète ; les clients suivent leur formule (Scale)
  if (site.type !== "demo" && !hasGoogleAds(site.plan)) {
    return (
      <Fallback title="La section Google Ads n'est pas incluse dans votre formule">
        Passez à la formule <strong>Scale</strong> pour savoir si Google Ads est pertinent pour votre
        cabinet, obtenir les mots-clés à cibler avec leurs volumes et coûts réels, un plan d&apos;action
        complet (campagne, annonces, budget) et le suivi des rendez-vous et appels venus de vos annonces.
      </Fallback>
    );
  }

  const { onglet } = await searchParams;
  const tab: AdsTab = isAdsTab(onglet) ? onglet : "diagnostic";
  const now = new Date();
  const prospect = await getProspect(site);

  let data: GoogleAdsData;
  try {
    data = await getGoogleAdsData(site, now);
  } catch (err) {
    // Déploiement avant la migration 0005 : page utilisable plutôt qu'une erreur 500
    if (!isMissingSchemaError(err)) throw err;
    console.error("[google-ads] schéma absent — migration 0005 non appliquée ?", err);
    return (
      <Fallback title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        Le diagnostic, les mots-clés à cibler, le plan d&apos;action et le suivi de vos annonces seront
        disponibles dès l&apos;activation.
      </Fallback>
    );
  }

  return (
    <AdsClient
      initialTab={tab}
      data={data}
      site={{
        name: site.name,
        domain: siteUrl(site).replace(/^https?:\/\//, ""),
        profession: prospect?.profession ?? "",
        city: prospect?.city ?? "",
      }}
    />
  );
}

function Fallback({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-4xl font-bold">Google Ads</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </Card>
    </div>
  );
}
