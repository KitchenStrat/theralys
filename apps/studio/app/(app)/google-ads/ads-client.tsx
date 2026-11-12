"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Badge, PageHeader, Stagger, TabPanel, Tabs, type TabItem } from "@/components/ds";
import { analysisSiteNotice } from "@/lib/google-ads/analysis-site";
import type { GoogleAdsData } from "@/lib/google-ads/data";
import { AnalysisSiteNotice } from "./analysis-site-notice";
import { DiagnosticTab } from "./diagnostic-tab";
import { KeywordsTab } from "./keywords-tab";
import { PlanTab } from "./plan-tab";
import { SetupTab } from "./setup-tab";
import { ADS_TABS, adsTabHref, isAdsTab, type AdsTab } from "./tabs";

export type AdsSiteInfo = {
  name: string;
  /** siteUrl(site) sans protocole : adresse du site Harmony, sur lequel agit le formulaire de suivi */
  domain: string;
  profession: string;
  city: string;
};

/** Préfixe des identifiants d'onglets et de panneaux (`google-ads-tab-plan`, `google-ads-panel-plan`). */
const TABS_ID = "google-ads";

/** Fondu posé au bord où la rangée d'onglets continue hors de l'écran. */
const EDGE_FADE = {
  end: "[mask-image:linear-gradient(to_right,#000_calc(100%_-_3rem),transparent)]",
  start: "[mask-image:linear-gradient(to_right,transparent,#000_3rem)]",
  both: "[mask-image:linear-gradient(to_right,transparent,#000_3rem,#000_calc(100%_-_3rem),transparent)]",
} as const;

/**
 * Rangée des onglets. Sur un téléphone, les quatre onglets ne tiennent pas dans
 * la largeur : la rangée défile, mais rien ne le dit (sa barre de défilement est
 * masquée). Un fondu au bord signale qu'il reste des onglets de ce côté ; il
 * disparaît quand on est au bout. Sans débordement, rien ne change.
 */
function TabsRow({ onClickCapture, children }: { onClickCapture: (event: MouseEvent<HTMLDivElement>) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const list = ref.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    const update = () => {
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      onClickCapture={onClickCapture}
      className={more.start && more.end ? EDGE_FADE.both : more.end ? EDGE_FADE.end : more.start ? EDGE_FADE.start : undefined}
    >
      {children}
    </div>
  );
}

export function AdsClient({ initialTab, data, site }: { initialTab: AdsTab; data: GoogleAdsData; site: AdsSiteInfo }) {
  const [tab, setTab] = useState<AdsTab>(initialTab);

  function select(next: AdsTab) {
    setTab(next);
    // L'URL reflète l'onglet (rechargement, partage) sans re-rendu serveur
    window.history.replaceState(null, "", adsTabHref(next));
    window.scrollTo({ top: 0 });
  }

  /**
   * Les onglets sont de vrais liens `?onglet=` (rechargement, partage, ouverture
   * dans un nouvel onglet du navigateur). Un clic simple — ou les flèches du
   * clavier, qui passent par un clic — change d'onglet sur place : intercepté
   * avant le lien, il évite un aller-retour au serveur pour des données déjà là.
   */
  function onTabClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
    const id = target?.id.slice(`${TABS_ID}-tab-`.length);
    if (!isAdsTab(id)) return;
    event.preventDefault();
    select(id);
  }

  const current = data.current;
  const analysisReady = Boolean(current?.diagnostic);
  // Analyse préparée pour un autre site que celui sur lequel les outils s'appuient aujourd'hui : dit sur toute la section
  const siteNotice = analysisSiteNotice(data.analysisSite, {
    subject: "le diagnostic, le plan d'action et les pages d'atterrissage",
    currentAddress: data.externalTracking?.address,
  });

  const tabs: TabItem<AdsTab>[] = ADS_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    href: adsTabHref(t.id),
    badge:
      t.id === "diagnostic" && current?.diagnostic ? (
        <Badge tone="section">
          {current.diagnostic.score}
          <span className="sr-only"> sur 100</span>
        </Badge>
      ) : undefined,
  }));

  return (
    <Stagger className="space-y-6">
      <PageHeader
        section="google-ads"
        purpose={
          data.externalTracking ? (
            // Site du client : le studio n'y rattache aucune visite à une annonce, il ne promet donc pas ce suivi
            <>
              Google Ads est-il pertinent pour vous ? Diagnostic, mots-clés à cibler, plan d&apos;action et pas-à-pas pour mesurer vos
              résultats sur votre site : Harmony prépare, vous paramétrez votre compte.
            </>
          ) : (
            <>
              Google Ads est-il pertinent pour vous ? Diagnostic, mots-clés à cibler, plan d&apos;action et suivi des rendez-vous venus de
              vos annonces : Harmony prépare, vous paramétrez votre compte.
            </>
          )
        }
      />

      {siteNotice ? <AnalysisSiteNotice notice={siteNotice} onRelaunch={tab === "diagnostic" ? undefined : () => select("diagnostic")} /> : null}

      <TabsRow onClickCapture={onTabClick}>
        <Tabs idBase={TABS_ID} label="Sections Google Ads" tabs={tabs} value={tab} />
      </TabsRow>

      <TabPanel key={tab} idBase={TABS_ID} tab={tab}>
        {tab === "diagnostic" ? (
          <DiagnosticTab
            latest={data.latest}
            current={current}
            usage={data.usage}
            budget={data.budget}
            analysisCostUsd={data.analysisCostUsd}
            site={site}
            onSelectTab={select}
          />
        ) : null}
        {tab === "mots-cles" ? (
          <KeywordsTab keywords={current?.keywords ?? null} city={current?.seedCity ?? ""} analysisReady={analysisReady} onSelectTab={select} />
        ) : null}
        {tab === "plan" ? (
          <PlanTab
            plan={current?.plan ?? null}
            analysisReady={analysisReady}
            planError={current?.error ?? null}
            instructions={current?.instructions ?? null}
            regenRemaining={data.usage.planRegenRemaining}
            analysisSite={data.analysisSite}
            onSelectTab={select}
          />
        ) : null}
        {tab === "parametrage" ? (
          <SetupTab
            plan={current?.plan ?? null}
            keywords={current?.keywords ?? null}
            tracking={data.tracking}
            cookieBanner={data.cookieBanner}
            results={data.results}
            resultsDays={data.resultsDays}
            siteDomain={site.domain}
            analysisSite={data.analysisSite}
            externalTracking={data.externalTracking}
            onSelectTab={select}
          />
        ) : null}
      </TabPanel>
    </Stagger>
  );
}
