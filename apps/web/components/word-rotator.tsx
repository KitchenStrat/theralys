"use client";

import { useEffect, useState } from "react";

/**
 * Fait tourner une liste de mots : l'actif est net, le précédent s'échappe
 * vers le haut, le suivant attend en dessous (transitions dans globals.css).
 * Statique si l'utilisateur préfère réduire les animations.
 */
export function WordRotator({
  words,
  interval = 2800,
  className = "",
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  const previous = (index + words.length - 1) % words.length;

  return (
    <span className={`wr ${className}`} aria-hidden>
      {words.map((word, i) => (
        <span key={word} data-state={i === index ? "enter" : i === previous ? "above" : "below"}>
          {word}
        </span>
      ))}
    </span>
  );
}
