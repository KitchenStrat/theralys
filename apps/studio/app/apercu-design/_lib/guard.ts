import { notFound } from "next/navigation";
import type { SectionHrefs } from "@/components/ds";

/** La page d'aperçu n'existe pas en production : elle répond 404. */
export function assertPreviewAllowed(): void {
  if (process.env.NODE_ENV === "production") notFound();
}

/** Dans l'aperçu, la navigation mène aux compositions de démonstration, pas aux vraies pages. */
export const PREVIEW_HREFS: SectionHrefs = {
  accueil: "/apercu-design/accueil",
  "mon-site": "/apercu-design/section/mon-site",
  publications: "/apercu-design/section/publications",
  "reseaux-sociaux": "/apercu-design/section/reseaux-sociaux",
  "fiche-google": "/apercu-design/section/fiche-google",
  "google-ads": "/apercu-design/section/google-ads",
  "meta-ads": "/apercu-design/section/meta-ads",
  academie: "/apercu-design/section/academie",
  compte: "/apercu-design/section/compte",
};
