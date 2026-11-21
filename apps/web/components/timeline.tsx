"use client";

import { useRef, type ReactNode } from "react";
import clsx from "clsx";
import { MEDIA, gsap, useGSAP } from "./motion/gsap";

/**
 * Frise verticale dont le trait se remplit au défilement : il suit une ligne
 * située aux deux tiers de l'écran, de la première étape à la dernière
 * (ScrollTrigger, `scrub`). En mouvement réduit, le trait est plein.
 */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLOListElement>(null);
  const fill = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        gsap.fromTo(
          fill.current,
          { scaleY: 0 },
          { scaleY: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top 66%", end: "bottom 66%", scrub: 0.4 } },
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <ol ref={root} className={clsx("timeline relative", className)}>
      <span aria-hidden className="timeline-track" />
      <span ref={fill} aria-hidden className="timeline-fill" />
      {children}
    </ol>
  );
}
