import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, SECTION_ORDER } from "@/components/ds";
import { assertPreviewAllowed, PREVIEW_HREFS } from "./_lib/guard";
import { SAMPLE_USER } from "./_lib/sample";

export const metadata: Metadata = { title: "Aperçu du design system" };

/** Aperçu : « Déconnexion » ne déconnecte pas. */
async function previewLogout() {
  "use server";
}

/**
 * Page de démonstration du design system du studio, rendue dans la nouvelle
 * coquille. Hors du groupe `(app)` : elle n'emprunte ni la mise en page ni les
 * données des vraies pages. Absente en production (404).
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  assertPreviewAllowed();
  return (
    <AppShell
      sections={SECTION_ORDER}
      siteHref={SAMPLE_USER.siteHref}
      logoutAction={previewLogout}
      userName={SAMPLE_USER.firstName}
      badges={{ publications: "2", "mon-site": "Nouveau" }}
      hrefs={PREVIEW_HREFS}
    >
      {children}
    </AppShell>
  );
}
