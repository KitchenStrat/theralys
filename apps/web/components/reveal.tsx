"use client";

import { useEffect } from "react";

/**
 * Observe tous les blocs [data-reveal] de la page et les fait apparaître
 * en cascade dès qu'ils entrent dans le viewport (une seule fois).
 */
export function RevealObserver() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (nodes.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    for (const node of nodes) {
      // Déjà visible (haut de page) : révélé immédiatement
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) node.classList.add("is-in");
      else io.observe(node);
    }
    return () => io.disconnect();
  }, []);
  return null;
}
