"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

type Daily = { day: string; visitors: number; rdvClicks: number };

type Props = {
  firstName: string;
  period: "7j" | "30j" | "6m";
  stats: {
    visitors: number;
    rdvClicks: number;
    visitorsChangePct: number | null;
    rdvClicksChangePct: number | null;
    daily: Daily[];
  };
};

const PERIODS = [
  { key: "7j", label: "7j", caption: "sur 7 jours" },
  { key: "30j", label: "30j", caption: "sur 30 jours" },
  { key: "6m", label: "6m", caption: "sur 6 mois" },
] as const;

export function StatsPanel({ firstName, period, stats }: Props) {
  const [metric, setMetric] = useState<"visitors" | "rdvClicks">("visitors");
  const caption = PERIODS.find((p) => p.key === period)!.caption;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Bonjour {firstName}</h1>
          <div className="flex rounded-full border border-cream-300 p-0.5" role="tablist" aria-label="Période">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                role="tab"
                aria-selected={p.key === period}
                href={p.key === "7j" ? "/" : `/?periode=${p.key}`}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  p.key === period ? "bg-cream-200 text-ink-900" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <StatTile
            label="Visiteurs"
            icon="👥"
            value={stats.visitors}
            changePct={stats.visitorsChangePct}
            caption={caption}
            selected={metric === "visitors"}
            onSelect={() => setMetric("visitors")}
          />
          <StatTile
            label="Clics RDV"
            icon="📅"
            value={stats.rdvClicks}
            changePct={stats.rdvClicksChangePct}
            caption={caption}
            selected={metric === "rdvClicks"}
            onSelect={() => setMetric("rdvClicks")}
          />
        </div>
      </div>

      <div className="mt-6">
        <LineChart
          daily={stats.daily}
          metric={metric}
          label={metric === "visitors" ? "Visiteurs" : "Clics RDV"}
        />
      </div>
    </div>
  );
}

function StatTile({
  label,
  icon,
  value,
  changePct,
  caption,
  selected,
  onSelect,
}: {
  label: string;
  icon: string;
  value: number;
  changePct: number | null;
  caption: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        "rounded-2xl border px-5 py-3.5 text-left transition-colors",
        selected
          ? "border-primary-400 bg-primary-50"
          : "border-cream-300 bg-cream-100 hover:border-ink-300",
      )}
    >
      <p className="flex items-center gap-1.5 text-sm text-ink-700">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <p className="mt-0.5">
        <span className="text-3xl font-bold text-ink-900">{value}</span>
        {changePct !== null ? (
          <span className={clsx("ml-2 text-sm font-semibold", changePct >= 0 ? "text-success-500" : "text-danger-500")}>
            {changePct >= 0 ? "+" : ""}
            {changePct}%
          </span>
        ) : null}
      </p>
      <p className="text-xs text-ink-500">{caption}</p>
    </button>
  );
}

/**
 * Courbe journalière — série unique (la tuile sélectionnée nomme la série),
 * ligne 2px + points, grille discrète, crosshair + tooltip au survol.
 */
function LineChart({ daily, metric, label }: { daily: Daily[]; metric: "visitors" | "rdvClicks"; label: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 220;
  const PAD = { top: 12, right: 12, bottom: 26, left: 30 };

  const { points, yTicks, xLabels, yMax } = useMemo(() => {
    const values = daily.map((d) => d[metric]);
    const rawMax = Math.max(4, ...values);
    const step = niceStep(rawMax / 4);
    const yMax = step * 4;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const points = daily.map((d, i) => ({
      x: PAD.left + (daily.length === 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW),
      y: PAD.top + innerH - (d[metric] / yMax) * innerH,
      value: d[metric],
      day: d.day,
    }));
    const yTicks = [0, 1, 2, 3, 4].map((i) => ({
      value: i * step,
      y: PAD.top + innerH - (i / 4) * innerH,
    }));
    // Libellés x : tous en 7j, sinon échantillonnés
    const every = daily.length <= 8 ? 1 : Math.ceil(daily.length / 8);
    const xLabels = points
      .map((p, i) => ({ x: p.x, text: formatDay(daily[i]!.day, daily.length), index: i }))
      .filter((l) => l.index % every === 0);
    return { points, yTicks, xLabels, yMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, metric]);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${path} L${points[points.length - 1]?.x ?? 0},${H - PAD.bottom} L${points[0]?.x ?? 0},${H - PAD.bottom} Z`;
  const hovered = hover !== null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    for (const [i, p] of points.entries()) {
      const d = Math.abs(p.x - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${label} par jour (max ${yMax})`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--color-ink-300)"
              strokeOpacity="0.4"
              strokeDasharray="2 4"
            />
            <text x={PAD.left - 8} y={tick.y + 3.5} textAnchor="end" fontSize="10" fill="var(--color-ink-500)">
              {tick.value}
            </text>
          </g>
        ))}
        {xLabels.map((l) => (
          <text key={l.x} x={l.x} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-500)">
            {l.text}
          </text>
        ))}

        <path d={area} fill="var(--color-primary-500)" opacity="0.07" />
        <path d={path} fill="none" stroke="var(--color-primary-500)" strokeWidth="2" strokeLinejoin="round" />

        {points.length <= 40
          ? points.map((p, i) => (
              <circle
                key={p.day}
                cx={p.x}
                cy={p.y}
                r={hover === i ? 5 : 4}
                fill="var(--color-cream-50)"
                stroke="var(--color-primary-500)"
                strokeWidth="2"
              />
            ))
          : null}

        {hovered ? (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--color-ink-500)"
            strokeOpacity="0.35"
          />
        ) : null}
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-ink-900 px-3 py-1.5 text-xs text-white shadow-pop"
          style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100 - 18}%` }}
        >
          <span className="font-semibold">{hovered.value}</span> {label.toLowerCase()} ·{" "}
          {formatDayLong(hovered.day)}
        </div>
      ) : null}
    </div>
  );
}

function niceStep(raw: number): number {
  const candidates = [1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000];
  return candidates.find((c) => c >= raw) ?? Math.ceil(raw / 1000) * 1000;
}

function formatDay(iso: string, count: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (count <= 8) {
    const day = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(date);
    return day.charAt(0).toUpperCase() + day.slice(1).replace(".", "");
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date);
}

function formatDayLong(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
