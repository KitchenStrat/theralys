import { clsx } from "clsx";
import { Check, CircleHelp, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ds";

/**
 * Petites pièces de présentation de la section Google Ads, composées avec les
 * jetons du design system là où il n'a pas (encore) de composant : encadré
 * d'information ou d'alerte, repère d'un point de contrôle à trois états,
 * liste de chiffres détaillés. Les blocs partagés avec Meta Ads
 * (`external-site-cards`, `analysis-site-notice`) s'en servent aussi : rien
 * ici ne fixe la section, tout suit celle de la page.
 */

/** Lien dans une phrase : souligné (jamais la couleur seule), encre lisible sur blanc comme sur une teinte. */
export const TEXT_LINK = "rounded-sm font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus hover:text-ds-brand-950";

/** `info` : sur une carte blanche · `plain` : la même information posée sur une carte teintée. */
export type NoticeTone = "info" | "plain" | "warning" | "danger";

const NOTICE: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "bg-ds-section-tint text-ds-ink-700 ring-1 ring-ds-section-line/70", icon: "text-ds-section-accent", Icon: Info },
  plain: { box: "bg-white text-ds-ink-700 ring-1 ring-ds-section-line/70", icon: "text-ds-section-accent", Icon: Info },
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

/** `ok` : acquis · `todo` : à régler · `unknown` : à vérifier (la lecture ne permet pas de le dire). */
export type CheckState = "ok" | "todo" | "unknown";

const MARK: Record<CheckState, { Icon: LucideIcon; className: string; tone: BadgeTone }> = {
  ok: { Icon: Check, className: "bg-ds-success-600 text-white", tone: "success" },
  // warning-500 ne porte que de l'encre foncée
  todo: { Icon: TriangleAlert, className: "bg-ds-warning-500 text-ds-ink-900", tone: "warning" },
  unknown: { Icon: CircleHelp, className: "bg-ds-ink-200 text-ds-ink-700", tone: "neutral" },
};

/** Repère en tête d'une ligne de check-list : décoratif, le mot du statut est porté par `CheckBadge`. */
export function CheckMark({ state, className }: { state: CheckState; className?: string }) {
  const { Icon, className: tone } = MARK[state];
  return (
    <span aria-hidden className={clsx("grid size-7 shrink-0 place-items-center rounded-full", tone, className)}>
      <Icon size={16} strokeWidth={state === "ok" ? 3 : 2.5} />
    </span>
  );
}

/** Statut d'un point de contrôle : une icône et un mot, jamais la couleur seule. */
export function CheckBadge({ state, children }: { state: CheckState; children: ReactNode }) {
  const { Icon, tone } = MARK[state];
  return (
    <Badge tone={tone} icon={Icon}>
      {children}
    </Badge>
  );
}

/** Liste de chiffres détaillés : libellé et précision à gauche, valeur à droite. */
export function FigureList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={clsx("divide-y divide-ds-ink-200", className)}>{children}</dl>;
}

export function Figure({ label, value, hint, highlight = false }: { label: string; value: ReactNode; hint?: string; highlight?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5", highlight && "-mx-3 rounded-ds-sm bg-ds-section-tint px-3")}>
      <dt className="min-w-0 text-ds-body text-ds-ink-700">
        <span className={clsx("block", highlight && "font-semibold text-ds-section-ink")}>{label}</span>
        {hint ? <span className="block text-ds-meta text-ds-ink-600">{hint}</span> : null}
      </dt>
      <dd className={clsx("shrink-0 text-right text-base font-semibold ds-tnum", highlight ? "text-ds-section-ink" : "text-ds-ink-900")}>{value}</dd>
    </div>
  );
}

/** Mention discrète sous un bloc (source d'un chiffre, limite d'une mesure). */
export function FinePrint({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={clsx("text-ds-meta text-ds-ink-600", className)}>{children}</p>;
}
