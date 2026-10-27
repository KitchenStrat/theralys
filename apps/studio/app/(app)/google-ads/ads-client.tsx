"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { GoogleAdsData } from "@/lib/google-ads/data";
import { DiagnosticTab } from "./diagnostic-tab";
import { KeywordsTab } from "./keywords-tab";
import { PlanTab } from "./plan-tab";
import { SetupTab } from "./setup-tab";
import { ADS_TABS, adsTabHref, type AdsTab } from "./tabs";

export type AdsSiteInfo = {
  name: string;
  /** siteUrl(site) sans protocole (aperçu des annonces) */
  domain: string;
  profession: string;
  city: string;
};

export function AdsClient({ initialTab, data, site }: { initialTab: AdsTab; data: GoogleAdsData; site: AdsSiteInfo }) {
  const [tab, setTab] = useState<AdsTab>(initialTab);

  function select(next: AdsTab) {
    setTab(next);
    // L'URL reflète l'onglet (rechargement, partage) sans re-rendu serveur
    window.history.replaceState(null, "", adsTabHref(next));
    window.scrollTo({ top: 0 });
  }

  const current = data.current;
  const analysisReady = Boolean(current?.diagnostic);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Google Ads</h1>
          <p className="mt-1 text-sm text-ink-500">
            Google Ads est-il pertinent pour vous ? Diagnostic, mots-clés à cibler, plan d&apos;action et
            suivi des rendez-vous venus de vos annonces — Harmony prépare, vous paramétrez votre compte.
          </p>
        </div>
      </div>

      <nav aria-label="Sections Google Ads" className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-cream-200">
          {ADS_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <a
                  href={adsTabHref(t.id)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    select(t.id);
                  }}
                  className={clsx(
                    "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary-500 text-primary-700"
                      : "border-transparent text-ink-500 hover:border-cream-300 hover:text-ink-900",
                  )}
                >
                  {t.label}
                  {t.id === "diagnostic" && current?.diagnostic ? (
                    <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 text-[11px] text-primary-700">
                      {current.diagnostic.score}
                      <span className="sr-only"> sur 100</span>
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="mt-6" aria-label={ADS_TABS.find((t) => t.id === tab)?.label}>
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
            siteDomain={site.domain}
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
            onSelectTab={select}
          />
        ) : null}
      </section>
    </div>
  );
}
