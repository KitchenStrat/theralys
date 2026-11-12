"use client";

import { useMemo } from "react";
import { Binoculars, Images, Lightbulb, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Card, CardHeader, InlineSuccess, Spinner } from "@/components/ds";
import { META_ADS_ANALYSES_PER_MONTH, marketScopeNote, type MetaAdsMarket, type MetaAdsSeed, type MetaMarketScope } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { MetaVisualsView } from "@/lib/meta-ads/data";
import { dismissedNote, filteredNote, scopeCounters, visualsLoadingNote, visualsNote } from "@/lib/meta-ads/market-view";
import { AnalysisProgress } from "./analysis-progress";
import { Notice } from "./parts";
import type { AnalysisLaunch } from "./use-analysis-launch";
import type { VisualsLoader } from "./use-visuals-loader";

/** Lieu d'une zone (« Albi », « Tarn ») ; null pour les autres zones et la France, que le libellé dit déjà. */
function zoneName(scope: MetaMarketScope, seed: MetaAdsSeed): string | null {
  if (scope === "ville") return seed.city || "ville";
  if (scope === "departement") return seed.department?.name ?? "département";
  if (scope === "region") return seed.region ?? "région";
  return null;
}

/**
 * En-tête de la veille : zone retenue, source et date du relevé, compteurs
 * par zone, annonces écartées (d'office ou par le praticien), actualisation
 * de l'analyse et rappel de ce qu'est le signal.
 */
