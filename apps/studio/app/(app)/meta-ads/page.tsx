import { hasMetaAds } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getProspect, getSite, siteUrl } from "@/lib/data";
import { getMetaAdsData, type MetaAdsData } from "@/lib/meta-ads/data";
import { isMissingSchemaError } from "@/lib/social/data";
import { MetaClient } from "./meta-client";
import { isMetaTab, type MetaTab } from "./tabs";

export const metadata = { title: "Meta Ads" };
export const dynamic = "force-dynamic";
// L'analyse (veille de la bibliothèque + génération des annonces, du plan vidéo et du plan) peut prendre plusieurs minutes en mode réel
export const maxDuration = 300;

type Props = { searchParams: Promise<{ onglet?: string }> };

export default async function MetaAdsPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  // Les démos présentent l'offre complète ; les clients suivent leur formule (Scale)
  if (site.type !== "demo" && !hasMetaAds(site.plan)) {
    return (
      <Fallback title="La section Meta Ads n'est pas incluse dans votre formule">
        Passez à la formule <strong>Scale</strong> pour savoir si Facebook et Instagram sont pertinents pour votre cabinet,
        suivre les annonces des praticiens autour de vous, obtenir vos annonces prêtes à publier (visuels, textes, plan vidéo),
        un plan de campagne complet et le suivi des rendez-vous et appels venus de vos annonces.
      </Fallback>
    );
  }

  const { onglet } = await searchParams;
  const tab: MetaTab = isMetaTab(onglet) ? onglet : "diagnostic";
  const now = new Date();
  const prospect = await getProspect(site);

  let data: MetaAdsData;
  try {
    data = await getMetaAdsData(site, now);
  } catch (err) {
    // Déploiement avant la migration 0006 : page utilisable plutôt qu'une erreur 500
    if (!isMissingSchemaError(err)) throw err;
    console.error("[meta-ads] schéma absent — migration 0006 non appliquée ?", err);
    return (
      <Fallback title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        Le diagnostic, la veille du marché, vos annonces, le plan de campagne et le suivi seront disponibles dès l&apos;activation.
      </Fallback>
    );
  }

  return (
    <MetaClient
      initialTab={tab}
      data={data}
      site={{
        name: site.name,
        type: site.type,
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
      <h1 className="text-4xl font-bold">Meta Ads</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </Card>
    </div>
  );
}
