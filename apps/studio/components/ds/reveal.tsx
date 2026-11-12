import { clsx } from "clsx";
import type { CSSProperties, HTMLAttributes } from "react";

type Tag = "div" | "section" | "ul" | "ol" | "main" | "article";

/**
 * Cascade d'entrée : chaque enfant direct monte de 12 px en 280 ms, décalé de
 * 40 ms par rang (cinq rangs au plus, soit 480 ms au total). En mouvement
 * réduit : un fondu, sans décalage. Rien ne reste transformé après l'animation.
 *
 * À poser sur la racine d'une page (ses blocs) ou sur une grille (ses tuiles).
 */
export function Stagger({
  as: Component = "div",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: Tag }) {
  return <Component className={clsx("ds-stagger", className)} {...props} />;
}

/**
 * Entrée d'un élément isolé (un panneau d'onglet, un bloc inséré après coup).
 * `order` le place dans la cascade (0 à 5).
 */
export function Reveal({
  as: Component = "div",
  order = 0,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: Tag; order?: number }) {
  return (
    <Component
      className={clsx("ds-rise", className)}
      style={{ "--ds-i": order, ...style } as CSSProperties}
      {...props}
    />
  );
}
