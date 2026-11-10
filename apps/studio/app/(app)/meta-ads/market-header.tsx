"use client";

import { useMemo } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import { META_ADS_ANALYSES_PER_MONTH, marketScopeNote, type MetaAdsMarket, type MetaAdsSeed, type MetaMarketScope } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { MetaVisualsView } from "@/lib/meta-ads/data";
import { dismissedNote, filteredNote, scopeCounters, visualsLoadingNote, visualsNote } from "@/lib/meta-ads/market-view";
import { Icon } from "./market-icons";
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
    <Card className="p-5 sm:p-6">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h2 className="text-xl font-semibold">Les annonces des praticiens autour de vous</h2>
            <Button
              variant="secondary"
              size="sm"
              data-testid="meta-market-relaunch"
              onClick={launcher.launch}
              disabled={launcher.running || !launcher.canLaunch}
              title={!launcher.canLaunch ? "Quota du mois atteint" : undefined}
            >
              {launcher.running ? (
                <>
                  <Spinner /> Analyse en cours…
                </>
              ) : (
                "Actualiser l'analyse"
              )}
            </Button>
          </div>
          <p className="mt-1 text-sm text-ink-700">{marketScopeNote(market, seed)}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            Bibliothèque publicitaire Meta (annonces publiques diffusées en Europe), relevée le {formatDayFr(market.fetchedAt, "day")} sur {market.terms.length} terme
            {market.terms.length > 1 ? "s" : ""} ({market.terms.join(", ")}) · {active} en diffusion, {strong} à signal fort
            {market.truncated ? " · relevé plafonné" : ""}
            {market.source === "mock" ? " · données de démonstration" : ""}.
          </p>
          {filtered || removed ? (
            <div className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-500">
              {filtered ? <p data-testid="meta-filtered-note">{filtered}</p> : null}
              {removed ? <p data-testid="meta-dismissed-note">{removed}</p> : null}
            </div>
          ) : null}
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            Actualiser relève de nouveau les annonces du marché et refait votre diagnostic, vos annonces et votre plan ·{" "}
            <strong className="font-medium text-ink-700">
              {analysesRemaining} analyse{analysesRemaining > 1 ? "s" : ""} restante{analysesRemaining > 1 ? "s" : ""} sur {META_ADS_ANALYSES_PER_MONTH}
            </strong>{" "}
            ce mois-ci.
          </p>
          {/* Région vivante permanente : l'avancement et l'issue de l'analyse y sont annoncés */}
          <div aria-live="polite" data-testid="meta-market-relaunch-status">
            {launcher.pending ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <Spinner /> Analyse en cours, jusqu&apos;à deux minutes : la veille s&apos;actualisera ici.
              </p>
            ) : null}
            {launcher.runningElsewhere ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <Spinner /> Une analyse est en cours : la veille s&apos;actualisera dans un instant.
              </p>
            ) : null}
            {launcher.error ? (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {launcher.error}
              </p>
            ) : null}
            {launcher.message && !launcher.running ? (
              <p className="mt-2 text-sm text-green-800" role="status">
                {launcher.message}
              </p>
            ) : null}
          </div>
        </div>

        {/* Toute zone qui a des annonces : repérées dans la bibliothèque publicitaire, conservées dans la veille */}
        <dl className="grid grid-cols-2 content-start gap-2" aria-label="Annonces par zone">
          {counters.map(({ scope, label, spotted, kept }) => {
            const place = zoneName(scope, seed);
            return (
              <div key={scope} className="min-w-0 rounded-2xl bg-cream-100/70 px-3.5 py-2.5">
                <dt className="text-xs text-ink-500">{label}</dt>
                <dd className="text-lg font-semibold leading-snug text-ink-900">
                  {spotted} <span className="text-sm font-normal text-ink-500">repérée{spotted > 1 ? "s" : ""}</span>
                </dd>
                <dd className="text-[11px] text-ink-500">
                  {kept} conservée{kept > 1 ? "s" : ""}
                  {place ? ` · ${place}` : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <p className="mt-4 rounded-xl bg-cream-100 px-4 py-2.5 text-[13px] leading-relaxed text-ink-700">
        <strong className="text-ink-900">Le signal</strong> : personne ne paie longtemps une annonce qui ne marche pas. Une annonce diffusée depuis plus de 30 jours et vue par
        de nombreuses personnes est un signal fort. Les visuels sont affichés pour vous inspirer : reprenez l&apos;idée, jamais l&apos;image ni le texte d&apos;un confrère.
      </p>
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
    <div data-testid="meta-visuals-banner" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-ink-700">
      <Icon name="image" className="h-5 w-5 shrink-0 text-primary-600" />
      <div className="min-w-[12rem] flex-1" aria-live="polite">
        {loader.loading ? (
          <p className="inline-flex items-center gap-2" role="status" data-testid="meta-visuals-loading">
            <Spinner /> {visualsLoadingNote(visuals.missing)}
          </p>
        ) : missing ? (
          <p>{visualsNote(visuals.missing)}</p>
        ) : null}
        {loader.error ? (
          <p className="text-red-700" role="alert">
            {loader.error}
          </p>
        ) : null}
        {loader.message && !loader.loading ? (
          <p className="text-green-800" role="status">
            {loader.message}
          </p>
        ) : null}
      </div>
      {missing && !loader.loading ? (
        visuals.remaining === 0 ? (
          <p className="text-ink-500">Quota mensuel de visuels atteint.</p>
        ) : (
          <Button variant="secondary" size="sm" data-testid="meta-visuals-load" onClick={loader.start}>
            Afficher les visuels
          </Button>
        )
      ) : null}
    </div>
  );
}
