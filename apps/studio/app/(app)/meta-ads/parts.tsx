import { clsx } from "clsx";
import { Download, type LucideIcon } from "lucide-react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ds";

/**
 * Petites briques de présentation propres à la section Meta Ads, composées
 * avec les jetons du design system là où il n'a pas (encore) de composant :
 * encart d'information, lien de téléchargement, sélecteur à segments dont les
 * boutons gardent `aria-pressed`, numéro d'étape.
 */

/** Lien dans une phrase (bleu de marque, souligné), posé sur un `<a>` ou un `<button>` ; `ON_TINT` : variante lisible sur un encart teinté. */
export const TEXT_LINK = "cursor-pointer rounded font-semibold text-ds-brand-700 underline underline-offset-2 ds-focus";
export const TEXT_LINK_ON_TINT = "cursor-pointer rounded font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus";

export type NoticeTone = "section" | "neutral" | "warning" | "danger" | "success";

const NOTICE: Record<NoticeTone, { box: string; icon: string }> = {
  section: { box: "bg-ds-section-tint text-ds-ink-700 inset-ring inset-ring-ds-section-line/70", icon: "text-ds-section-accent" },
  neutral: { box: "bg-ds-ink-100 text-ds-ink-700", icon: "text-ds-ink-600" },
  warning: { box: "bg-ds-warning-100 text-ds-warning-900", icon: "text-ds-warning-700" },
  danger: { box: "bg-ds-danger-100 text-ds-danger-900", icon: "text-ds-danger-700" },
  success: { box: "bg-ds-success-100 text-ds-success-900", icon: "text-ds-success-700" },
};

export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: NoticeTone;
  icon?: LucideIcon;
  /** À la place de l'icône : un indicateur d'activité, par exemple */
  leading?: ReactNode;
  title?: ReactNode;
};

/**
 * Encart : une teinte, une icône et un texte — une précision, une mise en
 * garde ou un message d'erreur. Le rôle (`alert`, `status`, `note`) est posé
 * par l'appelant.
 */
export function Notice({ tone = "section", icon: Icon, leading, title, children, className, ...props }: NoticeProps) {
  const style = NOTICE[tone];
  return (
    <div className={clsx("flex items-start gap-3 rounded-ds-md px-4 py-3 text-ds-body", style.box, className)} {...props}>
      {leading ? (
        <span className={clsx("mt-0.5 shrink-0", style.icon)}>{leading}</span>
      ) : Icon ? (
        <Icon size={18} aria-hidden className={clsx("mt-0.5 shrink-0", style.icon)} />
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Lien de téléchargement à l'apparence d'un bouton. Un `<a download>` simple :
 * le `LinkButton` du design system passe par `next/link`, qui précharge
 * l'adresse — ici une route qui rend un visuel ou un kit.
 */
export function DownloadLink({
  href,
  variant = "secondary",
  size = "sm",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} download className={buttonClasses(variant, size, className)}>
      <span
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-ds-fast ease-ds-out group-hover/btn:opacity-100",
          variant === "primary" ? "bg-ds-brand-950/25" : variant === "secondary" ? "bg-ds-brand-50" : "bg-ds-brand-100",
        )}
      />
      <Download size={16} aria-hidden />
      <span>{children}</span>
    </a>
  );
}

/**
 * Sélecteur à segments de largeur égale, au dessin du `Tabs` « pill » du design
 * system (la pastille blanche glisse), pour des boutons à bascule qui gardent
 * leur `aria-pressed`. Des libellés courts : les colonnes ont la même largeur.
 */
export function PressedSegments<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Nom accessible du groupe */
  label: string;
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  return (
    <div
      role="group"
      aria-label={label}
      style={{ "--ds-n": options.length, "--ds-i": index } as CSSProperties}
      className={clsx("relative inline-grid max-w-full auto-cols-fr grid-flow-col rounded-full bg-ds-ink-100 p-1 inset-ring inset-ring-ds-ink-200", className)}
    >
      <span aria-hidden className="ds-segmented-indicator" />
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            title={option.title}
            className={clsx(
              "relative z-10 inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap ds-focus pointer-coarse:min-h-11",
              active ? "font-semibold text-ds-ink-900" : "font-medium text-ds-ink-600 hover:text-ds-ink-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Numéro d'une étape ou d'un élément de liste : pastille au dégradé profond de la section, chiffre blanc. */
export function StepNumber({ children, size = "md", className }: { children: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid shrink-0 place-items-center rounded-full bg-ds-section-gradient-deep font-bold text-ds-section-on-deep shadow-ds-glow ds-tnum",
        size === "sm" ? "size-7 text-ds-meta" : size === "lg" ? "size-11 text-lg" : "size-9 text-ds-body",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mention de bas de carte : date de préparation, mode démonstration… */
export function MetaLine({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={clsx("text-ds-meta text-ds-ink-600", className)}>{children}</p>;
}
