"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "clsx";

/**
 * Coût par jour (ou par heure), empilé par fournisseur — barres en CSS, sans
 * bibliothèque. Tous les textes arrivent déjà mis en forme du serveur.
 *
 * Lecture : survol, toucher ou flèches du clavier affichent le détail d'un
 * intervalle ; la légende nomme chaque série ; « Tableau » donne les mêmes
 * chiffres dans un vrai tableau (aucune valeur ne dépend de la couleur).
 */

export type ChartSeries = { key: string; label: string };

export type ChartBucket = {
  key: string;
  /** Libellé court de l'axe (« 3 nov. », « 15 h ») */
  label: string;
  /** Libellé complet (« mardi 3 novembre ») */
  longLabel: string;
  total: number;
  totalText: string;
  /** « 42 appels » */
  callsText: string;
  /** « 42 » */
  callsCountText: string;
  /** Valeur de chaque série, dans l'ordre de `series` */
  values: number[];
  texts: string[];
};

export type ChartTick = { value: number; label: string };

/** Couleur de chaque série : fixée par fournisseur (voir globals.css), jamais par rang. */
const SERIES_COLOR: Record<string, string> = {
  anthropic: "bg-viz-1",
  fal: "bg-viz-2",
  google_places: "bg-viz-3",
  dataforseo: "bg-viz-4",
  scrapecreators: "bg-viz-5",
  ovh: "bg-viz-6",
  autres: "bg-viz-other",
};

const seriesColor = (key: string): string => SERIES_COLOR[key] ?? "bg-viz-other";

/** Hauteur de la zone de tracé (px) — sert aussi à décider des espacements entre segments. */
const PLOT_HEIGHT = 200;
const TOOLTIP_WIDTH = 216;

