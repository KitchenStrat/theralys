"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Révélation des blocs `.reveal` à l'entrée dans le viewport.
 * Sans JavaScript, tout reste visible (l'état masqué n'est appliqué que
 * lorsque la classe `hy-js` est posée ici).
 *
 * L'effet dépend du pathname : le layout persiste entre les navigations
 * internes (accueil ↔ pages de spécialités), il faut ré-observer les blocs
 * de chaque nouvelle page — sinon ils restent masqués jusqu'à un rechargement.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.add("hy-js");

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>(".reveal").forEach((el) => el.classList.add("is-in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    // Ce qui est déjà à l'écran apparaît immédiatement (pas de page blanche)
    const process = (el: HTMLElement) => {
      if (el.classList.contains("is-in")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) el.classList.add("is-in");
      else observer.observe(el);
    };
    document.querySelectorAll<HTMLElement>(".reveal").forEach(process);

    // Les pages arrivent en streaming lors des navigations internes : blocs
    // ajoutés après cet effet, ou dont React réécrit la classe au commit final
    // (ce qui efface le is-in posé ici) — les deux cas sont repris en charge.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          if (record.target.classList.contains("reveal")) process(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("reveal")) process(node);
          node.querySelectorAll<HTMLElement>(".reveal").forEach(process);
        }
      }
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // Filet de sécurité : au défilement, toute section visible non révélée
    // l'est immédiatement — quoi qu'il arrive côté React/streaming, aucun
    // bloc ne peut rester invisible à l'écran.
    let ticking = false;
    const sweep = () => {
      ticking = false;
      document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)").forEach(process);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(sweep);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // scrollend : re-mesure au repos (les défilements « smooth » se posent
    // parfois après le dernier évènement scroll)
    window.addEventListener("scrollend", sweep, { passive: true });
    // Et une passe différée pour le contenu streamé arrivé sans défilement
    const lateSweep = setTimeout(sweep, 700);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", sweep);
      clearTimeout(lateSweep);
    };
  }, [pathname]);

  return null;
}
