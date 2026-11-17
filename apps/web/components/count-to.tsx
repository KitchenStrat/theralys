"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Un nombre qui file vers sa nouvelle valeur quand elle change (les prix au
 * changement de durée). Le texte affiché est toujours un vrai nombre : rien
 * n'est caché aux lecteurs d'écran ni au copier-coller. En mouvement réduit,
 * la valeur change d'un coup.
 */
export function CountTo({ value, duration = 420, format }: { value: number; duration?: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      // Départ vif, arrivée douce
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (value - start) * eased);
      from.current = current;
      setShown(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
