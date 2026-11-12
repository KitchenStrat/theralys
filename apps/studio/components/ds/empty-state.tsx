import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SectionKey } from "./sections";

export type EmptyStateProps = {
  icon: LucideIcon;
  /** La cause, dite simplement : « Aucune demande sur mesure pour l'instant » */
  title: ReactNode;
  /** Le bénéfice : ce qui apparaîtra ici et ce que la personne y gagne */
  children: ReactNode;
  /** Une seule action principale */
  action?: ReactNode;
  /** Lien secondaire : « Voir un exemple » */
  secondary?: ReactNode;
  /** `tinted` : encart teinté autonome ; `plain` : à poser dans une carte */
  tone?: "plain" | "tinted";
  section?: SectionKey;
  /** Niveau du titre */
  as?: "h2" | "h3";
  className?: string;
};

/**
 * État vide : il explique pourquoi c'est vide, montre le bénéfice et propose
 * une action. Trois situations, trois messages — « rien encore », « en cours »
 * (préférer `StepProgress`), « rien trouvé » — et jamais pendant un chargement
 * (là, un squelette).
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  secondary,
  tone = "plain",
  section,
  as: Heading = "h3",
  className,
}: EmptyStateProps) {
  return (
    <div
      data-ds-section={section}
      className={clsx(
        "flex flex-col items-center px-5 py-9 text-center sm:px-8 sm:py-11",
        tone === "tinted" && "rounded-ds-card bg-ds-section-soft ring-1 ring-ds-section-line/70",
        className,
      )}
    >
      {/* Vignette : anneaux de teinte, pastille en dégradé, deux points d'accent */}
      <span aria-hidden className="relative grid size-28 place-items-center">
        <span className="absolute inset-0 rounded-full bg-ds-section-tint-2/70" />
        <span className="absolute inset-3.5 rounded-full bg-white ring-1 ring-ds-section-line" />
        <span className="absolute top-1.5 right-3 size-3 rounded-full bg-ds-sun-400" />
        <span className="absolute bottom-3 left-1.5 size-2 rounded-full bg-ds-section-from" />
        <span className="relative grid size-14 place-items-center rounded-ds-md bg-ds-section-gradient text-ds-section-on shadow-ds-glow">
          <Icon size={28} strokeWidth={2} />
        </span>
      </span>
      <Heading className="mt-5 max-w-md font-ds-display text-xl/7 font-bold text-ds-ink-900 text-balance">{title}</Heading>
      <div className="mt-2 max-w-md text-base text-ds-ink-600 text-pretty">{children}</div>
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
