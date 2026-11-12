import { clsx } from "clsx";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "group/btn relative isolate inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none ds-press disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55";

/** 44 px de haut par défaut ; `sm` (36 px) remonte à 44 px sur écran tactile. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 text-sm pointer-coarse:min-h-11",
  md: "min-h-11 px-5 text-ds-body",
  lg: "min-h-12 px-6 text-base",
};

const VARIANTS: Record<ButtonVariant, string> = {
  // Dégradé de marque profond : blanc ≥ 4,78:1 sur son point le plus clair
  primary: "bg-ds-brand-gradient text-white shadow-ds-brand-glow ds-focus",
  secondary: "bg-white text-ds-brand-800 inset-ring inset-ring-ds-ink-300 shadow-sm ds-focus",
  quiet: "text-ds-brand-700 ds-focus",
  danger: "bg-ds-danger-600 text-white shadow-sm ds-focus",
  // Sur un bandeau en dégradé : bouton blanc, anneau de focus blanc
  inverse: "bg-white text-ds-brand-900 shadow-ds-card ds-focus-inverse",
};

/** Voile de survol, sous le libellé : seul son `opacity` est animé. */
const HOVER: Record<ButtonVariant, string> = {
  primary: "bg-ds-brand-950/25",
  secondary: "bg-ds-brand-50",
  quiet: "bg-ds-brand-100",
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
 * Bouton du studio. `type="button"` par défaut (le `Button` partagé soumettait
 * les formulaires par défaut) ; passer `type="submit"` dans un formulaire.
 */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
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