export function DailyCostChart({
  series,
  buckets,
  ticks,
  top,
  bucketHeading,
  summary,
}: {
  series: ChartSeries[];
  buckets: ChartBucket[];
  ticks: ChartTick[];
  /** Haut de l'échelle (dernière graduation) */
  top: number;
  /** En-tête de la première colonne du tableau : « Jour » ou « Heure » */
  bucketHeading: string;
  /** Phrase de synthèse lue par les lecteurs d'écran */
  summary: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  const plotRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tooltipId = useId();

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => setPlotWidth(plot.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [view]);

  const count = buckets.length;
  // Une étiquette d'axe sur N (dix au plus), une sur deux seulement sur mobile
  const labelStep = Math.max(1, Math.ceil(count / 10));
  const mobileLabelStep = labelStep * 2;
  const gutter = `${Math.max(...ticks.map((tick) => tick.label.length), 3) + 1}ch`;

  const focusColumn = (index: number) => {
    const clamped = Math.min(count - 1, Math.max(0, index));
    columnRefs.current[clamped]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") focusColumn(index + 1);
    else if (event.key === "ArrowLeft") focusColumn(index - 1);
    else if (event.key === "Home") focusColumn(0);
    else if (event.key === "End") focusColumn(count - 1);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const activeBucket = active === null ? null : (buckets[active] ?? null);
  const tooltip = (() => {
    if (active === null || !activeBucket || plotWidth <= 0) return null;
    const width = Math.min(TOOLTIP_WIDTH, plotWidth);
    const columnWidth = plotWidth / count;
    const center = (active + 0.5) * columnWidth;
    const offset = Math.min(columnWidth, 28) / 2 + 8;
    // À côté de la colonne quand la place existe, sinon au-dessus du tracé : jamais sur la barre lue
    if (center + offset + width <= plotWidth) return { width, left: center + offset, above: false };
    if (center - offset - width >= 0) return { width, left: center - offset - width, above: false };
    return { width, left: Math.min(plotWidth - width, Math.max(0, center - width / 2)), above: true };
  })();

  return (
    <figure className="m-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700" aria-label="Légende">
          {series.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span aria-hidden className={clsx("h-2.5 w-2.5 rounded-[3px]", seriesColor(entry.key))} />
              {entry.label}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Affichage" className="flex shrink-0 rounded-full bg-cream-100 p-0.5 text-xs">
          {(["chart", "table"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => {
                setView(mode);
                setActive(null);
              }}
              className={clsx(
                "rounded-full px-3 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                view === mode ? "bg-white text-ink-900 shadow-sm ring-1 ring-cream-300" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {mode === "chart" ? "Graphique" : "Tableau"}
            </button>
          ))}
        </div>
      </div>

      <figcaption className="sr-only">{summary}</figcaption>

      {view === "chart" ? (
        <div className="mt-4">
          <div className="flex pr-4">
            {/* Axe vertical : graduations rondes, en euros */}
            <div aria-hidden className="relative shrink-0 text-[11px] tabular-nums text-ink-500" style={{ width: gutter, height: PLOT_HEIGHT }}>
              {ticks.map((tick) => (
                <span key={tick.value} className="absolute right-2 translate-y-1/2 whitespace-nowrap leading-none" style={{ bottom: `${(tick.value / top) * 100}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>

            <div
              ref={plotRef}
              role="group"
              aria-label={`${summary} Flèches gauche et droite pour parcourir.`}
              className="relative min-w-0 flex-1"
              style={{ height: PLOT_HEIGHT }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setActive(null);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
              }}
            >
              {ticks.map((tick) => (
                <span
                  key={tick.value}
                  aria-hidden
                  className={clsx("absolute inset-x-0 border-t", tick.value === 0 ? "border-ink-300" : "border-cream-200")}
                  style={{ bottom: `${(tick.value / top) * 100}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-stretch">
                {buckets.map((bucket, index) => {
                  const height = top > 0 ? (bucket.total / top) * PLOT_HEIGHT : 0;
                  const segments = bucket.values.map((value, seriesIndex) => ({ value, key: series[seriesIndex]?.key ?? "autres" })).filter((segment) => segment.value > 0);
                  // Séparation de 2 px entre segments, tant que la pile est assez haute pour la porter
                  const gap = height >= segments.length * 6 ? 2 : height >= segments.length * 3 ? 1 : 0;
                  const detail = series.map((entry, seriesIndex) => (bucket.values[seriesIndex] ? `${entry.label} ${bucket.texts[seriesIndex]}` : null)).filter(Boolean);
                  return (
                    <button
                      key={bucket.key}
                      ref={(element) => {
                        columnRefs.current[index] = element;
                      }}
                      type="button"
                      tabIndex={index === (active ?? count - 1) ? 0 : -1}
                      aria-label={`${bucket.longLabel} : ${bucket.totalText}, ${bucket.callsText}${detail.length > 0 ? ` — ${detail.join(", ")}` : ""}`}
                      aria-describedby={active === index ? tooltipId : undefined}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setActive(index);
                      }}
                      onFocus={() => setActive(index)}
                      onClick={() => setActive(index)}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      className={clsx(
                        "group relative flex min-w-0 flex-1 cursor-default items-end justify-center rounded-t-md px-px outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500",
                        active === index ? "bg-primary-50" : "bg-transparent",
                      )}
                    >
                      {bucket.total > 0 ? (
                        <span
                          className="flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-[4px]"
                          style={{ height: Math.max(2, height), gap }}
                        >
                          {/* Parts en pourcentage de la pile : des facteurs dont la somme serait inférieure à 1 ne rempliraient pas la hauteur */}
                          {segments.map((segment) => (
                            <span
                              key={segment.key}
                              className={clsx("block w-full", seriesColor(segment.key))}
                              style={{ flex: `${(segment.value / bucket.total) * 100} 1 0%`, minHeight: 1 }}
                            />
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {tooltip && activeBucket ? (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className={clsx(
                    "pointer-events-none absolute z-10 rounded-xl border border-cream-200 bg-white px-3 py-2 text-left text-xs shadow-pop",
                    tooltip.above ? "bottom-full mb-2" : "top-0",
                  )}
                  style={{ left: tooltip.left, width: tooltip.width }}
                >
                  <p className="text-ink-500 first-letter:uppercase">{activeBucket.longLabel}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink-900">{activeBucket.totalText}</p>
                  <ul className="mt-1.5 space-y-1">
                    {series.map((entry, seriesIndex) =>
                      (activeBucket.values[seriesIndex] ?? 0) > 0 ? (
                        <li key={entry.key} className="flex items-center gap-2">
                          <span aria-hidden className={clsx("h-0.5 w-3 shrink-0 rounded-full", seriesColor(entry.key))} />
                          <span className="min-w-14 text-right font-medium tabular-nums text-ink-900">{activeBucket.texts[seriesIndex]}</span>
                          <span className="min-w-0 truncate text-ink-500">{entry.label}</span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                  <p className="mt-1.5 border-t border-cream-200 pt-1.5 text-ink-500">{activeBucket.callsText}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Axe horizontal : une étiquette sur N, centrée sous sa colonne */}
          <div aria-hidden className="flex pr-4">
            <div className="shrink-0" style={{ width: gutter }} />
            <div className="relative h-6 min-w-0 flex-1 text-[11px] text-ink-500">
              {buckets.map((bucket, index) =>
                index % labelStep === 0 ? (
                  <span
                    key={bucket.key}
                    className={clsx("absolute top-1.5 -translate-x-1/2 whitespace-nowrap leading-none", index % mobileLabelStep === 0 ? "block" : "hidden sm:block")}
                    style={{ left: `${((index + 0.5) / count) * 100}%` }}
                  >
                    {bucket.label}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-cream-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-cream-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {bucketHeading}
                </th>
                {series.map((entry) => (
                  <th key={entry.key} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {entry.label}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Appels
                </th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key} className="border-t border-cream-200">
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-ink-700 first-letter:uppercase">
                    {bucket.longLabel}
                  </th>
                  {series.map((entry, seriesIndex) => (
                    <td key={entry.key} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-ink-700">
                      {bucket.values[seriesIndex] ? bucket.texts[seriesIndex] : "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums text-ink-900">{bucket.totalText}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-ink-500">{bucket.callsCountText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
