"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * Inclinaison 3D subtile au survol (souris uniquement) : la carte pivote
 * vers le curseur puis revient en place. Inerte au tactile et si
 * l'utilisateur préfère réduire les animations.
 */
export function Tilt({
  children,
  max = 6,
  className = "",
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(event: ReactPointerEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node || event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
  }

  function onLeave() {
    const node = ref.current;
    if (node) node.style.transform = "";
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
