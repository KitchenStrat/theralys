import { Fragment, type ReactNode } from "react";
import { fr } from "./typo";

/**
 * Un texte de la page, prêt à afficher : `**mots forts**` passent en gras
 * (ce qu'il faut retenir se lit d'un coup d'œil) et la typographie française
 * est posée. « Harmony » s'écrit comme le reste de la phrase : le mot-marque
 * est réservé au logo.
 *
 * `strong` : classes du gras — encre foncée sur fond clair par défaut.
 */
export function rich(text: string, { strong = "font-semibold text-ink-900" }: { strong?: string } = {}): ReactNode {
  return fr(text)
    .split("**")
    .map((part, index) =>
      index % 2 === 1 ? (
        <strong key={index} className={strong}>
          {part}
        </strong>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
