"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { analysisSiteNotice } from "@/lib/google-ads/analysis-site";
import { metaLandingSuffix, type MetaLanding } from "@/lib/meta-ads/clipboard";
import type { MetaAdsData } from "@/lib/meta-ads/data";
import { AnalysisSiteNotice } from "../google-ads/analysis-site-notice";
import { CreativesTab } from "./creatives-tab";
import { DiagnosticTab } from "./diagnostic-tab";
import { MarketTab } from "./market-tab";
import { PlanTab } from "./plan-tab";
import { SetupTab } from "./setup-tab";
import { META_TABS, metaTabHref, type MetaTab } from "./tabs";
import { useAnalysisLaunch } from "./use-analysis-launch";

export type MetaSiteInfo = {
  name: string;
  type: "demo" | "client";
  /** siteUrl(site) sans protocole : adresse du site Harmony, sur lequel agit le formulaire du Pixel */
  domain: string;
  profession: string;
  city: string;
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Meta Ads</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data.externalTracking ? (
              // Site du client : le studio n'y rattache aucune visite à une annonce, il ne promet donc pas ce suivi
              <>
                Facebook et Instagram sont-ils pertinents pour vous ? Diagnostic, veille des annonces autour de vous, annonces prêtes à
                publier, plan vidéo, plan de campagne et pas-à-pas pour mesurer vos résultats sur votre site — Harmony prépare, vous
                diffusez depuis votre compte Meta.
              </>
            ) : (
              <>
                Facebook et Instagram sont-ils pertinents pour vous ? Diagnostic, veille des annonces autour de vous, annonces prêtes à
                publier, plan vidéo, plan de campagne et suivi des rendez-vous venus de vos annonces — Harmony prépare, vous diffusez
                depuis votre compte Meta.
              </>
            )}
          </p>
        </div>
      </div>

      {siteNotice ? <AnalysisSiteNotice notice={siteNotice} onRelaunch={tab === "diagnostic" ? undefined : () => select("diagnostic")} /> : null}

      <nav aria-label="Sections Meta Ads" className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-cream-200">
          {META_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <a
                  href={metaTabHref(t.id)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    select(t.id);
                  }}
                  className={clsx(
                    "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    active ? "border-primary-500 text-primary-700" : "border-transparent text-ink-500 hover:border-cream-300 hover:text-ink-900",
                  )}
                >
                  {t.label}
                  {t.id === "diagnostic" && current?.diagnostic ? (
                    <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 text-[11px] text-primary-700">
                      {current.diagnostic.score}
                      <span className="sr-only"> sur 100</span>
                    </span>
                  ) : null}
                  {t.id === "annonces" && current?.creatives ? (
                    <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 text-[11px] text-primary-700">{current.creatives.creatives.length}</span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="mt-6" aria-label={META_TABS.find((t) => t.id === tab)?.label}>
        {tab === "diagnostic" ? <DiagnosticTab latest={data.latest} current={current} usage={data.usage} site={site} launcher={launcher} onSelectTab={select} /> : null}
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
            onSelectTab={select}
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
            onSelectTab={select}
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
            onSelectTab={select}
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
            onSelectTab={select}
          />
        ) : null}
      </section>
    </div>
  );
}
