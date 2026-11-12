"use client";

import { clsx } from "clsx";
import { Binoculars, Hourglass, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState } from "@/components/ds";
import { META_GALLERY_DEFAULT_FILTERS, type MetaAdMedia, type MetaAdsMarket, type MetaAdsSeed, type MetaGalleryFilters } from "@theralys/shared";
import type { MetaLibraryView, MetaVisualsView } from "@/lib/meta-ads/data";
import { marketUnavailableNotice } from "@/lib/meta-ads/market-status";
import { MarketToastBar } from "./market-feedback";
import { MarketGallery } from "./market-gallery";
import { MarketHeader, VisualsBanner } from "./market-header";
import { Icon, type IconName } from "./market-icons";
import { InsightsCard } from "./market-insights";
import type { MetaTab } from "./tabs";
import type { AnalysisLaunch } from "./use-analysis-launch";
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
  launcher,
  analysesRemaining,
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
  /** Lancement de l'analyse, partagé avec l'onglet « Diagnostic » */
  launcher: AnalysisLaunch;
  analysesRemaining: number;
  onSelectTab: (tab: MetaTab) => void;
}) {
  if (!analysisReady || !seed) {
    return (
      <Card padding="none">
        <EmptyState as="h2" icon={Binoculars} title="La veille du marché apparaîtra ici." action={<Button onClick={() => onSelectTab("diagnostic")}>Aller au diagnostic</Button>}>
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : les annonces des praticiens autour de vous (bibliothèque publicitaire Meta,
          annonces publiques), classées par zone, avec leur durée de diffusion et leur portée, puis une synthèse des angles, accroches et
          offres qui marchent.
        </EmptyState>
      </Card>
    );
  }

  if (!market) {
    const notice = marketUnavailableNotice({ provider, error, siteType, generationMissing });
    return (
      <Card padding="none" data-testid="meta-market-notice">
        <EmptyState
          as="h2"
          icon={notice.retry ? SearchX : Hourglass}
          title={notice.title}
          action={notice.retry ? <Button onClick={() => onSelectTab("diagnostic")}>Aller au diagnostic</Button> : undefined}
        >
          {notice.detail}
        </EmptyState>
      </Card>
    );
  }

  return <MarketWatch market={market} seed={seed} source={library} mediaByAdId={mediaByAdId} visuals={visuals} launcher={launcher} analysesRemaining={analysesRemaining} />;
}

/**
 * Veille disponible : en-tête, puis trois vues — « Annonces » (galerie de la
 * veille), « Ma bibliothèque » (exemples gardés) et « Synthèse » (lecture de
 * l'IA). Les filtres de chaque galerie survivent au changement de vue.
 */
function MarketWatch({
  market,
  seed,
  source,
  mediaByAdId,
  visuals,
  launcher,
  analysesRemaining,
}: {
  market: MetaAdsMarket;
  seed: MetaAdsSeed;
  source: MetaLibraryView;
  mediaByAdId: Record<string, MetaAdMedia>;
  visuals: MetaVisualsView;
  launcher: AnalysisLaunch;
  analysesRemaining: number;
}) {
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
    <div className="space-y-6">
      <MarketHeader market={market} seed={seed} dismissed={dismissed} launcher={launcher} analysesRemaining={analysesRemaining} />
      <VisualsBanner visuals={visuals} available={source.available} loader={loader} />

      {/* Sélecteur de vue, au dessin du sélecteur à segments du design system : la vue active est une pastille blanche, en gras */}
      <div role="group" aria-label="Vue de la veille" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-ds-ink-100 p-1 inset-ring inset-ring-ds-ink-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                "inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap ds-focus-inset sm:gap-2 sm:px-4 sm:text-ds-body pointer-coarse:min-h-11",
                active ? "bg-white font-semibold text-ds-section-ink shadow-ds-card" : "font-medium text-ds-ink-600 hover:text-ds-ink-900",
              )}
            >
              <Icon name={v.icon} filled={v.id === "bibliotheque" && active} className={clsx("hidden size-4 sm:block", active && "text-ds-section-accent")} />
              {v.label}
              {v.id === "bibliotheque" ? (
                <span className={clsx("rounded-full px-2 py-0.5 text-xs leading-4 font-semibold ds-tnum", active ? "bg-ds-section-tint-2 text-ds-section-ink" : "bg-white text-ds-ink-700 inset-ring inset-ring-ds-ink-200")}>
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
          <Card padding="none">
            <EmptyState as="h3" icon={Hourglass} title="Votre bibliothèque personnelle est en cours d'activation.">
              Vous pourrez bientôt y garder les annonces qui vous inspirent, avec leur analyse et leurs visuels.
            </EmptyState>
          </Card>
        )
      ) : null}

      {view === "synthese" && market.insights ? <InsightsCard insights={market.insights} adsById={adsById} /> : null}

      <MarketToastBar toast={library.toast} onClose={library.closeToast} />
    </div>
    </MarketVisualsContext.Provider>
  );
}
