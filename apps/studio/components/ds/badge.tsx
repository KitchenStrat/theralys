import { clsx } from "clsx";
import {
  Check,
  Clock,
  Eye,
  LoaderCircle,
  PenLine,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "section" | "success" | "warning" | "danger" | "sun";

/** Teinte 100 + texte 900 : au moins 9:1, même en 13 px. */
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-ds-ink-100 text-ds-ink-700",
  brand: "bg-ds-brand-100 text-ds-brand-900",
  section: "bg-ds-section-tint-2 text-ds-section-ink",
  success: "bg-ds-success-100 text-ds-success-900",
  warning: "bg-ds-warning-100 text-ds-warning-900",
  danger: "bg-ds-danger-100 text-ds-danger-900",
  // Accent chaud : « Nouveau », mise en avant. Jamais un statut.
  sun: "bg-ds-sun-100 text-ds-sun-900",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: LucideIcon;
};

export function Badge({ tone = "neutral", icon: Icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-ds-meta font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon size={14} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Marque unique de tout contenu produit par l'IA : l'étincelle et ce libellé, partout les mêmes. */
export function AiBadge({ children = "Rédigé par l'IA", className }: { children?: ReactNode; className?: string }) {
  return (
    <Badge tone="brand" icon={Sparkles} className={className}>
      {children}
    </Badge>
  );
}

export type Status = "brouillon" | "planifie" | "a-relire" | "en-cours" | "publie" | "echec";

const STATUS: Record<Status, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  brouillon: { label: "Brouillon", tone: "neutral", icon: PenLine },
  planifie: { label: "Planifié", tone: "brand", icon: Clock },
  "a-relire": { label: "À relire", tone: "warning", icon: Eye },
  "en-cours": { label: "En préparation", tone: "brand", icon: LoaderCircle },
  publie: { label: "Publié", tone: "success", icon: Check },
  echec: { label: "À reprendre", tone: "danger", icon: TriangleAlert },
};

/**
 * Statut d'un contenu : une icône, un libellé et une couleur — jamais la couleur seule.
 * `children` remplace le libellé par défaut (« Programmé le 3 déc. »).
 */
export function StatusPill({
  status,
  children,
  className,
}: {
  status: Status;
  children?: ReactNode;
  className?: string;
}) {
  const { label, tone, icon } = STATUS[status];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {children ?? label}
    </Badge>
  );
}
