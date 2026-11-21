"use client";

import { useRef, type ReactNode } from "react";
import clsx from "clsx";
import { MEDIA, gsap, useGSAP } from "./motion/gsap";

/**
 * Bascule au défilement : le cadre arrive incliné vers l'arrière et se redresse
 * à mesure qu'il monte dans l'écran. L'inclinaison est liée au défilement par
 * ScrollTrigger (`scrub`) : elle avance et recule avec lui. Immobile en
 * mouvement réduit.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        gsap.fromTo(
          body.current,
          { rotationX: 14, scale: 0.955 },
          { rotationX: 0, scale: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "top 28%", scrub: 0.5 } },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={clsx("scroll-tilt", className)}>
      <div ref={body} className="scroll-tilt-body">
        {children}
      </div>
    </div>
  );
}