export function MarketHeader({
  market,
  seed,
  dismissed,
  launcher,
  analysesRemaining,
}: {
  market: MetaAdsMarket;
  seed: MetaAdsSeed;
  /** Annonces supprimées par le praticien (analyse et veille courante) */
  dismissed: number;
  /** Lancement de l'analyse (partagé avec l'onglet « Diagnostic ») */
  launcher: AnalysisLaunch;
  analysesRemaining: number;
}) {
  const counters = useMemo(() => scopeCounters(market), [market]);
  const active = market.ads.filter((a) => a.active).length;
  const strong = market.ads.filter((a) => a.signal === "fort").length;
  const filtered = filteredNote(market.filtered);
  const removed = dismissedNote(dismissed);

  return (
    <Card>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div>
          <CardHeader
            icon={Binoculars}
            title="Les annonces des praticiens autour de vous"
            description={marketScopeNote(market, seed)}
            action={
              <Button
                variant="secondary"
                size="sm"
                data-testid="meta-market-relaunch"
                onClick={launcher.launch}
                loading={launcher.running}
                disabled={!launcher.canLaunch}
                title={!launcher.canLaunch ? "Quota du mois atteint" : undefined}
                icon={<RefreshCw size={16} aria-hidden />}
              >
                {launcher.running ? "Analyse en cours…" : "Actualiser l'analyse"}
              </Button>
            }
          />
          <p className="mt-3 text-ds-meta text-ds-ink-600">
            Bibliothèque publicitaire Meta (annonces publiques diffusées en Europe), relevée le {formatDayFr(market.fetchedAt, "day")} sur {market.terms.length} terme
            {market.terms.length > 1 ? "s" : ""} ({market.terms.join(", ")}) · {active} en diffusion, {strong} à signal fort
            {market.truncated ? " · relevé plafonné" : ""}
            {market.source === "mock" ? " · données de démonstration" : ""}.
          </p>
          {filtered || removed ? (
            <div className="mt-1.5 space-y-1 text-ds-meta text-ds-ink-600">
              {filtered ? <p data-testid="meta-filtered-note">{filtered}</p> : null}
              {removed ? <p data-testid="meta-dismissed-note">{removed}</p> : null}
            </div>
          ) : null}
          <p className="mt-1.5 text-ds-meta text-ds-ink-600">
            Actualiser relève de nouveau les annonces du marché et refait votre diagnostic, vos annonces et votre plan ·{" "}
            <strong className="font-semibold text-ds-ink-800">
              {analysesRemaining} analyse{analysesRemaining > 1 ? "s" : ""} restante{analysesRemaining > 1 ? "s" : ""} sur {META_ADS_ANALYSES_PER_MONTH}
            </strong>{" "}
            ce mois-ci.
          </p>
          {/* Région vivante permanente : l'avancement et l'issue de l'analyse y sont annoncés */}
          <div aria-live="polite" data-testid="meta-market-relaunch-status">
            {launcher.pending ? (
              <p className="mt-3 flex items-center gap-2 text-ds-body text-ds-ink-700">
                <Spinner className="size-[1.125rem] text-ds-section-accent" /> Analyse en cours, jusqu&apos;à deux minutes : la veille s&apos;actualisera ici.
              </p>
            ) : null}
            {launcher.runningElsewhere ? (
              <p className="mt-3 flex items-center gap-2 text-ds-body text-ds-ink-700">
                <Spinner className="size-[1.125rem] text-ds-section-accent" /> Une analyse est en cours : la veille s&apos;actualisera dans un instant.
              </p>
            ) : null}
            {launcher.error ? (
              <p className="mt-3 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700" role="alert">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {launcher.error}
              </p>
            ) : null}
            {launcher.message && !launcher.running ? <InlineSuccess className="mt-3">{launcher.message}</InlineSuccess> : null}
          </div>
        </div>

        {/* Toute zone qui a des annonces : repérées dans la bibliothèque publicitaire, conservées dans la veille */}
        <dl className="grid grid-cols-2 content-start gap-2.5" aria-label="Annonces par zone">
          {counters.map(({ scope, label, spotted, kept }) => {
            const place = zoneName(scope, seed);
            return (
              <div key={scope} className="min-w-0 rounded-ds-md bg-ds-section-tint px-3.5 py-3 inset-ring inset-ring-ds-section-line/70">
                <dt className="text-ds-meta font-medium text-ds-ink-700">{label}</dt>
                <dd className="font-ds-display text-2xl/8 font-bold text-ds-section-ink">
                  {spotted} <span className="font-sans text-ds-body font-normal text-ds-ink-700">repérée{spotted > 1 ? "s" : ""}</span>
                </dd>
                <dd className="text-xs text-ds-ink-700">
                  {kept} conservée{kept > 1 ? "s" : ""}
                  {place ? ` · ${place}` : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* L'attente, étape par étape — hors de la région vivante, qui n'annonce que les phrases courtes */}
      {launcher.pending ? (
        <div className="mt-5 rounded-ds-md bg-ds-ink-50 p-4 inset-ring inset-ring-ds-ink-200">
          <AnalysisProgress startedAt={launcher.startedAt} where="Vous pouvez continuer à parcourir les annonces : la veille s'actualisera ici à la fin." />
        </div>
      ) : null}

      <Notice tone="section" icon={Lightbulb} className="mt-5">
        <strong className="font-semibold text-ds-ink-900">Le signal</strong> : personne ne paie longtemps une annonce qui ne marche pas. Une annonce diffusée depuis plus de
        30 jours et vue par de nombreuses personnes est un signal fort. Les visuels sont affichés pour vous inspirer : reprenez l&apos;idée, jamais l&apos;image ni le
        texte d&apos;un confrère.
      </Notice>
    </Card>
  );
}

/**
 * Visuels manquants (veille antérieure aux visuels, recherche interrompue,
 * clé ajoutée après coup) : ils se chargent d'eux-mêmes ; le bandeau dit où
 * en est le chargement, son bilan, et propose de le relancer s'il en reste.
 */
export function VisualsBanner({ visuals, available, loader }: { visuals: MetaVisualsView; /** Bibliothèque activée (les visuels en dépendent) */ available: boolean; loader: VisualsLoader }) {
  const missing = visuals.provider && visuals.missing > 0 && available;

  if (!missing && !loader.loading && !loader.message && !loader.error) return null;

  return (
    <div data-testid="meta-visuals-banner" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ds-md bg-ds-section-tint px-4 py-3 text-ds-body text-ds-ink-700 inset-ring inset-ring-ds-section-line/70">
      <Images size={20} aria-hidden className="shrink-0 text-ds-section-accent" />
      <div className="min-w-[12rem] flex-1" aria-live="polite">
        {loader.loading ? (
          <p className="inline-flex items-center gap-2" role="status" data-testid="meta-visuals-loading">
            <Spinner className="size-[1.125rem] text-ds-section-accent" /> {visualsLoadingNote(visuals.missing)}
          </p>
        ) : missing ? (
          <p>{visualsNote(visuals.missing)}</p>
        ) : null}
        {loader.error ? (
          <p className="flex items-start gap-2 font-medium text-ds-danger-700" role="alert">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            {loader.error}
          </p>
        ) : null}
        {loader.message && !loader.loading ? (
          <p className="font-medium text-ds-success-900" role="status">
            {loader.message}
          </p>
        ) : null}
      </div>
      {missing && !loader.loading ? (
        visuals.remaining === 0 ? (
          <p className="text-ds-ink-700">Quota mensuel de visuels atteint.</p>
        ) : (
          <Button variant="secondary" size="sm" data-testid="meta-visuals-load" onClick={loader.start}>
            Afficher les visuels
          </Button>
        )
      ) : null}
    </div>
  );
}
