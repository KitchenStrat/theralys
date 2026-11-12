import { clsx } from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconBadge } from "./icon-badge";
import type { SectionKey } from "./sections";

export type CardVariant = "plain" | "tinted";
export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

const SURFACE: Record<CardVariant, string> = {
  // Carte blanche : ombre douce teintée, liseré à peine visible
  plain: "bg-white shadow-ds-card ring-1 ring-ds-ink-900/5",
  // Carte teintée : la teinte de la section remplace l'ombre (mise en avant sans relief)
  tinted: "bg-ds-section-tint ring-1 ring-ds-section-line/70",
};

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li" | "aside";
  variant?: CardVariant;
  padding?: CardPadding;
  /** Identité de section à poser sur la carte et son contenu */
  section?: SectionKey;
};

/** Carte statique. Elle ne bouge pas au survol : seul `InteractiveCard` se soulève. */
export function Card({ as: Tag = "div", variant = "plain", padding = "md", section, className, ...props }: CardProps) {
  return (
    <Tag
      data-ds-section={section}
      className={clsx("rounded-ds-card", SURFACE[variant], PADDING[padding], className)}
      {...props}
    />
  );
}

// `flex-col justify-start` : dans une grille, une carte étirée garde son contenu en haut (un <button> le centrerait)
const INTERACTIVE =
  "flex w-full flex-col items-stretch justify-start rounded-ds-card bg-white text-left shadow-ds-card ring-1 ring-ds-ink-900/5 ds-lift ds-focus";

type InteractiveCommon = {
  padding?: CardPadding;
  section?: SectionKey;
  className?: string;
  children: ReactNode;
};

export type InteractiveCardProps =
  | (InteractiveCommon & { href: string; external?: boolean; "aria-label"?: string })
  | (InteractiveCommon & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">);

/**
 * Carte entièrement cliquable : lien (`href`) ou bouton. Elle se soulève au
 * survol et s'enfonce à la pression ; l'anneau de focus entoure toute la carte.
 */
export function InteractiveCard(props: InteractiveCardProps) {
  const { padding = "md", section, className, children } = props;
  const classes = clsx(INTERACTIVE, PADDING[padding], className);
  if (props.href !== undefined) {
    const { href, external } = props;
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-ds-section={section}
          aria-label={props["aria-label"]}
          className={classes}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} data-ds-section={section} aria-label={props["aria-label"]} className={classes}>
        {children}
      </Link>
    );
  }
  const { padding: _padding, section: _section, className: _className, children: _children, href: _href, ...rest } = props;
  return (
    <button type="button" data-ds-section={section} className={classes} {...rest}>
      {children}
    </button>
  );
}

export type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Niveau du titre (h2 par défaut) */
  as?: "h2" | "h3";
  /** Action ou filtre, en haut à droite */
  action?: ReactNode;
  className?: string;
};

/** En-tête de carte : pastille d'icône, titre, phrase d'explication, action à droite. */
export function CardHeader({ title, description, icon, as: Heading = "h2", action, className }: CardHeaderProps) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 flex-[1_1_15rem] items-start gap-3.5">
        {icon ? <IconBadge icon={icon} tone="soft" size="md" /> : null}
        <div className="min-w-0">
          <Heading className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">{title}</Heading>
          {description ? <p className="mt-0.5 text-ds-body text-ds-ink-600">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
