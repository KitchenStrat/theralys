/**
 * Classes partagées par les composants de l'écran « Mon site » (serveur et
 * navigateur) : contour de focus au clavier et liens en forme de bouton,
 * dans le style de la carte « Votre site » de l'accueil.
 */

/** Contour de focus au clavier, pour les éléments qui ne viennent pas de `@theralys/ui`. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600";

const PILL = `inline-flex items-center justify-center gap-1.5 rounded-full px-6 py-3 text-base transition-colors ${FOCUS_RING}`;

/** Lien principal d'une carte. */
export const PILL_PRIMARY = `${PILL} bg-primary-500 font-semibold text-white shadow-sm hover:bg-primary-600`;

/** Lien secondaire d'une carte. */
export const PILL_SECONDARY = `${PILL} border border-primary-200 bg-white/60 font-medium text-primary-700 hover:border-primary-300 hover:bg-primary-50`;

/** Lien dans un texte. */
export const TEXT_LINK = `rounded font-medium text-primary-700 underline underline-offset-2 hover:text-primary-800 ${FOCUS_RING}`;
