"use client";

import { useEffect } from "react";

/**
 * Révélation des blocs `.reveal` à l'entrée dans le viewport.
 * Sans JavaScript, tout reste visible (l'état masqué n'est appliqué que
 * lorsque la classe `hy-js` est posée ici).
 */
export function ScrollReveal() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (elements.length === 0) return;
    document.documentElement.classList.add("hy-js");

    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    // Ce qui est déjà à l'écran apparaît immédiatement (pas de page blanche)
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) el.classList.add("is-in");
      else observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
