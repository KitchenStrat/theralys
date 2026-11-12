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

/**
 * Espaces insécables de la typographie française, à l'affichage seulement :
 * un deux-points, un point-virgule, un point d'exclamation ou d'interrogation
 * ne passe jamais seul à la ligne suivante, un guillemet ne reste pas seul en
 * fin de ligne. Le titre enregistré n'est pas modifié.
 */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}
