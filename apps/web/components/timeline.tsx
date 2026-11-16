"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Frise verticale dont le trait se remplit au défilement : la variable
 * `--fill` (0 à 1) suit la traversée de l'écran par la liste, lue par
 * `.timeline-fill` (globals.css). En mouvement réduit, le trait est plein.
 */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.style.setProperty("--fill", "1");
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = node.getBoundingClientRect();
      // Le trait suit une ligne située aux deux tiers de l'écran
      const progress = (window.innerHeight * 0.66 - rect.top) / rect.height;
      node.style.setProperty("--fill", Math.min(1, Math.max(0, progress)).toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <ol ref={ref} className={clsx("timeline relative", className)}>
      <span aria-hidden className="timeline-track" />
      <span aria-hidden className="timeline-fill" />
      {children}
    </ol>
  );
}
