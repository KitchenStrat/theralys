import { clsx } from "clsx";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "./animated-number";
import { Badge, type BadgeTone } from "./badge";
import { Card, InteractiveCard } from "./card";
import { formatDelta } from "./format";
import { IconBadge } from "./icon-badge";
import type { SectionKey } from "./sections";
import { Sparkline } from "./sparkline";

export type KpiDelta = {
  /** Variation signée : 12 pour « +12 % » */
  value: number;
  /** Unité de la variation (« % » par défaut ; chaîne vide pour un nombre brut) */
  unit?: string;
  /** Période de comparaison, toujours nommée et courte : « en 7 jours », « ce mois-ci » */
  label: string;
  /** Sens favorable : une baisse peut être une bonne nouvelle (coût par clic) */
  goodWhen?: "up" | "down";
};

export type KpiTileProps = {
  /** Libellé court (une ligne, 26 caractères au plus) */
  label: string;
  value: number;
  /** Options `Intl.NumberFormat` (fr-FR) de la valeur */
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  /** Période ou précision, sous le libellé : « 7 derniers jours » */
  caption?: string;
  icon: LucideIcon;
  /** Identité de la tuile (pastille, liseré, courbe) */
  section?: SectionKey;
  delta?: KpiDelta;
  /** Valeurs de la mini-courbe, dans l'ordre chronologique */
  trend?: readonly number[];
  /** Description de la mini-courbe pour les lecteurs d'écran */
  trendLabel?: string;
  /** Rend la tuile cliquable (elle se soulève au survol) */
  href?: string;
  className?: string;
};

const PAD = "p-4 sm:p-6";

function deltaTone(delta: KpiDelta): { tone: BadgeTone; icon: LucideIcon } {
  if (delta.value === 0) return { tone: "neutral", icon: Minus };
  const up = delta.value > 0;
  const good = (delta.goodWhen ?? "up") === "up" ? up : !up;
  return { tone: good ? "success" : "danger", icon: up ? TrendingUp : TrendingDown };
}

/**
 * Tuile de chiffre clé, à l'anatomie fixe : pastille et libellé, valeur,
 * variation (flèche, signe, période de comparaison), mini-courbe facultative.
 * La variation se lit sans la couleur ; la valeur roule une fois à l'arrivée.
 */
export function KpiTile({
  label,
  value,
  format,
  prefix,
  suffix,
  caption,
  icon,
  section,
  delta,
  trend,
  trendLabel,
  href,
  className,
}: KpiTileProps) {
  const tone = delta ? deltaTone(delta) : null;
  const body = (
    <>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
        <IconBadge icon={icon} size="md" />
        {/* Tuile étroite (deux par rangée sur mobile) : le libellé passe sur deux lignes, la précision s'efface */}
        <h3 className="col-span-2 row-start-2 mt-3.5 truncate text-ds-body font-semibold text-ds-ink-800 @max-[13rem]/kpi:line-clamp-2 @max-[13rem]/kpi:min-h-12 @max-[13rem]/kpi:whitespace-normal">
          {label}
        </h3>
        {caption ? (
          <p className="col-start-2 row-start-1 justify-self-end text-right text-ds-meta text-ds-ink-600 text-balance @max-[13rem]/kpi:hidden">
            {caption}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-ds-kpi font-bold text-ds-ink-900 @max-[13rem]/kpi:text-[1.75rem]">
        <AnimatedNumber value={value} format={format} prefix={prefix} suffix={suffix} />
      </p>
      {delta && tone ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-meta text-ds-ink-600">
          <Badge tone={tone.tone} icon={tone.icon}>
            {formatDelta(delta.value, delta.unit ?? "%")}
          </Badge>
          <span>{delta.label}</span>
        </p>
      ) : null}
      {trend && trend.length > 1 ? (
        <Sparkline data={trend} label={trendLabel ?? `Évolution : ${label}`} className="mt-4" />
      ) : null}
    </>
  );
  // Voile de la teinte de section en tête de tuile : l'accent de couleur, sans quitter le blanc
  const classes = clsx("@container/kpi relative bg-linear-to-b from-ds-section-tint to-white to-55%", className);
  return href ? (
    <InteractiveCard href={href} section={section} padding="none" className={clsx(PAD, classes)}>
      {body}
    </InteractiveCard>
  ) : (
    <Card as="article" section={section} padding="none" className={clsx(PAD, classes)}>
      {body}
    </Card>
  );
}
