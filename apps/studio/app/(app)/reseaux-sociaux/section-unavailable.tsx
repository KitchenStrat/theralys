import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader, Stagger } from "@/components/ds";
import { SECTION_PURPOSE } from "./social-ui";

/**
 * Section indisponible (formule sans réseaux sociaux, activation en cours) :
 * l'en-tête commun, puis ce qui manque, ce qui viendra, et l'action possible.
 */
export function SectionUnavailable({
  icon,
  title,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stagger className="space-y-6">
      <PageHeader section="reseaux-sociaux" purpose={SECTION_PURPOSE} />
      <Card padding="none">
        <EmptyState icon={icon} title={title} action={action} as="h2">
          {children}
        </EmptyState>
      </Card>
    </Stagger>
  );
}
