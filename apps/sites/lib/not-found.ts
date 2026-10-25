import type { Metadata } from "next";
import { DEFAULT_NOT_FOUND, type SiteNotFound } from "@theralys/shared";

/**
 * Métadonnées de la page introuvable. Next n'applique pas celles de
 * `not-found.tsx` quand une page appelle `notFound()` : chaque page
 * susceptible de 404 les renvoie depuis son `generateMetadata`.
 */
export const NOT_FOUND_METADATA: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: false },
};

/** Réglages effectifs de la page introuvable, prêts à afficher. */
export type ResolvedNotFound = {
  title: string;
  /** Chaîne vide = message masqué */
  message: string;
  buttonLabel: string;
  showSpecialties: boolean;
};

function trimmed(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim();
}

/**
 * Fusionne les réglages du studio (`theme.notFound`) avec les défauts :
 * - titre et libellé du bouton vides → défauts (toujours renseignés) ;
 * - message vide → masqué (le praticien a explicitement effacé le texte),
 *   message absent → message par défaut ;
 * - `showSpecialties` absent → défaut (affichées).
 */
export function resolveNotFound(settings: SiteNotFound | null | undefined): ResolvedNotFound {
  const title = trimmed(settings?.title);
  const message = trimmed(settings?.message);
  const buttonLabel = trimmed(settings?.buttonLabel);
  return {
    title: title || DEFAULT_NOT_FOUND.title,
    message: message === undefined ? DEFAULT_NOT_FOUND.message : message,
    buttonLabel: buttonLabel || DEFAULT_NOT_FOUND.buttonLabel,
    showSpecialties: settings?.showSpecialties ?? DEFAULT_NOT_FOUND.showSpecialties,
  };
}
