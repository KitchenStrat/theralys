import { Hourglass, Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { hasMetaAds } from "@theralys/db";
import { activeExternalSite } from "@theralys/shared";
import { Card, EmptyState, LinkButton, PageHeader, SECTIONS, Stagger } from "@/components/ds";
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
      <Fallback
        icon={Lock}
        title="La section Meta Ads n'est pas incluse dans votre formule"
        action={<LinkButton href={SECTIONS.compte.href}>Voir ma formule</LinkButton>}
      >
        Passez à la formule <strong>Scale</strong> pour savoir si Facebook et Instagram sont pertinents pour votre cabinet,
        suivre les annonces des praticiens autour de vous, obtenir vos annonces prêtes à publier (visuels, textes, plan vidéo),
        un plan de campagne complet et{" "}
        {/* Site du client en référence : le studio n'y rattache aucune visite à une annonce, il ne promet pas ce suivi */}
        {activeExternalSite(site.theme)
          ? "le pas-à-pas pour mesurer les résultats de vos annonces sur votre site."
          : "le suivi des rendez-vous et appels venus de vos annonces."}
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
      <Fallback icon={Hourglass} title="Cette section est en cours d'activation, revenez dans quelques minutes.">
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

/** Section indisponible (formule, activation en cours) : l'en-tête de la section, puis ce qui manque et ce qui apparaîtra. */
function Fallback({ icon, title, action, children }: { icon: LucideIcon; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Stagger className="space-y-6" data-ds-section="meta-ads">
      <PageHeader section="meta-ads" />
      <Card padding="none">
        <EmptyState as="h2" icon={icon} title={title} action={action}>
          {children}
        </EmptyState>
      </Card>
    </Stagger>
  );
}
