"use client";

import { CalendarCheck, ChartLine, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, NBSP, Tabs, formatNumber, type SectionKey } from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import type { Period } from "@/lib/data";
import { AwaitingMeasure } from "./_accueil/awaiting-measure";
import { MetricTile } from "./_accueil/metric-tile";
import { PERIODS, periodLabels } from "./_accueil/periods";
import { SourcesCard, type SourcesSummary } from "./_accueil/sources-card";
import { VisitsChart } from "./_accueil/visits-chart";

type Daily = { day: string; visitors: number; rdvClicks: number };
type Metric = "visitors" | "rdvClicks";

type Props = {
  period: Period;
  stats: {
    visitors: number;
    rdvClicks: number;
    visitorsChangePct: number | null;
    rdvClicksChangePct: number | null;
    daily: Daily[];
  };
  /** Provenance des visites de la période (sources renseignées seulement) */
  sources: SourcesSummary;
  /** Le site a accès à la section Réseaux sociaux (lien de bio disponible) */
  socialAccess: boolean;
  /**
   * Le site du praticien est la référence des outils et son code de mesure
   * n'a encore envoyé aucune visite : à la place de courbes vides, l'état
   * vide dit pourquoi et mène à l'installation. `address` : son adresse.
   */
  awaitingMeasure?: { address: string } | null;
};

/** Les deux chiffres de l'accueil : chacun sa couleur, celle que prend aussi la courbe quand il est choisi. */
const METRICS: Record<
  Metric,
  { label: string; icon: LucideIcon; section: SectionKey; unit: readonly [string, string]; chartTitle: string; none: string }
> = {
  visitors: {
    label: "Visiteurs",
    icon: Users,
    section: "mon-site",
    unit: ["visiteur", "visiteurs"],
    chartTitle: "Visiteurs par jour",
    none: "Aucun visiteur mesuré sur cette période pour l'instant.",
  },
  rdvClicks: {
    label: "Clics RDV",
    icon: CalendarCheck,
    section: "accueil",
    unit: ["clic", "clics"],
    chartTitle: "Clics de rendez-vous par jour",
    none: "Aucun clic sur vos liens de rendez-vous sur cette période pour l'instant.",
  },
};

const METRIC_ORDER: readonly Metric[] = ["visitors", "rdvClicks"];

const CHART_ID = "courbe-accueil";
const HINT_ID = "chiffres-aide";

const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
/** Repère de l'axe : le jour de la semaine sur 7 jours (« jeu. »), la date au-delà (« 12 nov. »). */
const tickOf = (day: string, period: Period) => (period === "7j" ? WEEKDAY.format(new Date(`${day}T00:00:00Z`)) : formatDayFr(day, "short"));

/**
 * Les chiffres clés de l'accueil : sélecteur de période (des liens, la période
 * vit dans l'adresse), deux tuiles qui choisissent la série tracée, la courbe
 * jour par jour et la provenance des visites.
 *
 * À poser dans la grille à deux colonnes de la page : le titre et les tuiles
 * prennent toute la largeur, la courbe et la provenance la colonne de gauche ;
 * ce qui suit dans la grille (mise en route, site, publications) vient à
 * droite. Le panneau de la période est en `display: contents` pour que ses
 * blocs soient eux-mêmes des cellules de cette grille.
 */
export function StatsPanel({ period, stats, sources, socialAccess, awaitingMeasure = null }: Props) {
  const [metric, setMetric] = useState<Metric>("visitors");

  if (awaitingMeasure) return <AwaitingMeasure address={awaitingMeasure.address} />;

  const labels = periodLabels(period);
  const chosen = METRICS[metric];
  const total = stats[metric];
  const peak = Math.max(0, ...stats.daily.map((day) => day[metric]));
  const count = (value: number) => `${formatNumber(value)}${NBSP}${value > 1 ? chosen.unit[1] : chosen.unit[0]}`;

  return (
    <>
      {/* `-mb-2` : le titre se tient plus près de ses tuiles que les blocs entre eux */}
      <div className="-mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 xl:col-span-2">
        <h2 id="chiffres-title" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
          Vos chiffres clés
        </h2>
        <Tabs
          variant="pill"
          idBase="periode"
          label="Période"
          value={period}
          tabs={PERIODS.map((entry) => ({ id: entry.key, label: entry.tab, href: entry.href }))}
        />
      </div>

      <div id={`periode-panel-${period}`} role="tabpanel" aria-labelledby={`periode-tab-${period}`} className="contents">
        <div className="min-w-0 xl:col-span-2">
          <p id={HINT_ID} className="sr-only">
            Choisissez le chiffre que trace la courbe.
          </p>
          <div role="group" aria-labelledby="chiffres-title" className="grid grid-cols-2 gap-3 sm:gap-4">
            {METRIC_ORDER.map((key) => {
              const def = METRICS[key];
              return (
                <MetricTile
                  key={key}
                  label={def.label}
                  value={stats[key]}
                  icon={def.icon}
                  section={def.section}
                  changePct={key === "visitors" ? stats.visitorsChangePct : stats.rdvClicksChangePct}
                  deltaLabel={labels.delta}
                  previous={labels.previous}
                  caption={labels.caption}
                  trend={stats.daily.map((day) => day[key])}
                  selected={metric === key}
                  onSelect={() => setMetric(key)}
                  controls={CHART_ID}
                  describedBy={HINT_ID}
                />
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <Card id={CHART_ID} section={chosen.section}>
            <CardHeader as="h3" icon={ChartLine} title={chosen.chartTitle} description={total > 0 ? `${count(total)} ${labels.caption}` : chosen.none} />
            <VisitsChart
              // La courbe se révèle à nouveau quand la série ou la période change
              key={`${period}-${metric}`}
              className="mt-6"
              data={stats.daily.map((day) => ({ label: formatDayFr(day.day, "long"), tick: tickOf(day.day, period), value: day[metric] }))}
              unit={chosen.unit}
              label={`${chosen.chartTitle}, ${labels.caption}`}
              summary={`${formatNumber(total)} au total, ${formatNumber(peak)} au plus haut`}
            />
          </Card>

          <SourcesCard sources={sources} caption={labels.caption} socialAccess={socialAccess} />
        </div>
      </div>
      {/* Panneaux des autres périodes : vides et masqués. Leurs onglets sont des liens (la page est relue), mais chacun désigne ainsi un panneau qui existe. */}
      {PERIODS.filter((entry) => entry.key !== period).map((entry) => (
        <div key={entry.key} id={`periode-panel-${entry.key}`} role="tabpanel" aria-labelledby={`periode-tab-${entry.key}`} hidden />
      ))}
    </>
  );
}
