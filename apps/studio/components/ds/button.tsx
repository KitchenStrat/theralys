import { clsx } from "clsx";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./spinner";

/** `ghost` : nom hérité du `Button` partagé, synonyme de `quiet` (l'échange d'import ne casse rien). */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "inverse" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// `max-w-full` et pas de `whitespace-nowrap` : un libellé garde sa ligne tant qu'il tient, et passe à la
// ligne plutôt que de faire déborder la page quand l'écran est trop étroit (320 px, libellés français).
const BASE =
  "group/btn relative isolate inline-flex max-w-full shrink-0 items-center justify-center gap-2 text-center font-semibold select-none ds-press disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-55";

/**
 * 44 px de haut par défaut ; `sm` (36 px) remonte à 44 px sur écran tactile. Le rayon vaut la
 * demi-hauteur : une pilule sur une ligne, un rectangle arrondi si le libellé en prend deux.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-[1.125rem] px-4 py-1.5 text-sm pointer-coarse:min-h-11 pointer-coarse:rounded-[1.375rem]",
  md: "min-h-11 rounded-[1.375rem] px-5 py-2 text-ds-body",
  lg: "min-h-12 rounded-3xl px-6 py-2.5 text-base",
};

const VARIANTS: Record<ButtonVariant, string> = {
  // Dégradé de marque profond : blanc ≥ 4,78:1 sur son point le plus clair
  primary: "bg-ds-brand-gradient text-white shadow-ds-brand-glow ds-focus",
  secondary: "bg-white text-ds-brand-800 inset-ring inset-ring-ds-ink-300 shadow-sm ds-focus",
  // brand-800 : lisible aussi sur un bandeau teinté, décor compris (≥ 4,9:1 mesuré)
  quiet: "text-ds-brand-800 ds-focus",
  ghost: "text-ds-brand-800 ds-focus",
  danger: "bg-ds-danger-600 text-white shadow-sm ds-focus",
  // Sur un bandeau en dégradé : bouton blanc, anneau de focus blanc
  inverse: "bg-white text-ds-brand-900 shadow-ds-card ds-focus-inverse",
};

/** Voile de survol, sous le libellé : seul son `opacity` est animé. */
const HOVER: Record<ButtonVariant, string> = {
  primary: "bg-ds-brand-950/25",
  secondary: "bg-ds-brand-50",
  quiet: "bg-ds-brand-100",
  ghost: "bg-ds-brand-100",
  danger: "bg-ds-danger-900/25",
  inverse: "bg-ds-brand-100",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return clsx(BASE, SIZES[size], VARIANTS[variant], className);
}

function Inner({
  variant,
  icon,
  iconRight,
  children,
}: {
  variant: ButtonVariant;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-ds-fast ease-ds-out group-hover/btn:opacity-100 group-disabled/btn:hidden",
          HOVER[variant],
        )}
      />
      {icon}
      <span>{children}</span>
      {iconRight}
    </>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône à gauche du libellé (un élément, par exemple `<Sparkles size={18} aria-hidden />`) */
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Action en cours : le libellé reste, un indicateur remplace l'icône, le bouton est inactif */
  loading?: boolean;
};

/**
 * Bouton du studio. Comme le `Button` partagé qu'il remplace, il ne fixe pas
 * `type` : dans un formulaire, il soumet (comportement HTML par défaut). Hors
 * formulaire rien ne change ; pour un bouton d'appoint DANS un formulaire
 * (« Annuler », « Ajouter une ligne »), passer `type="button"`.
 */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Inactif : estompé. En cours : pleine opacité, le travail se voit.
      className={buttonClasses(variant, size, clsx(!loading && "disabled:opacity-55", loading && "cursor-progress", className))}
      {...props}
    >
      <Inner variant={variant} icon={loading ? <Spinner className="size-[1.125rem]" /> : icon} iconRight={iconRight}>
        {children}
      </Inner>
    </button>
  );
}

export type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Lien hors du studio : ouvert dans un nouvel onglet */
  external?: boolean;
};

/** Lien qui a l'apparence d'un bouton (navigation interne par `next/link`). */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  external = false,
  className,
  children,
  ...props
}: LinkButtonProps) {
  const inner = (
    <Inner variant={variant} icon={icon} iconRight={iconRight}>
      {children}
    </Inner>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses(variant, size, className)} {...props}>
        {inner}
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {inner}
    </Link>
  );
}
