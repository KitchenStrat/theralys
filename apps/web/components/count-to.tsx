"use client";

import { useRef, useState } from "react";
import { EASE, MEDIA, gsap, useGSAP } from "./motion/gsap";

/**
 * Un nombre qui file vers sa nouvelle valeur quand elle change (les prix au
 * changement de durée ou de formules). Le texte affiché est toujours un vrai
 * nombre entier : rien n'est caché aux lecteurs d'écran ni au copier-coller.
 * En mouvement réduit, la valeur change d'un coup.
 */
export function CountTo({ value, duration = 0.45, format }: { value: number; duration?: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);
  const counter = useRef({ value });

  useGSAP(
    () => {
      const state = counter.current;
      if (state.value === value) return;
      if (window.matchMedia(MEDIA.calm).matches) {
        state.value = value;
        setShown(value);
        return;
      }
      gsap.to(state, { value, duration, ease: EASE, snap: { value: 1 }, overwrite: true, onUpdate: () => setShown(state.value) });
    },
    { dependencies: [value, duration] },
  );

  return <>{format(shown)}</>;
}
