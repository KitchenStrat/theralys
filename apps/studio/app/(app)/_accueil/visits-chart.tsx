"use client";

import { clsx } from "clsx";
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NBSP, formatNumber } from "@/components/ds";
import { areaPath, niceScale, smoothPath, type Point } from "@/components/ds/chart-geometry";

export type VisitsChartDatum = {
  /** Libellé complet du jour (infobulle, tableau) : « jeudi 12 novembre » */
  label: string;
  /** Libellé court de l'axe : « 12 nov. », ou « jeu. » sur une semaine */
  tick: string;
  value: number;
};

type Props = {
  data: readonly VisitsChartDatum[];
  /** Ce que la série compte, au singulier et au pluriel : `["visiteur", "visiteurs"]` */
  unit: readonly [singular: string, plural: string];
  /** Nom de la courbe : « Visiteurs par jour, sur 7 jours » */
  label: string;
  /** Ce qu'elle montre, dit en une phrase à qui ne la voit pas : « 62 au total, 12 au plus haut » */
  summary?: string;
  /** Hauteur de la zone de tracé, en pixels */
  height?: number;
  className?: string;
};

/**
 * Courbe journalière de l'accueil : le dessin, la grille, la révélation de
 * gauche à droite et la lecture (survol, toucher, flèches du clavier, tableau
 * des valeurs) sont ceux de l'`AreaChart` du design system.
 *
 * Composée ici parce que la courbe de l'accueil doit rester un `svg[role=img]`
 * unique et nommé — les parcours automatisés la reconnaissent ainsi — alors
 * que le tracé de l'`AreaChart` est masqué aux lecteurs d'écran, le nom étant
 * porté par sa `<figure>`. Une seule série, à la couleur d'accent de la
 * section englobante. Le curseur de lecture n'est pas décrit par le tableau
 * entier (183 lignes sur six mois) : chaque position dit son jour et sa valeur.
 */
export function VisitsChart({ data, unit, label, summary, height = 220, className }: Props) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;
  if (n < 2) return null;

  const { max, ticks } = niceScale(Math.max(...data.map((d) => d.value)));
  const xOf = (i: number) => (i / (n - 1)) * 100;
  const yOf = (value: number) => (1 - value / max) * 100;
  const points: Point[] = data.map((d, i) => [xOf(i), yOf(d.value)]);
  const line = smoothPath(points);
  const count = (value: number) => `${formatNumber(value)}${NBSP}${value < 2 ? unit[0] : unit[1]}`;
  const describe = (i: number) => {
    const d = data[i];
    return d ? `${d.label} : ${count(d.value)}` : "";
  };

  const lastIndex = n - 1;
  const focusIndex = active ?? lastIndex;
  const shown = data[focusIndex];
  // Sur l'axe : chaque jour tant qu'ils tiennent (une semaine), sinon cinq repères du premier au dernier jour
  const everyDay = n <= 8;
  const axisCount = everyDay ? n : 5;
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
    <div className={clsx("min-w-0", className)}>
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

            <div className="absolute inset-0 ds-wipe">
              <div>
                <div className="relative">
                  <svg
                    role="img"
                    aria-label={summary ? `${label} : ${summary}` : label}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full overflow-visible"
                  >
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

            {/* Repère du jour lu (le dernier au repos) */}
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
                    <span className="block text-base font-semibold ds-tnum">{count(shown.value)}</span>
                    <span className="block text-ds-meta text-ds-ink-200">{shown.label}</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Couche d'interaction : plus large que le trait, lisible au clavier */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={`${label} : parcourir les jours avec les flèches`}
              aria-valuemin={0}
              aria-valuemax={lastIndex}
              aria-valuenow={focusIndex}
              aria-valuetext={describe(focusIndex)}
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
                  // Chaque jour : repères courts, tous centrés sous leur point (écart régulier). Cinq dates : les deux
                  // extrémités s'alignent sur les bords du tracé et, sur mobile, leurs voisines s'effacent pour ne pas les toucher.
                  everyDay || (k > 0 && k < axisCount - 1) ? "-translate-x-1/2" : k === 0 ? "" : "-translate-x-full",
                  !everyDay && (k === 1 || k === 3) && "max-sm:hidden",
                )}
                style={{ left: `${xOf(i)}%` }}
              >
                {data[i]?.tick}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="group/table mt-3">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-ds-meta font-medium text-ds-brand-700 ds-focus pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          <span className="group-open/table:hidden">Voir les chiffres jour par jour</span>
          <span className="hidden group-open/table:inline">Masquer le tableau</span>
        </summary>
        <div
          className="mt-2 max-h-64 overflow-y-auto rounded-ds-sm ring-1 ring-ds-ink-200 ds-focus-inset"
          tabIndex={0}
          role="region"
          aria-label={`${label} : tableau`}
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-ds-ink-50 text-ds-ink-700">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Jour
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
                  <td className="px-3 py-2 text-right text-ds-ink-900 ds-tnum">{formatNumber(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
