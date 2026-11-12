import { Check, Clock, Download, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, StatusPill } from "@/components/ds";
import type { GoogleCalendarItem } from "@/lib/google/posts";

/** Statut d'un post Google, partagé par la liste, le calendrier et la fenêtre du post. */
export type PostStatusKind = "publie" | "telecharge" | "a-publier";

/** Statut affiché : « Publié » / « Téléchargé » / « À publier ». */
export function statusOf(item: GoogleCalendarItem): { label: string; tone: "success" | "info"; kind: PostStatusKind } {
  if (item.status === "published") return { label: "Publié", tone: "success", kind: "publie" };
  if (item.downloadedAt) return { label: "Téléchargé", tone: "info", kind: "telecharge" };
  return { label: "À publier", tone: "info", kind: "a-publier" };
}

export const STATUS_ICON: Record<PostStatusKind, LucideIcon> = { publie: Check, telecharge: Download, "a-publier": Clock };
const STATUS_LABEL: Record<PostStatusKind, string> = { publie: "Publié", telecharge: "Téléchargé", "a-publier": "À publier" };

/** Statut d'un post : toujours une icône et un mot (`children` précise la date : « Publié le 26 oct. »). */
export function PostStatusPill({ kind, children, className }: { kind: PostStatusKind; children?: ReactNode; className?: string }) {
  if (kind === "telecharge") {
    return (
      <Badge tone="section" icon={Download} className={className}>
        {children ?? STATUS_LABEL.telecharge}
      </Badge>
    );
  }
  return (
    <StatusPill status={kind === "publie" ? "publie" : "planifie"} className={className}>
      {children ?? STATUS_LABEL[kind]}
    </StatusPill>
  );
}

export function itemLabel(item: GoogleCalendarItem): string {
  return `Post Google — ${item.topic}${item.source === "request" ? " (sur mesure)" : ""}`;
}
