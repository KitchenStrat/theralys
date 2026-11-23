import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@theralys/ui";
import { REP_STATUS_LABELS, type RepStatus } from "@/lib/crm/team-stats";
import { Avatar } from "../crm/ui";

/*
 * Petites pièces communes à la liste de l'équipe et à la fiche d'un
 * commercial. Sans état ni script : rendues côté serveur.
 */

const STATUS_TONE: Record<RepStatus, "success" | "warning" | "neutral"> = { active: "success", pending: "warning", disabled: "neutral" };

/** État du compte en toutes lettres (la couleur ne porte jamais le sens à elle seule). */
export function StatusBadge({ status }: { status: RepStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={clsx(status === "pending" && "!text-ink-900")}>
      {REP_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Initiales du commercial, sur la même pastille que celle d'un prospect. */
export function RepAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return <Avatar contact={{ firstName, lastName: rest.join(" "), company: "" }} size={size} />;
}

/** Chiffre clé : pastille à la teinte du sujet, valeur, précision dessous. */
export function Stat({ icon: Icon, color, label, value, hint, tone, className }: { icon: LucideIcon; color: string; label: string; value: ReactNode; hint?: ReactNode; tone?: "danger"; className?: string }) {
  return (
    <div style={{ "--stage": color } as CSSProperties} className={clsx("crm-kpi rounded-card border border-cream-200 p-4 shadow-card", className)}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="crm-stage-badge inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl">
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      </div>
      <p className={clsx("mt-2.5 text-[1.75rem] leading-none font-bold tabular-nums", tone === "danger" ? "text-danger-500" : "text-ink-900")}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
