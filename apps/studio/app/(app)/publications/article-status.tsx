import { EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, StatusPill } from "@/components/ds";
import type { CalendarItem } from "@/lib/data";

export type ArticleStatus = CalendarItem["status"];

/**
 * Statut d'un article, partout le même : une icône, un mot, une couleur.
 * Un sujet « prévu » (pas encore rédigé) et un article « planifié » portent le
 * même mot, comme dans la légende du calendrier. « Retiré » n'existe pas dans
 * `StatusPill` : il est composé ici avec `Badge`.
 */
export function ArticleStatusPill({
  status,
  children,
  className,
}: {
  status: ArticleStatus;
  /** Libellé daté (« Publié le 6 nov. ») à la place du mot seul */
  children?: ReactNode;
  className?: string;
}) {
  if (status === "withdrawn") {
    return (
      <Badge tone="warning" icon={EyeOff} className={className}>
        {children ?? "Retiré"}
      </Badge>
    );
  }
  return (
    <StatusPill status={status === "published" ? "publie" : status === "draft" ? "brouillon" : "planifie"} className={className}>
      {children}
    </StatusPill>
  );
}
