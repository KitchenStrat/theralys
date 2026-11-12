/**
 * Classes partagées par les composants de l'écran « Mon site » (serveur et
 * navigateur), toutes tirées du design system du studio (`components/ds`).
 */

/** Anneau de focus du design system, pour les éléments qui ne viennent pas d'un de ses composants (case à cocher, `<summary>`). */
export const FOCUS_RING = "ds-focus";

/** Lien dans un texte : souligné (jamais la couleur seule), encre lisible sur blanc comme sur une teinte. */
export const TEXT_LINK = "rounded-sm font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus hover:text-ds-brand-950";

/** Titre d'une carte (`h2`) : mêmes mesures que le `CardHeader` du design system, qui ne sait pas porter d'identifiant. */
export const CARD_TITLE = "font-ds-display text-lg/7 font-bold text-ds-ink-900 text-balance sm:text-xl/7";

/** Intertitre à l'intérieur d'une carte (`h3`). */
export const SUB_TITLE = "font-ds-display text-base/6 font-bold text-ds-ink-900 sm:text-lg/7";

/**
 * Un `Badge` du design system tient sur une ligne. Les mentions longues de cet
 * écran (« Vos outils ne s'appuient pas encore sur ce site ») doivent pouvoir
 * passer à la ligne sur un téléphone plutôt que de faire déborder la page
 * (son pictogramme garde alors sa taille).
 */
export const BADGE_WRAP = "whitespace-normal! rounded-2xl! text-left [&>svg]:shrink-0";
