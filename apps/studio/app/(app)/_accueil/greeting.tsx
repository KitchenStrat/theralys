import { CalendarDays, Minus, TrendingDown, TrendingUp, Waypoints, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ANALYTICS_SOURCE_LABELS, type AnalyticsSource } from "@theralys/shared";
import { GreetingBand, GreetingChip, NBSP, formatDelta, formatNumber } from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import type { Period } from "@/lib/data";
import { periodLabels, type PeriodLabels } from "./periods";

type Props = {
  firstName: string;
  period: Period;
  /** Chiffres de la période, déjà calculés par `getDashboardStats` */
  stats: { visitors: number; rdvClicks: number; visitorsChangePct: number | null };
  /** Première provenance des visites de la période, s'il y en a une de mesurée */
  topSource: AnalyticsSource | null;
  /** Date (ISO yyyy-mm-dd) du prochain contenu du calendrier, quand la « prochaine étape » n'en parle pas déjà */
  nextPublication: string | null;
  /** Le site du praticien est la référence et son code de mesure n'a encore rien envoyé : pas de chiffres à résumer */
  awaitingMeasure: { address: string } | null;
  /** La « prochaine étape » */
  aside?: ReactNode;
};

const strong = (text: string) => <strong className="font-bold">{text}</strong>;

/** La phrase d'état : la période en deux chiffres, sans jargon. */
function Summary({ labels, visitors, rdvClicks }: { labels: PeriodLabels; visitors: number; rdvClicks: number }) {
  const clicks = strong(`${formatNumber(rdvClicks)}${NBSP}fois`);
  if (visitors === 0 && rdvClicks === 0) {
    return <>{labels.lead}, aucune visite n&apos;a été mesurée sur votre site. Vos chiffres apparaîtront ici dès les premières.</>;
  }
  if (visitors === 0) {
    return (
      <>
        {labels.lead}, vos liens de rendez-vous ont été cliqués {clicks}.
      </>
    );
  }
  return (
    <>
      {labels.lead}, {strong(`${formatNumber(visitors)}${NBSP}${visitors > 1 ? "personnes" : "personne"}`)} {visitors > 1 ? "ont" : "a"} visité votre
      site
      {rdvClicks > 0 ? <> et vos liens de rendez-vous ont été cliqués {clicks}</> : null}.
    </>
  );
}

type Chip = { icon: LucideIcon; text: string };

/** Deux repères au plus sous la phrase : la tendance, la première provenance, la prochaine publication. */
function chips({ labels, changePct, topSource, nextPublication }: { labels: PeriodLabels | null; changePct: number | null; topSource: AnalyticsSource | null; nextPublication: string | null }): Chip[] {
  const found: Chip[] = [];
  if (labels && changePct !== null) {
    found.push(
      changePct === 0
        ? { icon: Minus, text: `Visiteurs : stable ${labels.delta}` }
        : { icon: changePct > 0 ? TrendingUp : TrendingDown, text: `Visiteurs : ${formatDelta(changePct)} ${labels.delta}` },
    );
  }
  if (labels && topSource) found.push({ icon: Waypoints, text: `Première provenance : ${ANALYTICS_SOURCE_LABELS[topSource]}` });
  if (nextPublication) found.push({ icon: CalendarDays, text: `Prochain article le ${formatDayFr(nextPublication, "day")}` });
  return found.slice(0, 2);
}

/**
 * Bandeau d'accueil : la date, la salutation (le `h1` de la page), la période
 * résumée en une phrase et, à droite, la prochaine étape. Rien n'y est
 * inventé : chaque chiffre vient des statistiques de la période affichée.
 */
export function Greeting({ firstName, period, stats, topSource, nextPublication, awaitingMeasure, aside }: Props) {
  const labels = periodLabels(period);
  // Jour civil à Paris, comme partout dans le studio
  const today = formatDayFr(new Date().toISOString(), "long");
  const shown = chips({ labels: awaitingMeasure ? null : labels, changePct: stats.visitorsChangePct, topSource, nextPublication });

  return (
    <GreetingBand
      eyebrow={today.charAt(0).toUpperCase() + today.slice(1)}
      title={`Bonjour ${firstName}`}
      aside={aside}
      footer={
        shown.length > 0
          ? shown.map((chip) => (
              <GreetingChip key={chip.text} icon={chip.icon}>
                {chip.text}
              </GreetingChip>
            ))
          : undefined
      }
    >
      {awaitingMeasure ? (
        <>
          Vos outils s&apos;appuient sur votre site <strong className="font-bold wrap-anywhere">{awaitingMeasure.address}</strong>. Il reste à y
          installer le code de mesure pour suivre ses visites ici.
        </>
      ) : (
        <Summary labels={labels} visitors={stats.visitors} rdvClicks={stats.rdvClicks} />
      )}
    </GreetingBand>
  );
}
