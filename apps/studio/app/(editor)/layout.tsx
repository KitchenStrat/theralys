import type { ReactNode } from "react";
import { TourProvider } from "@/components/visite";
import { requireClient } from "@/lib/auth";
import { readSeenTours } from "@/lib/visite/data";

/**
 * L'éditeur occupe tout l'écran, sans la navigation du studio. `ds-scope` lui
 * donne les couleurs lisibles et l'anneau de focus du design system (mêmes
 * jetons que sous la coquille) ; `data-ds-section` lui donne l'identité de la
 * section « Mon site » (teintes et dégradé Oasis), dont il est le prolongement.
 * `h-dvh` : la hauteur réellement visible sur un téléphone, barre du navigateur
 * comprise — le bouton « Enregistrer et publier » reste à l'écran.
 *
 * L'éditeur a sa propre visite guidée : le chef d'orchestre est monté ici comme sous la coquille du studio.
 */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  const session = await requireClient();
  const seenTours = await readSeenTours(session.siteId);
  return (
    <TourProvider siteKey={session.siteId} seen={seenTours} support={session.impersonated}>
    <div data-ds-section="mon-site" className="ds-scope flex h-dvh flex-col overflow-hidden bg-ds-ink-50 text-ds-ink-900">
      {children}
    </div>
    </TourProvider>
  );
}
