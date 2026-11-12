import { clsx } from "clsx";
import { Check, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ds";

/**
 * Petites pièces de présentation de l'écran « Mon site », composées avec les
 * jetons du design system là où il n'a pas de composant qui convienne :
 * surtitre d'étape, encadré d'information ou d'attention, coche de
 * confirmation qui porte un `data-testid`, lien d'ancre en forme de bouton,
 * repère numéroté. Rien ici ne fixe la section : tout suit celle de la page.
 */

/**
 * Tête d'une carte : pastille d'icône, titre (avec ses badges), puis le texte
 * d'explication. Le `CardHeader` du design system ne sait pas porter
 * l'identifiant du titre, dont dépendent les `aria-labelledby` de cet écran.
 * Sur un téléphone, l'explication repasse sous la pastille pour garder toute
 * la largeur de la carte ; à partir de 640 px elle s'aligne sous le titre.
 */
export function CardHead({ icon, title, className, children }: { icon: ReactNode; title: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={clsx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 sm:gap-y-1", className)}>
      <div className="self-start">{icon}</div>
      <div className="min-w-0 self-center">{title}</div>
      {children ? <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">{children}</div> : null}
    </div>
  );
}

/** Surtitre d'une carte : sa place dans le parcours (« Étape 2 »), à l'accent de la section. */
export function Eyebrow({ icon: Icon, className, children }: { icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <p className={clsx("inline-flex items-center gap-1.5 text-ds-meta font-semibold text-ds-section-accent", className)}>
      {Icon ? <Icon size={15} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </p>
  );
}

export type NoticeTone = "info" | "warning" | "danger";

const NOTICE: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "bg-ds-section-tint text-ds-ink-700 ring-1 ring-ds-section-line/70", icon: "text-ds-section-accent", Icon: Info },
  warning: { box: "bg-ds-warning-100 text-ds-warning-900", icon: "text-ds-warning-700", Icon: TriangleAlert },
  danger: { box: "bg-ds-danger-100 text-ds-danger-900", icon: "text-ds-danger-700", Icon: TriangleAlert },
};

/** Encadré : une information (teinte de la section), un point d'attention ou une erreur — toujours avec son pictogramme. */
export function Notice({
  tone = "info",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone; icon?: LucideIcon }) {
  const def = NOTICE[tone];
  const Icon = icon ?? def.Icon;
  return (
    <div className={clsx("flex items-start gap-3 rounded-ds-md px-4 py-3 text-ds-body", def.box, className)} {...props}>
      <Icon size={18} aria-hidden className={clsx("mt-[3px] shrink-0", def.icon)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Coche de confirmation, au dessin de l'`InlineSuccess` du design system (qui
 * ne peut pas porter de `data-testid`) : elle surgit et une onde chaude passe
 * une fois. `calm` : coche posée, sans mouvement — quand un autre élément de
 * l'écran fête déjà la même action.
 */
export function SuccessMark({ size = "sm", calm = false, className }: { size?: "sm" | "lg"; calm?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "relative grid shrink-0 place-items-center rounded-full bg-ds-success-600 text-white",
        size === "sm" ? "size-6" : "size-12",
        !calm && "ds-pop",
        className,
      )}
    >
      {calm ? null : <span className="ds-success-ripple" />}
      <Check size={size === "sm" ? 14 : 26} strokeWidth={3} />
    </span>
  );
}

/**
 * Lien vers une ancre de la page, en forme de bouton du design system. Un
 * vrai `<a href="#…">` : le navigateur déplace aussi le point de départ de la
 * tabulation vers la cible, ce qu'un lien de navigation interne ne fait pas.
 */
export function AnchorButton({
  href,
  variant = "secondary",
  size = "sm",
  icon,
  iconRight,
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: `#${string}`;
  variant?: Extract<ButtonVariant, "secondary" | "quiet">;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
}) {
  return (
    <a href={href} className={buttonClasses(variant, size, clsx(variant === "secondary" ? "hover:bg-ds-brand-50" : "hover:bg-ds-brand-100", className))} {...props}>
      {icon}
      <span>{children}</span>
      {iconRight}
    </a>
  );
}

/** Repère numéroté d'une marche à suivre (« 1. Copiez ce code ») : le chiffre fait partie du titre, il est lu avec lui. */
export function NumberDot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full bg-ds-section-tint-2 text-ds-meta font-bold text-ds-section-ink ds-tnum", className)}>{children}</span>
  );
}
