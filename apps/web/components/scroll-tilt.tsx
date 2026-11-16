"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Bascule au défilement : le cadre arrive incliné vers l'arrière et se redresse
 * à mesure qu'il monte dans l'écran (variables `--tilt` et `--lift` lues par
 * `.scroll-tilt-body`, cf. globals.css). Immobile en mouvement réduit.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight;
      // 0 : le haut du cadre entre par le bas de l'écran ; 1 : il a parcouru 70 % de sa hauteur
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport * 0.7)));
      node.style.setProperty("--tilt", `${((1 - progress) * 16).toFixed(2)}deg`);
      node.style.setProperty("--lift", ((1 - progress) * 0.05).toFixed(3));
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
    <div ref={ref} className={clsx("scroll-tilt", className)}>
      <div className="scroll-tilt-body">{children}</div>
    </div>
  );
}
