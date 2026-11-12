import { clsx } from "clsx";
import { Check, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { AnimatedNumber, Badge, IconBadge, Sparkline, formatDelta, formatNumber, type SectionKey } from "@/components/ds";

type Props = {
  /** Libellé court : « Visiteurs » */
  label: string;
  value: number;
  icon: LucideIcon;
  /** Identité de la tuile : pastille, voile, liseré de sélection, mini-courbe */
  section: SectionKey;
  /** Variation en % par rapport à la période précédente ; `null` : rien à comparer */
  changePct: number | null;
  /** Après la variation : « en 7 jours » */
  deltaLabel: string;
  /** La période de comparaison, en entier : « les 7 jours précédents » */
  previous: string;
  /** Après le chiffre quand il n'y a pas de variation : « sur 6 mois » */
  caption: string;
  /** Valeurs jour par jour de la période (mini-courbe) */
  trend: readonly number[];
  /** Cette tuile est celle que trace la courbe */
  selected: boolean;
  onSelect: () => void;
  /** `id` du bloc que la tuile commande (la carte de la courbe) */
  controls: string;
  /** `id` de la phrase qui dit à quoi sert le choix */
  describedBy: string;
};

/** Ce que dit le bouton : le libellé, la valeur, puis la comparaison en toutes lettres. */
function spokenLabel({ label, value, changePct, previous, caption }: Pick<Props, "label" | "value" | "changePct" | "previous" | "caption">): string {
  const head = `${label} ${value}`;
  if (changePct === null) return `${head} ${caption}`;
  if (changePct === 0) return `${head}, autant que ${previous}`;
  return `${head}, ${formatNumber(Math.abs(changePct))} % de ${changePct > 0 ? "plus" : "moins"} que ${previous}`;
}

/**
 * Tuile de chiffre clé qui choisit la série tracée par la courbe : l'anatomie
 * de la `KpiTile` du design system (pastille, libellé, valeur qui roule,
 * variation signée, mini-courbe), mais en bouton à bascule — ce que `KpiTile`
 * (carte statique ou lien) ne sait pas être.
 *
 * Le bouton couvre toute la tuile et porte son texte en clair, « Visiteurs 62,
 * 2 % de moins que les 7 jours précédents » : c'est ce que lisent les lecteurs
 * d'écran et les parcours automatisés (`button[aria-pressed]`). Le dessin, lui,
 * est décoratif : les bandes de chiffres du compteur animé n'entrent pas dans
 * le texte du bouton. L'état se lit sans la couleur : coche et mention « Sur la
 * courbe », en plus du liseré.
 */
export function MetricTile({ label, value, icon, section, changePct, deltaLabel, previous, caption, trend, selected, onSelect, controls, describedBy }: Props) {
  const up = changePct !== null && changePct > 0;
  const state = (
    <>
      <span
        className={clsx(
          "grid size-5 shrink-0 place-items-center rounded-full",
          selected ? "bg-ds-section-gradient-deep text-ds-section-on-deep" : "bg-white inset-ring-2 inset-ring-ds-ink-450",
        )}
      >
        {selected ? <Check size={12} strokeWidth={3.5} /> : null}
      </span>
      {selected ? "Sur la courbe" : "Voir la courbe"}
    </>
  );
  const stateTone = selected ? "font-semibold text-ds-section-ink" : "font-medium text-ds-ink-600";

  return (
    <div
      data-ds-section={section}
      className={clsx(
        "@container/kpi relative flex flex-col rounded-ds-card bg-white bg-linear-to-b to-white to-55% p-4 shadow-ds-card sm:p-6",
        selected ? "from-ds-section-tint-2 ring-2 ring-ds-section-accent" : "from-ds-section-tint ring-1 ring-ds-ink-900/5 ds-lift",
      )}
    >
      <div aria-hidden className="flex grow flex-col">
        <div className="flex items-start justify-between gap-3">
          <IconBadge icon={icon} size="md" />
          {/* Tuile large : l'état en haut à droite */}
          <span className={clsx("inline-flex min-h-7 items-center gap-1.5 text-ds-meta @max-[15rem]/kpi:hidden", stateTone)}>{state}</span>
        </div>
        {/* Tuile large (deux par rangée sur ordinateur) : la mini-courbe se range à droite du chiffre */}
        <div className="mt-3.5 flex grow flex-col @min-[24rem]/kpi:flex-row @min-[24rem]/kpi:items-end @min-[24rem]/kpi:gap-8">
          <div className="min-w-0 shrink-0">
            <p className="text-ds-body font-semibold text-ds-ink-800">{label}</p>
            {/* Tuile étroite : le chiffre se resserre, et encore d'un cran à partir de six chiffres (il ne passe pas à la ligne) */}
            <p className={clsx("mt-1 text-ds-kpi font-bold text-ds-ink-900", value >= 100_000 ? "@max-[15rem]/kpi:text-[1.375rem]" : "@max-[15rem]/kpi:text-[1.75rem]")}>
              <AnimatedNumber value={value} />
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-meta text-ds-ink-600">
              {changePct === null ? (
                <span>Pas encore de comparaison</span>
              ) : (
                <>
                  <Badge tone={changePct === 0 ? "neutral" : up ? "success" : "danger"} icon={changePct === 0 ? Minus : up ? TrendingUp : TrendingDown}>
                    {formatDelta(changePct)}
                  </Badge>
                  <span>{deltaLabel}</span>
                </>
              )}
            </p>
          </div>
          <Sparkline
            data={trend}
            label={`${label} jour par jour`}
            height={56}
            className="mt-4 @max-[15rem]/kpi:hidden @min-[24rem]/kpi:mt-0 @min-[24rem]/kpi:min-w-0 @min-[24rem]/kpi:flex-1"
          />
        </div>
        {/* Tuile étroite (deux par rangée sur mobile) : l'état en pied, toujours écrit */}
        <span className={clsx("hidden items-center gap-1.5 pt-3 text-ds-meta @max-[15rem]/kpi:inline-flex", stateTone)}>{state}</span>
      </div>
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={controls}
        aria-describedby={describedBy}
        onClick={onSelect}
        className={clsx("absolute inset-0 rounded-ds-card ds-focus", selected ? "" : "cursor-pointer")}
      >
        <span className="sr-only">{spokenLabel({ label, value, changePct, previous, caption })}</span>
      </button>
    </div>
  );
}
