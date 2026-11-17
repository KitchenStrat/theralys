import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

/**
 * Titre cinétique : chaque mot monte de derrière un masque, l'un après
 * l'autre, quand le titre entre à l'écran. S'utilise dans un titre qui porte
 * `data-reveal="kinetic"` (c'est lui qui déclenche, cf. globals.css).
 *
 * Les chaînes sont découpées en mots ; un élément (le mot de la marque, un
 * passage en dégradé) monte d'un bloc. Le texte reste du texte : il se
 * sélectionne, se lit et se traduit comme avant. `from` décale la cascade
 * quand un même titre est composé de plusieurs morceaux.
 */
export function Kinetic({ children, from = 0 }: { children: ReactNode; from?: number }) {
  let index = from;
  const word = (content: ReactNode, key: string) => (
    <span key={key} className="kw">
      <span className="kw-in" style={{ "--kw": index++ } as CSSProperties}>
        {content}
      </span>
    </span>
  );
  const out: ReactNode[] = [];
  Children.forEach(children, (child, i) => {
    if (typeof child === "string" || typeof child === "number") {
      // Les espaces restent de vrais espaces entre les mots : le titre se coupe où il veut
      // (une espace insécable ne coupe pas : « rentable ? » reste un seul mot)
      String(child)
        .split(/([ \t\n\r]+)/)
        .forEach((token, j) => {
          if (token === "") return;
          out.push(/^[ \t\n\r]+$/.test(token) ? " " : word(token, `${i}-${j}`));
        });
    } else if (isValidElement(child)) {
      out.push(word(child, `${i}`));
    } else {
      out.push(child);
    }
  });
  return <>{out}</>;
}
