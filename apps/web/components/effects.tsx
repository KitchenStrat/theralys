"use client";

import { useEffect } from "react";

/**
 * Spotlight : sur les cartes marquées [data-spotlight], un halo lumineux
 * suit le curseur (variables --mx/--my consommées par .spotlight::after).
 * Un seul écouteur global, mis à jour au rythme des frames.
 */
export function SpotlightObserver() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-spotlight]"));
    if (nodes.length === 0) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      raf = 0;
      if (!last) return;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        node.style.setProperty("--mx", `${last.clientX - rect.left}px`);
        node.style.setProperty("--my", `${last.clientY - rect.top}px`);
      }
    };
    const onMove = (event: PointerEvent) => {
      last = event;
      if (!raf) raf = requestAnimationFrame(update);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

/**
 * Parallaxe douce au défilement : les éléments [data-parallax="vitesse"]
 * glissent verticalement proportionnellement à leur distance au centre
 * de l'écran. Positions mesurées une fois (et re-mesurées au resize),
 * transformations appliquées via requestAnimationFrame.
 */
export function ParallaxObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (nodes.length === 0) return;

    type Item = { node: HTMLElement; center: number; speed: number };
    let items: Item[] = [];
    let raf = 0;

    const measure = () => {
      for (const node of nodes) node.style.transform = "";
      items = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          node,
          center: rect.top + window.scrollY + rect.height / 2,
          speed: Number.parseFloat(node.dataset.parallax || "0.08") || 0,
        };
      });
    };
    const update = () => {
      raf = 0;
      const viewportCenter = window.scrollY + window.innerHeight / 2;
      for (const item of items) {
        const delta = (item.center - viewportCenter) * item.speed;
        item.node.style.transform = `translate3d(0, ${delta.toFixed(1)}px, 0)`;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      schedule();
    };
    measure();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
