import clsx from "clsx";

/*
 * Mot-marque « Harmony », réservé au logo (en-tête, pied de page, sphères) :
 * police dédiée (Comfortaa), dégradé de bleus et
 * reflet lumineux qui traverse le mot (styles .brand-word dans globals.css).
 * `onDark` bascule sur le dégradé clair pour les fonds sombres ou bleus.
 */
export function Brand({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <span className={clsx("brand-word", onDark && "brand-word--dark", className)}>Harmony</span>;
}
