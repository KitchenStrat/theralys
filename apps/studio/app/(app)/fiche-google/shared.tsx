import { clsx } from "clsx";
import { Minus, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber, Badge, Spinner, formatDelta } from "@/components/ds";

/**
 * Petites pièces communes aux onglets de la section « Fiche Google » : elles
 * assemblent des éléments du design system (aucun style propre au-delà).
 */

/** Champ de recherche de la fiche à relier (écran d'accueil de la section). */
export const LINK_QUERY_ID = "google-link-query";

/** Depuis un état vide : ramène à l'action de l'écran d'accueil, le champ de recherche de la fiche. */
export function focusLinkSearch() {
  document.getElementById(LINK_QUERY_ID)?.focus();
}

/** Erreur d'une action, annoncée aux lecteurs d'écran : une icône et le message, jamais la couleur seule. */
export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={clsx("flex items-start gap-2 text-ds-body font-medium text-ds-danger-700", className)}>
      <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Attente courte (quelques secondes) : l'indicateur et ce qui est en train de se faire. */
export function WaitNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p aria-live="polite" className={clsx("flex items-start gap-2.5 text-ds-body text-ds-ink-700", className)}>
      <Spinner className="mt-0.5 size-5 text-ds-section-accent" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export type StatDelta = {
  /** Variation signée */
  value: number;
  /** Unité, au singulier et au pluriel : `["point", "points"]` */
  unit: readonly [string, string];
  /** Par rapport à quoi : « depuis le relevé du 10 oct. » */
  label: string;
};

/**
 * Chiffre expliqué, à poser dans une liste `<dl>` : libellé, valeur qui roule
 * jusqu'à son nombre, variation éventuelle, et une phrase qui dit comment le
 * lire. Même anatomie que `KpiTile`, avec l'explication en plus et une valeur
 * qui peut manquer (« — »).
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  format,
  suffix,
  hint,
  delta,
  className,
}: {
  icon: LucideIcon;
  label: string;
  /** `null` : valeur inconnue */
  value: number | null;
  format?: Intl.NumberFormatOptions;
  suffix?: string;
  hint?: ReactNode;
  delta?: StatDelta | null;
  className?: string;
}) {
  const up = delta ? delta.value > 0 : false;
  const flat = delta ? delta.value === 0 : false;
  return (
    <div className={clsx("min-w-0 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/60", className)}>
      <dt className="flex items-center gap-2 text-ds-meta font-semibold text-ds-section-ink">
        <Icon size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
        {label}
      </dt>
      <dd className="mt-1.5 font-ds-display text-[1.75rem]/9 font-bold text-ds-ink-900">
        {value === null ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">non disponible</span>
          </>
        ) : (
          <AnimatedNumber value={value} format={format} suffix={suffix} />
        )}
      </dd>
      {delta ? (
        <dd className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-meta text-ds-ink-600">
          <Badge tone={flat ? "neutral" : up ? "success" : "danger"} icon={flat ? Minus : up ? TrendingUp : TrendingDown}>
            {formatDelta(delta.value, Math.abs(delta.value) < 2 ? delta.unit[0] : delta.unit[1])}
          </Badge>
          <span>{delta.label}</span>
        </dd>
      ) : null}
      {hint ? <dd className="mt-1.5 text-ds-meta text-ds-ink-600 text-pretty">{hint}</dd> : null}
    </div>
  );
}
