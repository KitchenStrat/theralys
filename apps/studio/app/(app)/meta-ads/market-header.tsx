"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import { marketScopeNote, type MetaAdsMarket, type MetaAdsSeed, type MetaMarketScope } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { MetaVisualsView } from "@/lib/meta-ads/data";
import { dismissedNote, filteredNote, scopeCounters, visualsNote } from "@/lib/meta-ads/market-view";
import { loadMarketVisuals } from "./actions";
import { Icon } from "./market-icons";

/** Lieu d'une zone (« Albi », « Tarn ») ; null pour les autres zones et la France, que le libellé dit déjà. */
function zoneName(scope: MetaMarketScope, seed: MetaAdsSeed): string | null {
  if (scope === "ville") return seed.city || "ville";
  if (scope === "departement") return seed.department?.name ?? "département";
  if (scope === "region") return seed.region ?? "région";
  return null;
}

/**
 * En-tête de la veille : zone retenue, source et date du relevé, compteurs
 * par zone, annonces écartées (d'office ou par le praticien) et rappel de ce
 * qu'est le signal.
 */
export function MarketHeader({ market, seed, dismissed }: { market: MetaAdsMarket; seed: MetaAdsSeed; /** Annonces supprimées par le praticien (analyse et veille courante) */ dismissed: number }) {
  const counters = useMemo(() => scopeCounters(market), [market]);
  const active = market.ads.filter((a) => a.active).length;
  const strong = market.ads.filter((a) => a.signal === "fort").length;
  const filtered = filteredNote(market.filtered);
  const removed = dismissedNote(dismissed);

  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div>
          <h2 className="text-xl font-semibold">Les annonces des praticiens autour de vous</h2>
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
        <strong className="text-ink-900">Le signal</strong> : personne ne paie longtemps une annonce qui ne marche pas. Une annonce diffusée depuis plus de 30 jours avec une large
        portée européenne est un signal fort. Les visuels sont affichés pour vous inspirer : reprenez l&apos;idée, jamais l&apos;image ni le texte d&apos;un confrère.
      </p>
    </Card>
  );
}

/**
 * Visuels manquants (veille antérieure aux visuels, recherche interrompue) :
 * bandeau discret et bouton qui les charge, dans la limite du quota mensuel.
 */
export function VisualsBanner({ visuals, available }: { visuals: MetaVisualsView; /** Bibliothèque activée (les visuels en dépendent) */ available: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const missing = visuals.provider && visuals.missing > 0 && available;

  if (!missing && !result.message && !result.error) return null;

  function load() {
    setResult({});
    startTransition(async () => {
      const outcome = await loadMarketVisuals();
      if (outcome.error) {
        setResult({ error: outcome.error });
        return;
      }
      setResult({ message: outcome.message ?? "Visuels affichés." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-ink-700">
      <Icon name="image" className="h-5 w-5 shrink-0 text-primary-600" />
      <div className="min-w-[12rem] flex-1" aria-live="polite">
        {missing ? <p>{visualsNote(visuals.missing)}</p> : null}
        {result.error ? (
          <p className="text-danger-500" role="alert">
            {result.error}
          </p>
        ) : null}
        {result.message ? (
          <p className="text-success-500" role="status">
            {result.message}
          </p>
        ) : null}
      </div>
      {missing ? (
        visuals.remaining === 0 ? (
          <p className="text-ink-500">Quota mensuel de visuels atteint.</p>
        ) : (
          <Button variant="secondary" size="sm" data-testid="meta-visuals-load" onClick={load} disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Chargement…
              </>
            ) : (
              "Afficher les visuels"
            )}
          </Button>
        )
      ) : null}
    </div>
  );
}
