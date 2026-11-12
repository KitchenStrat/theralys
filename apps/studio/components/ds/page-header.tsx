import { clsx } from "clsx";
import type { ReactNode } from "react";
import { SECTIONS, type SectionKey } from "./sections";

export type PageHeaderProps = {
  /** La section de la page : icône, dégradé, teintes, titre et phrase par défaut */
  section: SectionKey;
  /** Titre de la page (par défaut, le nom de la section) */
  title?: ReactNode;
  /** À quoi sert la page, en une phrase (par défaut, celle du registre) */
  purpose?: ReactNode;
  /** L'action principale de la page — un seul bouton `primary` */
  action?: ReactNode;
  /** Action d'appoint (bouton `secondary` ou `quiet`) */
  secondary?: ReactNode;
  /** Rangée d'appoint sous le titre : navigation de mois, filtres */
  children?: ReactNode;
  /**
   * `soft` (défaut) : bandeau en teinte douce, texte foncé, pastille en dégradé.
   * `vivid` : bandeau en dégradé profond, texte blanc — une page par parcours, pas plus.
   */
  tone?: "soft" | "vivid";
  /** Étend l'identité de la section à toute la coquille (halos du fond). À couper pour un en-tête de démonstration. */
  ambient?: boolean;
  /** Niveau du titre : `h1` sur une page (défaut) ; `h2` ou `h3` pour un en-tête reproduit ailleurs */
  as?: "h1" | "h2" | "h3";
  className?: string;
};

/**
 * En-tête de page commun : pastille de la section, titre (le seul `h1` de la
 * page), phrase d'usage, action principale. Il pose `data-ds-section` : tout
 * ce qui suit dans la page hérite de l'identité de la section.
 */
export function PageHeader({
  section,
  title,
  purpose,
  action,
  secondary,
  children,
  tone = "soft",
  ambient = true,
  as: Heading = "h1",
  className,
}: PageHeaderProps) {
  const def = SECTIONS[section];
  const Icon = def.icon;
  const vivid = tone === "vivid";
  return (
    <header
      data-ds-section={section}
      data-ds-ambient={ambient ? "" : undefined}
      className={clsx(
        "relative isolate overflow-hidden rounded-ds-band p-5 sm:p-7",
        vivid
          ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-card"
          : "bg-ds-section-soft ring-1 ring-ds-section-line/70",
        className,
      )}
    >
      <span aria-hidden className={clsx("-z-10", vivid && !def.lightGradient ? "ds-band-art-deep" : "ds-band-art")} />
      {/* L'action passe sous le titre d'elle-même quand la place manque : aucun point de rupture */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_24rem] items-start gap-4">
          <span
            aria-hidden
            className={clsx(
              "grid size-14 shrink-0 place-items-center rounded-ds-md",
              vivid
                ? "bg-white text-ds-section-accent shadow-ds-card"
                : "bg-ds-section-gradient text-ds-section-on shadow-ds-glow",
            )}
          >
            <Icon size={28} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <Heading
              className={clsx(
                "font-ds-display text-ds-title font-bold text-balance sm:text-[2rem]/10",
                vivid ? "" : "text-ds-section-ink",
              )}
            >
              {title ?? def.label}
            </Heading>
            <p className={clsx("mt-1 max-w-[62ch] text-base text-pretty", vivid ? "" : "text-ds-ink-700")}>
              {purpose ?? def.purpose}
            </p>
          </div>
        </div>
        {action || secondary ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
            {secondary}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
