"use client";

import { clsx } from "clsx";
import { Binoculars, GalleryVerticalEnd, SlidersHorizontal, Stethoscope, Target, type LucideIcon } from "lucide-react";
import { forwardRef, useState, type MouseEvent } from "react";
import { Badge, PageHeader, Stagger, TabPanel, Tabs } from "@/components/ds";
import { analysisSiteNotice } from "@/lib/google-ads/analysis-site";
import { metaLandingSuffix, type MetaLanding } from "@/lib/meta-ads/clipboard";
import type { MetaAdsData } from "@/lib/meta-ads/data";
import { AnalysisSiteNotice } from "../google-ads/analysis-site-notice";
import { CreativesTab } from "./creatives-tab";
import { DiagnosticTab } from "./diagnostic-tab";
import { MarketTab } from "./market-tab";
import { PlanTab } from "./plan-tab";
import { SetupTab } from "./setup-tab";
import { META_TABS, isMetaTab, metaTabHref, type MetaTab } from "./tabs";
import { useAnalysisLaunch } from "./use-analysis-launch";

export type MetaSiteInfo = {
  name: string;
  type: "demo" | "client";
  /** siteUrl(site) sans protocole : adresse du site Harmony, sur lequel agit le formulaire du Pixel */
  domain: string;
  profession: string;
  city: string;
};

/** Préfixe des identifiants des onglets (`meta-ads-tab-<onglet>`) et de leur panneau. */
const TABS_ID = "meta-ads";

/**
 * Icône d'onglet affichée à partir de 1 280 px seulement : en dessous (zone de
 * contenu de 744 px à 1 024 px), les cinq onglets tiennent sur une ligne sans
 * leurs icônes, et aucun ne reste caché hors de la rangée.
 */
function wideOnly(Icon: LucideIcon): LucideIcon {
  const Wide = forwardRef<SVGSVGElement, React.ComponentProps<LucideIcon>>(function Wide({ className, ...props }, ref) {
    return <Icon ref={ref} {...props} className={clsx(className, "max-xl:hidden")} />;
  });
  return Wide as LucideIcon;
}

const TAB_ICONS: Record<MetaTab, LucideIcon> = {
  diagnostic: wideOnly(Stethoscope),
  marche: wideOnly(Binoculars),
  annonces: wideOnly(GalleryVerticalEnd),
  plan: wideOnly(Target),
  parametrage: wideOnly(SlidersHorizontal),
};

