"use client";

import { clsx } from "clsx";
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { areaPath, niceScale, smoothPath, type Point } from "./chart-geometry";
import { NBSP, formatNumber } from "./format";

export type AreaChartDatum = {
  /** Libellé complet du point (infobulle, tableau) : « jeudi 12 novembre » */
  label: string;
  /** Libellé court de l'axe : « 12 nov. » */
  tick?: string;
  value: number;
};

export type AreaChartProps = {
  data: readonly AreaChartDatum[];
  /** Ce que la série mesure, au singulier et au pluriel : `["visite", "visites"]` */
  unit: readonly [singular: string, plural: string];
  /** Nom accessible du graphique : « Visites de votre site sur 30 jours » */
  label: string;
  /** Hauteur de la zone de tracé, en pixels */
  height?: number;
  className?: string;
};

/**
 * Petit graphique en aire, une seule série : trait de 2 px à la couleur
 * d'accent de la section, aire en voile dégradé, grille horizontale discrète.
 *
 * Survol ou toucher : un repère vertical se cale sur le point le plus proche et
 * une infobulle donne la valeur. Au clavier, la zone de tracé est un curseur
 * (flèches, Début, Fin) dont chaque position est annoncée. Toutes les valeurs
 * restent lisibles sans survol, dans le tableau replié sous le graphique.
 */
export function AreaChart({ data, unit, label, height = 220, className }: AreaChartProps) {
  const gradientId = useId();
  const tableId = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;
  if (n < 2) return null;

  const { max, ticks } = niceScale(Math.max(...data.map((d) => d.value)));
  const xOf = (i: number) => (i / (n - 1)) * 100;
  const yOf = (value: number) => (1 - value / max) * 100;
  const points: Point[] = data.map((d, i) => [xOf(i), yOf(d.value)]);
  const line = smoothPath(points);
  const describe = (i: number) => {
    const d = data[i];
    return d ? `${d.label} : ${formatNumber(d.value)}${NBSP}${d.value < 2 ? unit[0] : unit[1]}` : "";
  };

  const focusIndex = active ?? n - 1;
  const shown = data[focusIndex];
  const lastIndex = n - 1;
  // Cinq libellés d'axe au plus, répartis du premier au dernier point
  const axisCount = Math.min(5, n);
  const axis = Array.from({ length: axisCount }, (_, k) => Math.round((k / (axisCount - 1)) * lastIndex));

  function onPointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(ratio * lastIndex));
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const from = active ?? lastIndex;
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? Math.max(0, from - 1)
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? Math.min(lastIndex, from + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  return (
    <figure className={clsx("min-w-0", className)} aria-label={label}>
      <div className="flex gap-3">
        {/* Graduations : chiffres alignés, encre secondaire */}
        <div aria-hidden className="relative w-8 shrink-0 text-right text-xs text-ds-ink-600 ds-tnum" style={{ height }}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${yOf(tick)}%` }}>
              {formatNumber(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {/* Grille : filets pleins, un ton sous la surface */}
            <div aria-hidden className="absolute inset-0">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className={clsx("absolute inset-x-0 h-px", tick === 0 ? "bg-ds-ink-300" : "bg-ds-ink-200")}
                  style={{ top: `${yOf(tick)}%` }}
                />
              ))}
            </div>

            <div className="absolute inset-0 ds-wipe" aria-hidden>
              <div>
                <div className="relative">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--ds-s-accent)" stopOpacity="0.26" />
                        <stop offset="1" stopColor="var(--ds-s-accent)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath(line, points)} fill={`url(#${gradientId})`} />
                    <path
                      d={line}
                      fill="none"
                      stroke="var(--ds-s-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Repère du point lu (dernier point au repos) */}
            {shown ? (
              <>
                {active !== null ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-px -translate-x-1/2 bg-ds-ink-400"
                    style={{ left: `${xOf(focusIndex)}%` }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ds-section-accent ring-2 ring-white"
                  style={{ left: `${xOf(focusIndex)}%`, top: `${yOf(shown.value)}%` }}
                />
                {active !== null ? (
                  <div
                    aria-hidden
                    className={clsx(
                      "pointer-events-none absolute z-10 w-max max-w-56 rounded-ds-sm bg-ds-ink-900 px-3 py-2 text-white shadow-ds-pop",
                      xOf(focusIndex) > 60 ? "-translate-x-full" : "",
                    )}
                    style={{
                      left: `calc(${xOf(focusIndex)}% + ${xOf(focusIndex) > 60 ? "-12px" : "12px"})`,
                      top: `clamp(0px, calc(${yOf(shown.value)}% - 28px), calc(100% - 58px))`,
                    }}
                  >
                    <span className="block text-base font-semibold ds-tnum">
                      {formatNumber(shown.value)} {shown.value < 2 ? unit[0] : unit[1]}
                    </span>
                    <span className="block text-ds-meta text-ds-ink-200">{shown.label}</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Couche d'interaction : plus large que le trait, lisible au clavier */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={`${label} : parcourir les valeurs avec les flèches`}
              aria-valuemin={0}
              aria-valuemax={lastIndex}
              aria-valuenow={focusIndex}
              aria-valuetext={describe(focusIndex)}
              aria-describedby={tableId}
              className="absolute -inset-x-2 inset-y-0 cursor-crosshair touch-pan-y rounded-ds-sm ds-focus"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              onFocus={() => setActive((current) => current ?? lastIndex)}
              onKeyDown={onKey}
            />
          </div>

          <div aria-hidden className="relative mt-2 h-5 text-xs text-ds-ink-600 ds-tnum">
            {axis.map((i, k) => (
              <span
                key={i}
                className={clsx(
                  "absolute whitespace-nowrap",
                  k === 0 ? "" : k === axisCount - 1 ? "-translate-x-full" : "-translate-x-1/2",
                  // Sur mobile, les voisins des deux extrémités s'effacent : les dates ne se touchent jamais
                  axisCount >= 5 && (k === 1 || k === axisCount - 2) && "max-sm:hidden",
                )}
                style={{ left: `${xOf(i)}%` }}
              >
                {data[i]?.tick ?? data[i]?.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="group/table mt-3">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-ds-meta font-medium text-ds-brand-700 ds-focus pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          <span className="group-open/table:hidden">Voir les données en tableau</span>
          <span className="hidden group-open/table:inline">Masquer le tableau</span>
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-ds-sm ring-1 ring-ds-ink-200" tabIndex={0} role="region" aria-label={`${label} : tableau`}>
          <table id={tableId} className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-ds-ink-50 text-ds-ink-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {unit[1].charAt(0).toUpperCase() + unit[1].slice(1)}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-t border-ds-ink-200">
                  <th scope="row" className="px-3 py-2 font-normal text-ds-ink-700">
                    {d.label}
                  </th>
                  <td className="px-3 py-2 text-right ds-tnum text-ds-ink-900">{formatNumber(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
