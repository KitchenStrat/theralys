import { clsx } from "clsx";
import { useId } from "react";
import { areaPath, smoothPath, type Point } from "./chart-geometry";

export type SparklineProps = {
  /** Valeurs dans l'ordre chronologique (12 à 30 points donnent le meilleur tracé) */
  data: readonly number[];
  /** Description lue à la place du tracé : « Visites des 14 derniers jours, en hausse » */
  label: string;
  /** Hauteur en pixels */
  height?: number;
  className?: string;
};

/**
 * Mini-courbe de tendance d'une tuile de chiffre : trait de 2 px à la couleur
 * d'accent de la section (≥ 4,5:1 sur blanc), aire en voile dégradé, point
 * final cerclé de blanc. Pas d'axes ni de survol : le chiffre de la tuile est
 * la donnée, la courbe donne l'allure. Elle se révèle de gauche à droite.
 */
export function Sparkline({ data, label, height = 44, className }: SparklineProps) {
  const id = useId();
  const n = data.length;
  if (n < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  // 10 % de marge en haut, 14 % en bas : le trait et son point ne touchent jamais les bords
  const points: Point[] = data.map((value, i) => [(i / (n - 1)) * 100, 10 + (1 - (value - min) / span) * 76]);
  const line = smoothPath(points);
  const last = points[n - 1] ?? [100, 50];

  return (
    <span role="img" aria-label={label} className={clsx("ds-wipe", className)} style={{ height }}>
      <span>
        <span className="relative pr-1.5">
          <span className="relative block h-full">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--ds-s-accent)" stopOpacity="0.24" />
                  <stop offset="1" stopColor="var(--ds-s-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath(line, points)} fill={`url(#${id})`} />
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
            <span
              aria-hidden
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ds-section-accent ring-2 ring-white"
              style={{ left: "100%", top: `${last[1]}%` }}
            />
          </span>
        </span>
      </span>
    </span>
  );
}