export function MetaClient({ initialTab, data, site }: { initialTab: MetaTab; data: MetaAdsData; site: MetaSiteInfo }) {
  const [tab, setTab] = useState<MetaTab>(initialTab);
  // Un seul lancement pour toute la section : suivi depuis « Diagnostic » comme depuis « Marché »
  const launcher = useAnalysisLaunch({ latest: data.latest, usage: data.usage });

  function select(next: MetaTab) {
    setTab(next);
    // L'URL reflète l'onglet (rechargement, partage) sans re-rendu serveur
    window.history.replaceState(null, "", metaTabHref(next));
    window.scrollTo({ top: 0 });
  }

  /** Changement d'onglet demandé depuis le contenu (« Aller au diagnostic »…) : le focus suit, sur l'onglet ouvert. */
  function jump(next: MetaTab) {
    select(next);
    document.getElementById(`${TABS_ID}-tab-${next}`)?.focus({ preventScroll: true });
  }

  /**
   * Les onglets sont de vrais liens `?onglet=` (rechargement, partage, nouvel
   * onglet du navigateur). Un clic simple change l'onglet sur place, sans
   * relire la page : il est intercepté avant que le lien ne navigue.
   */
  function onTabClick(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[role="tab"]') : null;
    const id = link?.id.slice(`${TABS_ID}-tab-`.length);
    if (!link || !isMetaTab(id)) return;
    event.preventDefault();
    if (id !== tab) select(id);
  }

  const current = data.current;
  const analysisReady = Boolean(current?.diagnostic);
  // Pixel en place aujourd'hui : repéré sur le site du client quand les outils s'appuient sur lui, sinon renseigné pour le site Harmony
  const hasPixel = data.externalTracking ? data.externalTracking.metaPixel : data.tracking.metaPixelId !== "";
  const generationMissing = Boolean(current && (!current.creatives || !current.videoPlan || !current.plan));
  const analysisExternal = data.analysisSite.mode === "external";
  // Adresses d'atterrissage : le site de l'analyse, et le suffixe que dit son plan (aucun pour le site du client)
  const landing: MetaLanding = { site: data.analysisSite, suffix: metaLandingSuffix(current?.plan, analysisExternal) };
  // Analyse préparée pour un autre site que celui sur lequel les outils s'appuient aujourd'hui : dit sur toute la section
  const siteNotice = analysisSiteNotice(data.analysisSite, {
    subject: "le diagnostic, les annonces et les pages d'atterrissage",
    currentAddress: data.externalTracking?.address,
  });

  const tabs = META_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    href: metaTabHref(t.id),
    icon: TAB_ICONS[t.id],
    badge:
      t.id === "diagnostic" && current?.diagnostic ? (
        <Badge tone="section" className="px-2 py-0.5 ds-tnum">
          {current.diagnostic.score}
          <span className="sr-only"> sur 100</span>
        </Badge>
      ) : t.id === "annonces" && current?.creatives ? (
        <Badge tone="section" className="px-2 py-0.5 ds-tnum">
          {current.creatives.creatives.length}
        </Badge>
      ) : undefined,
  }));

  return (
    <Stagger className="space-y-6" data-ds-section="meta-ads">
      <PageHeader section="meta-ads" />

      {siteNotice ? <AnalysisSiteNotice notice={siteNotice} onRelaunch={tab === "diagnostic" ? undefined : () => jump("diagnostic")} /> : null}

      <div onClickCapture={onTabClick}>
        <Tabs idBase={TABS_ID} label="Sections Meta Ads" tabs={tabs} value={tab} />
      </div>

      <TabPanel key={tab} idBase={TABS_ID} tab={tab}>
        {tab === "diagnostic" ? <DiagnosticTab latest={data.latest} current={current} usage={data.usage} site={site} launcher={launcher} onSelectTab={jump} /> : null}
        {tab === "marche" ? (
          <MarketTab
            market={current?.market ?? null}
            seed={current?.seed ?? null}
            provider={current?.provider ?? null}
            error={current?.error ?? null}
            generationMissing={generationMissing}
            analysisReady={analysisReady}
            siteType={site.type}
            library={data.library}
            mediaByAdId={data.mediaByAdId}
            visuals={data.visuals}
            launcher={launcher}
            analysesRemaining={data.usage.analysesRemaining}
            onSelectTab={jump}
          />
        ) : null}
        {tab === "annonces" ? (
          <CreativesTab
            analysisId={current?.id ?? null}
            creatives={current?.creatives ?? null}
            videoPlan={current?.videoPlan ?? null}
            plan={current?.plan ?? null}
            analysisReady={analysisReady}
            generationError={generationMissing && current ? current.error : null}
            instructions={current?.instructions ?? null}
            regenRemaining={data.usage.regenRemaining}
            landing={landing}
            externalSite={analysisExternal}
            siteName={site.name}
            onSelectTab={jump}
          />
        ) : null}
        {tab === "plan" ? (
          <PlanTab
            plan={current?.plan ?? null}
            creatives={current?.creatives ?? null}
            videoPlan={current?.videoPlan ?? null}
            analysisReady={analysisReady}
            hasPixel={hasPixel}
            regenRemaining={data.usage.regenRemaining}
            landing={landing}
            externalSite={data.externalTracking !== null}
            onSelectTab={jump}
          />
        ) : null}
        {tab === "parametrage" ? (
          <SetupTab
            creatives={current?.creatives ?? null}
            videoPlan={current?.videoPlan ?? null}
            plan={current?.plan ?? null}
            tracking={data.tracking}
            cookieBanner={data.cookieBanner}
            results={data.results}
            resultsDays={data.resultsDays}
            siteDomain={site.domain}
            landing={landing}
            externalTracking={data.externalTracking}
            onSelectTab={jump}
          />
        ) : null}
      </TabPanel>
    </Stagger>
  );
}
