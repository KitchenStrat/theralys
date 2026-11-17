import type { CSSProperties } from "react";

/**
 * Phrase qui s'illumine mot à mot à mesure qu'elle traverse l'écran
 * (animation liée au défilement, cf. `.sw` dans globals.css). Sans prise en
 * charge par le navigateur, ou en mouvement réduit, la phrase est simplement
 * affichée en entier.
 */
export function ScrollWords({ children }: { children: string }) {
  const words = children.split(" ");
  return (
    <span className="sw" style={{ "--sw-count": words.length } as CSSProperties}>
      {words.map((word, index) => (
        <span key={index} style={{ "--sw": index } as CSSProperties}>
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
