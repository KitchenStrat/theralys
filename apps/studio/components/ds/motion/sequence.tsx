"use client";

import { clsx } from "clsx";
import { useRef, type HTMLAttributes } from "react";
import { CALM, gsap, useGSAP } from "./gsap";

/**
 * Séquence d'entrée jouée une fois, quand le bloc arrive à l'écran (GSAP).
 * Le balisage reste déclaratif : les enfants portent `data-seq="…"`, la
 * séquence les met en mouvement dans l'ordre.
 *
 *   formulas   les formules du compte : chaque carte monte, son état
 *              (« Souscrite ») se pose, puis ses lignes arrivent une à une
 *   empty      un état vide ou une section non souscrite : la vignette se
 *              pose, puis le titre, le texte et l'action montent
 *   tiles      une grille de cartes sous la ligne de flottaison (« Vos
 *              espaces ») : elles montent en cascade quand la grille entre à
 *              l'écran (ScrollTrigger), et non au chargement, où personne
 *              ne les voit
 *
 * Avant le départ, les éléments de la séquence sont masqués par la feuille de
 * style (`.ds-seq`, par l'opacité seule : ils restent lus par les lecteurs
 * d'écran). En mouvement réduit, tout est affiché d'emblée.
 */
export type SequenceKind = "formulas" | "empty" | "tiles";

const CLEAR = "transform,opacity";

export function Sequence({ kind, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { kind: SequenceKind }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const node = root.current;
      if (!node) return;
      const pick = (name: string) => gsap.utils.toArray<HTMLElement>(`[data-seq="${name}"]`, node);
      if (!window.matchMedia(CALM).matches) {
        const timeline = gsap.timeline(kind === "tiles" ? { scrollTrigger: { trigger: node, start: "top 90%", once: true } } : {});
        if (kind === "tiles") {
          timeline.fromTo(pick("tile"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.06, clearProps: CLEAR });
        } else if (kind === "formulas") {
          timeline
            .fromTo(pick("card"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.1, clearProps: CLEAR })
            .fromTo(pick("state"), { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.28, stagger: 0.1, clearProps: CLEAR }, 0.18)
            .fromTo(pick("line"), { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.045, clearProps: CLEAR }, 0.24)
            .fromTo(pick("note"), { opacity: 0 }, { opacity: 1, duration: 0.3, clearProps: CLEAR }, ">-0.1");
        } else {
          timeline
            .fromTo(pick("mark"), { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.42, clearProps: CLEAR })
            .fromTo(pick("text"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.07, clearProps: CLEAR }, 0.12);
        }
      }
      // GSAP tient désormais l'état de départ (ou il n'y a rien à jouer) : la feuille de style ne masque plus rien
      node.setAttribute("data-seq-done", "");
    },
    { scope: root },
  );

  return (
    <div ref={root} className={clsx("ds-seq", className)} {...props}>
      {children}
    </div>
  );
}
