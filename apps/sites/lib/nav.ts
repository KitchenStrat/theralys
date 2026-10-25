import { isSectionVisible, type Section, type SectionType } from "@theralys/shared";

/** Lien d'ancre de la navigation principale (en-tête + menu mobile). */
export type NavAnchor = { href: `#${string}`; label: string; type: SectionType };

/**
 * Ancres de l'accueil, dans l'ordre d'affichage de la navigation. L'identifiant
 * doit correspondre au `id` posé par le rendu de la section (sections.tsx).
 */
export const NAV_ANCHORS: readonly NavAnchor[] = [
  { type: "about", href: "#a-propos", label: "À propos" },
  { type: "reviews", href: "#avis", label: "Avis" },
  { type: "process", href: "#deroulement", label: "Déroulement" },
  { type: "faq", href: "#questions", label: "Questions" },
  { type: "contact", href: "#contact", label: "Contact" },
];

/**
 * Ancres à afficher : seulement celles dont la section existe sur l'accueil
 * ET est visible (une section masquée dans le studio sort de la navigation).
 * Accueil absent (site en génération) → aucune ancre.
 */
export function navAnchors(homeSections: Section[] | null | undefined): NavAnchor[] {
  if (!homeSections) return [];
  return NAV_ANCHORS.filter((anchor) =>
    homeSections.some((s) => s.type === anchor.type && isSectionVisible(s)),
  );
}
