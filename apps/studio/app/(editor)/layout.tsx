import type { ReactNode } from "react";
import { requireClient } from "@/lib/auth";

/**
 * L'éditeur occupe tout l'écran, sans la navigation du studio. `ds-scope` lui
 * donne les couleurs lisibles et l'anneau de focus du design system (mêmes
 * jetons que sous la coquille), sans rien changer à sa mise en page.
 */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return <div className="ds-scope flex h-screen flex-col overflow-hidden">{children}</div>;
}
