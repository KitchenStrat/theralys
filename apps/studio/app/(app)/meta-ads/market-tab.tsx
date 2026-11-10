"use client";

import { clsx } from "clsx";
import { useMemo, useState } from "react";
import { Button, Card } from "@theralys/ui";
import { META_GALLERY_DEFAULT_FILTERS, type MetaAdMedia, type MetaAdsMarket, type MetaAdsSeed, type MetaGalleryFilters } from "@theralys/shared";
import type { MetaLibraryView, MetaVisualsView } from "@/lib/meta-ads/data";
import { marketUnavailableNotice } from "@/lib/meta-ads/market-status";
import { MarketToastBar } from "./market-feedback";
import { MarketGallery } from "./market-gallery";
import { MarketHeader, VisualsBanner } from "./market-header";
import { FOCUS_RING, Icon, type IconName } from "./market-icons";
import { InsightsCard } from "./market-insights";
import type { MetaTab } from "./tabs";
import { useMarketLibrary } from "./use-market-library";
import { MarketVisualsContext, useVisualsLoader } from "./use-visuals-loader";

type MarketView = "annonces" | "bibliotheque" | "synthese";

const VIEWS: { id: MarketView; label: string; icon: IconName }[] = [
  { id: "annonces", label: "Annonces", icon: "image" },
  { id: "bibliotheque", label: "Ma bibliothèque", icon: "bookmark" },
  { id: "synthese", label: "Synthèse", icon: "sparkle" },
];

export function MarketTab({
  market,
  seed,
  provider,
  error,
  generationMissing,
  analysisReady,
  siteType,
  library,
  mediaByAdId,
  visuals,
  onSelectTab,
}: {
  market: MetaAdsMarket | null;
  seed: MetaAdsSeed | null;
  /** meta | mock | none (aucun jeton ni fournisseur) de la dernière analyse aboutie */
  provider: string | null;
  /** Message d'erreur de l'analyse (échec de la veille quand `market` est null et la génération a abouti) */
  error: string | null;
  /** Créas, plan vidéo ou plan manquants : `error` concerne alors la génération */
  generationMissing: boolean;
  analysisReady: boolean;
  siteType: "demo" | "client";
  /** Bibliothèque personnelle du site : exemples gardés et annonces supprimées */
  library: MetaLibraryView;
  /** Visuels des annonces de la veille, par identifiant d'annonce */
  mediaByAdId: Record<string, MetaAdMedia>;
  visuals: MetaVisualsView;
  onSelectTab: (tab: MetaTab) => void;
}) {
  if (!analysisReady || !seed) {
    return (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">La veille du marché apparaîtra ici.</p>
        <p className="mt-1 text-sm">
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : les annonces des praticiens autour de vous (bibliothèque publicitaire Meta,
          annonces publiques), classées par zone, avec leur durée de diffusion et leur portée, puis une synthèse des angles, accroches et
          offres qui marchent.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        </div>
      </Card>
    );
  }

  if (!market) {
    const notice = marketUnavailableNotice({ provider, error, siteType, generationMissing });
    return (
      <Card className="p-8 text-center text-ink-500" data-testid="meta-market-notice">
        <p className="font-medium text-ink-700">{notice.title}</p>
        <p className="mt-1 text-sm">{notice.detail}</p>
        {notice.retry ? (
          <div className="mt-5">
            <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
              Aller au diagnostic
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }

  return <MarketWatch market={market} seed={seed} source={library} mediaByAdId={mediaByAdId} visuals={visuals} />;
}

/**
 * Veille disponible : en-tête, puis trois vues — « Annonces » (galerie de la
 * veille), « Ma bibliothèque » (exemples gardés) et « Synthèse » (lecture de
 * l'IA). Les filtres de chaque galerie survivent au changement de vue.
 */
function MarketWatch({ market, seed, source, mediaByAdId, visuals }: { market: MetaAdsMarket; seed: MetaAdsSeed; source: MetaLibraryView; mediaByAdId: Record<string, MetaAdMedia>; visuals: MetaVisualsView }) {
  const [chosenView, setView] = useState<MarketView>("annonces");
  const [now] = useState(() => new Date());
  const [watchFilters, setWatchFilters] = useState<MetaGalleryFilters>(META_GALLERY_DEFAULT_FILTERS);
  const [libraryFilters, setLibraryFilters] = useState<MetaGalleryFilters>(META_GALLERY_DEFAULT_FILTERS);
  const library = useMarketLibrary({ market, mediaByAdId, library: source });
  const adsById = useMemo(() => new Map(market.ads.map((a) => [a.id, a])), [market]);
  // Visuels manquants : chargés d'office, les cartes savent lesquels restent à chercher
  const loader = useVisualsLoader({ visuals, available: source.available, watchKey: `${market.fetchedAt}:${market.ads.length}` });
  const visualsContext = useMemo(() => ({ pendingIds: new Set(visuals.pendingIds), loading: loader.loading }), [visuals.pendingIds, loader.loading]);

  const views = VIEWS.filter((v) => v.id !== "synthese" || market.insights !== null);
  const view: MarketView = chosenView === "synthese" && !market.insights ? "annonces" : chosenView;
  // Supprimées par le praticien : écartées à l'analyse, ou retirées de la veille courante depuis
  const dismissed = (market.dismissed ?? 0) + (market.ads.length - library.watch.length);

  return (
    <MarketVisualsContext.Provider value={visualsContext}>
    <div className="space-y-5">
      <MarketHeader market={market} seed={seed} dismissed={dismissed} />
      <VisualsBanner visuals={visuals} available={source.available} loader={loader} />

      <div role="group" aria-label="Vue de la veille" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-cream-200 bg-white/80 p-1 shadow-(--shadow-card)">
        {views.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              data-testid={`meta-view-${v.id}`}
              aria-pressed={active}
              onClick={() => setView(v.id)}
              className={clsx(
                "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors sm:px-4",
                FOCUS_RING,
                active ? "bg-primary-600 text-white shadow-sm" : "text-ink-700 hover:bg-cream-100 hover:text-ink-900",
              )}
            >
              <Icon name={v.icon} filled={v.id === "bibliotheque" && active} className="hidden h-4 w-4 sm:block" />
              {v.label}
              {v.id === "bibliotheque" ? (
                <span className={clsx("rounded-full px-1.5 py-px text-[11px] tabular-nums leading-4", active ? "bg-white/20 text-white" : "bg-primary-100 text-primary-700")}>
                  {library.kept.length}
                  <span className="sr-only"> {library.kept.length > 1 ? "exemples gardés" : "exemple gardé"}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {view === "annonces" ? (
        <MarketGallery key="veille" mode="veille" ads={library.watch} filters={watchFilters} onFilters={setWatchFilters} library={library} now={now} onShowWatch={() => setView("annonces")} />
      ) : null}

      {view === "bibliotheque" ? (
        source.available ? (
          <MarketGallery key="bibliotheque" mode="bibliotheque" ads={library.kept} filters={libraryFilters} onFilters={setLibraryFilters} library={library} now={now} onShowWatch={() => setView("annonces")} />
        ) : (
          <Card className="p-8 text-center text-sm text-ink-500">Votre bibliothèque personnelle est en cours d&apos;activation.</Card>
        )
      ) : null}

      {view === "synthese" && market.insights ? <InsightsCard insights={market.insights} adsById={adsById} /> : null}

      <MarketToastBar toast={library.toast} onClose={library.closeToast} />
    </div>
    </MarketVisualsContext.Provider>
  );
}
