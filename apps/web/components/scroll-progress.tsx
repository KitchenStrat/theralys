"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "./motion/gsap";

/** Fine barre en haut de page qui matérialise l'avancée de lecture, liée au défilement (ScrollTrigger). */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.2 } });
  });

  return <div ref={bar} aria-hidden className="scroll-progress" />;
}
