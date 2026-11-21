"use client";

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/*
 * Socle GSAP du studio. Les modules sont enregistrés une seule fois, ici ;
 * tout le reste importe `gsap` depuis ce fichier.
 *
 * Une seule courbe, celle du design system (`--ease-ds-out`, cf. globals.css) :
 * les séquences GSAP et les transitions CSS ont le même geste.
 */
export const EASE = "ds-out";

/** Le praticien a demandé un mouvement réduit : rien n'est animé, tout est affiché d'emblée. */
export const CALM = "(prefers-reduced-motion: reduce)";

gsap.registerPlugin(useGSAP, CustomEase, ScrollTrigger);

// Rien de ce qui suit ne s'exécute au rendu serveur
if (typeof window !== "undefined") {
  CustomEase.create(EASE, "0.22, 0.8, 0.35, 1");
  gsap.defaults({ ease: EASE, duration: 0.36 });
}

export { gsap, ScrollTrigger, useGSAP };
