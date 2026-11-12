import { ArrowRight, Hourglass, Lock, RotateCw, type LucideIcon } from "lucide-react";
import { hasGoogleAds } from "@theralys/db";
import { activeExternalSite } from "@theralys/shared";
import { Card, EmptyState, LinkButton, PageHeader, Stagger } from "@/components/ds";
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
      <Fallback
        icon={Lock}
        title="La section Google Ads n'est pas incluse dans votre formule"
        action={
          <LinkButton href="/compte" iconRight={<ArrowRight size={18} aria-hidden />}>
            Voir ma formule
          </LinkButton>
        }
      >
        Passez à la formule <strong className="font-semibold text-ds-ink-800">Scale</strong> pour savoir si Google Ads est pertinent pour votre
        cabinet, obtenir les mots-clés à cibler avec leurs volumes et coûts réels, un plan d&apos;action complet (campagne, annonces, budget) et{" "}
        {/* Site du client en référence : le studio n'y rattache aucune visite à une annonce, il ne promet pas ce suivi */}
        {activeExternalSite(site.theme)
          ? "le pas-à-pas pour mesurer les résultats de vos annonces sur votre site."
          : "le suivi des rendez-vous et appels venus de vos annonces."}
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
      <Fallback
        icon={Hourglass}
        title="Cette section est en cours d'activation, revenez dans quelques minutes."
        action={
          <LinkButton href="/google-ads" variant="secondary" icon={<RotateCw size={18} aria-hidden />}>
            Actualiser la page
          </LinkButton>
        }
      >
        Le diagnostic, les mots-clés à cibler, le plan d&apos;action et le suivi de vos annonces seront disponibles dès l&apos;activation.
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

/** La section ne peut pas s'afficher (formule, activation en cours) : l'en-tête commun, puis pourquoi et quoi faire. */
function Fallback({ icon, title, action, children }: { icon: LucideIcon; title: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stagger className="space-y-6">
      <PageHeader section="google-ads" />
      <Card padding="none">
        <EmptyState as="h2" icon={icon} title={title} action={action}>
          {children}
        </EmptyState>
      </Card>
    </Stagger>
  );
}
