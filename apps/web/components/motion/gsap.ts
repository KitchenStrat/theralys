"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/*
 * Socle GSAP de la vitrine. Les modules d'extension sont enregistrés une
 * seule fois, ici, et tout le reste de la page importe `gsap` depuis ce
 * fichier : aucune animation ne peut partir avant l'enregistrement.
 *
 * Une seule courbe pour toute la page, « harmony » — la même que celle des
 * transitions CSS (`cubic-bezier(0.22, 1, 0.36, 1)`, cf. globals.css) : départ
 * vif, arrivée longue et douce, jamais de rebond.
 */
export const EASE = "harmony";

/** Durées, en secondes : un retour d'action, une entrée, une grande entrée. */
export const DURATION = { feedback: 0.18, enter: 0.7, scene: 1 } as const;

/** Conditions de `gsap.matchMedia()` partagées par toutes les séquences. */
export const MEDIA = {
  /** Le visiteur n'a pas demandé de mouvement réduit */
  motion: "(prefers-reduced-motion: no-preference)",
  /** Il l'a demandé : tout est affiché d'emblée, rien ne bouge */
  calm: "(prefers-reduced-motion: reduce)",
  wide: "(min-width: 768px)",
} as const;

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin, CustomEase, DrawSVGPlugin);

// Rien de ce qui suit ne s'exécute au rendu serveur
if (typeof window !== "undefined") {
  CustomEase.create(EASE, "0.22, 1, 0.36, 1");
  gsap.defaults({ ease: EASE, duration: DURATION.enter });
}

export { gsap, ScrollTrigger, useGSAP };
