import { clsx } from "clsx";
import { useId, type CSSProperties, type ReactNode } from "react";
import type { SectionKey } from "./sections";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export type ProgressBarProps = {
  value: number;
  max?: number;
  /** Libellé visible au-dessus de la barre (sinon fournir `ariaLabel`) */
  label?: ReactNode;
  ariaLabel?: string;
  /** Texte de la valeur, à droite du libellé et lu par les lecteurs d'écran : « 6 sur 8 » */
  valueText?: string;
  /** Garde `valueText` pour les lecteurs d'écran sans l'afficher (le libellé le dit déjà) */
  hideValueText?: boolean;
  /** Travail en cours : un reflet parcourt la jauge */
  busy?: boolean;
  size?: "sm" | "md";
  section?: SectionKey;
  className?: string;
};

/**
 * Barre de progression : jauge en dégradé de la section sur une piste de la
 * même teinte. La jauge est translatée (jamais redimensionnée) et se remplit à
 * l'arrivée ; toujours doublée d'un texte.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  ariaLabel,
  valueText,
  hideValueText = false,
  busy = false,
  size = "md",
  section,
  className,
}: ProgressBarProps) {
  const labelId = useId();
  const shownValue = hideValueText ? undefined : valueText;
  return (
    <div data-ds-section={section} className={className}>
      {label || shownValue ? (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-ds-body">
          {label ? (
            <span id={labelId} className="font-medium text-ds-ink-800">
              {label}
            </span>
          ) : (
            <span />
          )}
          {/* Sur écran étroit, la valeur passe sous le libellé plutôt que de déborder */}
          {shownValue ? <span className="text-ds-ink-600">{shownValue}</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(max, Math.max(0, value))}
        aria-valuetext={valueText}
        className={clsx("ds-progress", busy && "ds-progress-busy", size === "sm" ? "h-1.5" : "h-2.5")}
        style={{ "--ds-p": clamp01(value / max) } as CSSProperties}
      >
        <span className="ds-progress-fill" />
      </div>
    </div>
  );
}

export type ProgressRingProps = {
  value: number;
  max?: number;
  /** Nom accessible : « Mise en route » */
  label: string;
  /** Texte de la valeur pour les lecteurs d'écran : « 3 étapes sur 5 » */
  valueText?: string;
  /** Diamètre et épaisseur, en pixels */
  size?: number;
  thickness?: number;
  /** Contenu du centre (le chiffre, toujours affiché) */
  children?: ReactNode;
  section?: SectionKey;
  className?: string;
};

const SWEEP_MS = 700;

/**
 * Anneau de progression : un anneau en dégradé que deux caches découvrent en
 * tournant (rotation seule, donc sans repeinture). L'arc part de midi, dans le
 * sens des aiguilles ; le centre porte toujours le chiffre.
 */
export function ProgressRing({
  value,
  max = 100,
  label,
  valueText,
  size = 64,
  thickness = 7,
  children,
  section,
  className,
}: ProgressRingProps) {
  const p = clamp01(value / max);
  // Les deux demi-tours s'enchaînent à vitesse constante
  const t1 = p > 0 ? Math.round((SWEEP_MS * Math.min(p, 0.5)) / p) : 0;
  const t2 = p > 0.5 ? SWEEP_MS - t1 : 0;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      aria-valuetext={valueText}
      data-ds-section={section}
      className={clsx("ds-ring", className)}
      style={
        {
          "--ds-p": p,
          "--ds-ring-size": `${size}px`,
          "--ds-ring-w": `${thickness}px`,
          "--ds-ring-t1": `${t1}ms`,
          "--ds-ring-t2": `${t2}ms`,
        } as CSSProperties
      }
    >
      <span className="ds-ring-disc" aria-hidden>
        <span className="ds-ring-fill" />
        <span className="ds-ring-half ds-ring-half-r">
          <span className="ds-ring-cover" />
        </span>
        <span className="ds-ring-half ds-ring-half-l">
          <span className="ds-ring-cover" />
        </span>
        {p > 0 ? (
          <>
            <span className="ds-ring-cap" />
            <span className="ds-ring-cap ds-ring-cap-end" />
          </>
        ) : null}
      </span>
      <span className="relative text-center leading-none">{children}</span>
    </span>
  );
}
