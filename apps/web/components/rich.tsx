import { Fragment, type ReactNode } from "react";
import { brandify } from "./brand";
import { fr } from "./typo";

/**
 * Un texte de la page, prêt à afficher : `**mots forts**` passent en gras
 * (ce qu'il faut retenir se lit d'un coup d'œil), « Harmony » prend le
 * mot-marque, et la typographie française est posée.
 *
 * `strong` : classes du gras — encre foncée sur fond clair par défaut.
 */
export function rich(text: string, { strong = "font-semibold text-ink-900", onDark = false }: { strong?: string; onDark?: boolean } = {}): ReactNode {
  return fr(text)
    .split("**")
    .map((part, index) =>
      index % 2 === 1 ? (
        <strong key={index} className={strong}>
          {brandify(part, onDark)}
        </strong>
      ) : (
        <Fragment key={index}>{brandify(part, onDark)}</Fragment>
      ),
    );
}
