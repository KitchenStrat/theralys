import { clsx } from "clsx";
import { Clock, Compass, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "./badge";
import type { SectionKey } from "./sections";

export type NextStepCardProps = {
  /** Surtitre de la carte */
  eyebrow?: string;
  title: ReactNode;
  /** Pourquoi cette étape, en une ou deux phrases */
  children?: ReactNode;
  /** Durée annoncée : « 2 min » */
  duration?: string;
  /** L'action — un seul bouton principal */
  action: ReactNode;
  /** Échappatoire discrète : « Plus tard » */
  secondary?: ReactNode;
  icon?: LucideIcon;
  /** Section concernée par l'étape (couleur du liseré et du surtitre) */
  section?: SectionKey;
  /** Niveau du titre */
  as?: "h2" | "h3";
  className?: string;
};

/**
 * Carte « prochaine étape » : une seule par écran, une seule action. Son
 * liseré en dégradé la distingue des autres cartes ; la durée, en accent
 * chaud, rassure sur l'effort demandé.
 */
export function NextStepCard({
  eyebrow = "Votre prochaine étape",
  title,
  children,
  duration,
  action,
  secondary,
  icon: Icon = Compass,
  section,
  as: Heading = "h2",
  className,
}: NextStepCardProps) {
  return (
    <section
      data-ds-section={section}
      className={clsx("rounded-ds-card p-5 shadow-ds-pop ds-border-gradient sm:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-ds-meta font-semibold text-ds-section-accent">
          <Icon size={16} strokeWidth={2.25} aria-hidden />
          {eyebrow}
        </p>
        {duration ? (
          <Badge tone="sun" icon={Clock}>
            {duration}
          </Badge>
        ) : null}
      </div>
      <Heading className="mt-2.5 font-ds-display text-xl/7 font-bold text-ds-ink-900 text-balance">{title}</Heading>
      {children ? <div className="mt-1.5 text-ds-body text-ds-ink-600">{children}</div> : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        {action}
        {secondary}
      </div>
    </section>
  );
}
