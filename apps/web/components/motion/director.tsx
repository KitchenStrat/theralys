"use client";

import { DURATION, EASE, MEDIA, ScrollTrigger, gsap, useGSAP } from "./gsap";

/*
 * Chef d'orchestre des animations de la page (GSAP + ScrollTrigger). Le
 * balisage reste déclaratif : les composants posent des attributs, ce
 * fichier les met en mouvement.
 *
 *   [data-reveal]             apparaît à l'entrée dans l'écran (fondu et
 *                             courte montée) ; les blocs qui entrent ensemble
 *                             se suivent en cascade
 *   [data-reveal="kinetic"]   titre dont les mots montent de derrière un
 *                             masque, l'un après l'autre (cf. `Kinetic`)
 *   [data-hero]               haut de page : une seule séquence d'entrée,
 *                             jouée au chargement (titre, texte, anneau des
 *                             outils, boutons, capture de l'espace client)
 *   [data-hub]                schéma « tout au même endroit » : les liaisons
 *                             se tracent depuis Harmony, puis chaque outil se
 *                             pose au bout de la sienne
 *   [data-week]               semaine type : les contenus arrivent jour
 *                             après jour
 *   a[href^="#"]              lien interne : la page défile en douceur jusqu'à
 *                             la section (ScrollToPlugin), l'adresse et le
 *                             focus suivent
 *
 * Les blocs sont masqués par leur seule opacité, jamais par `visibility` :
 * avant même d'être entrés à l'écran, ils restent lus par les lecteurs
 * d'écran et trouvés par la recherche dans la page.
 *
 * Les états de départ et d'arrivée sont dans la feuille de style
 * (`[data-reveal]` masqué, `.is-in` affiché) : GSAP ne porte que le trajet,
 * puis retire ses styles en ligne. Sans mouvement (`prefers-reduced-motion`),
 * tout est affiché d'emblée et rien n'est animé.
 */

const CLEAR = "transform,opacity";

/** Marque un bloc comme entré : l'état final vient de la feuille de style, les animations CSS qui en dépendent partent. */
const land = (nodes: Element[]) =>
  nodes.forEach((node) => {
    node.classList.add("is-in");
    // Doublé d'un attribut, que React ne réécrit jamais : une carte dont les classes changent reste affichée
    node.setAttribute("data-in", "");
  });

/** Les mots d'un titre cinétique montent de derrière leur masque. */
function riseWords(title: Element, vars: gsap.TweenVars = {}): gsap.core.Tween {
  land([title]);
  return gsap.fromTo(
    title.querySelectorAll(".kw-in"),
    { yPercent: 118, rotation: 4 },
    { yPercent: 0, rotation: 0, duration: 0.9, stagger: 0.055, clearProps: "transform", ...vars },
  );
}

export function MotionDirector() {
  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add(MEDIA, (context) => {
      const all = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      if (context.conditions?.calm) {
        land(all);
        return;
      }

      const hero = document.querySelector<HTMLElement>("[data-hero]");
      const inHero = (node: Element) => hero !== null && hero.contains(node);

      // ── Haut de page : une seule séquence, au chargement ──────────────────
      if (hero) {
        const pick = (name: string) => gsap.utils.toArray<HTMLElement>(`[data-intro="${name}"]`, hero);
        const title = hero.querySelector("h1");
        const intro = gsap.timeline({ defaults: { ease: EASE, duration: DURATION.enter }, delay: 0.15 });
        // Les blocs de la séquence sont dits entrés d'emblée : c'est elle, et non la feuille de style, qui les montre
        land(gsap.utils.toArray<HTMLElement>("[data-reveal]", hero));
        if (title) intro.add(riseWords(title), 0);
        intro
          .fromTo(pick("lead"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, clearProps: CLEAR }, 0.35)
          .fromTo(pick("orbit"), { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: DURATION.scene, clearProps: CLEAR }, 0.5)
          .fromTo(pick("actions"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.08, clearProps: CLEAR }, 0.7)
          .fromTo(pick("shot"), { opacity: 0, y: 64 }, { opacity: 1, y: 0, duration: DURATION.scene, clearProps: CLEAR }, 0.75)
          // Les deux objets posés sur la capture arrivent après elle, chacun de son côté
          .fromTo(pick("aside"), { opacity: 0, y: 28 }, { opacity: 1, y: 0, stagger: 0.12, clearProps: CLEAR }, 1.15);

        // Le message s'efface à mesure que la capture de l'espace client prend l'écran
        const copy = gsap.utils.toArray<HTMLElement>("[data-hero-copy]", hero);
        if (copy.length > 0) {
          gsap.to(copy, {
            opacity: 0.25,
            y: -36,
            ease: "none",
            scrollTrigger: { trigger: hero, start: "top top", end: "45% top", scrub: 0.6 },
          });
        }
      }

      // ── Titres cinétiques ─────────────────────────────────────────────────
      for (const title of gsap.utils.toArray<HTMLElement>('[data-reveal="kinetic"]')) {
        if (inHero(title)) continue;
        ScrollTrigger.create({
          trigger: title,
          start: "top 86%",
          once: true,
          // Un titre déjà dépassé (saut dans la page) est simplement posé : rien à animer hors de l'écran
          onEnter: () => (title.getBoundingClientRect().bottom < 0 ? land([title]) : riseWords(title)),
        });
      }

      // ── Blocs : fondu et courte montée, en cascade pour ceux qui entrent ensemble ──
      const blocks = all.filter((node) => node.dataset.reveal !== "kinetic" && !inHero(node));
      gsap.set(blocks, { opacity: 0, y: 26 });
      ScrollTrigger.batch(blocks, {
        start: "top 90%",
        once: true,
        interval: 0.1,
        onEnter: (batch) => {
          land(batch);
          // Un saut dans la page (lien du menu, ancre) fait entrer d'un coup tout ce qui a été dépassé : ces blocs-là sont
          // posés sans attendre, et seuls ceux qu'on voit arriver se suivent en cascade — jamais une longue file d'attente.
          const passed = batch.filter((node) => node.getBoundingClientRect().bottom < 0);
          const entering = batch.filter((node) => !passed.includes(node));
          if (passed.length > 0) gsap.set(passed, { clearProps: CLEAR });
          if (entering.length > 0) {
            gsap.to(entering, { opacity: 1, y: 0, stagger: Math.min(0.08, 0.4 / entering.length), overwrite: true, clearProps: CLEAR });
          }
        },
      });

      // ── Schéma des outils : les liaisons se tracent, puis les outils se posent ──
      for (const hub of gsap.utils.toArray<HTMLElement>("[data-hub]")) {
        const lines = hub.querySelectorAll(".hub-line");
        const nodes = hub.querySelectorAll(".hub-node");
        const core = hub.querySelector(".hub-core");
        gsap
          .timeline({ scrollTrigger: { trigger: hub, start: "top 72%", once: true } })
          .fromTo(core, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, clearProps: CLEAR })
          .fromTo(hub.querySelectorAll(".hub-orbit"), { opacity: 0 }, { opacity: 1, duration: DURATION.scene }, 0.1)
          .fromTo(lines, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.8, stagger: 0.07 }, 0.25)
          .fromTo(nodes, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, clearProps: CLEAR }, 0.6);
      }

      // ── Semaine type : les contenus arrivent jour après jour ──────────────
      for (const week of gsap.utils.toArray<HTMLElement>("[data-week]")) {
        gsap.fromTo(
          week.querySelectorAll(".week-item"),
          { opacity: 0, x: -12 },
          { opacity: 1, x: 0, duration: 0.5, stagger: 0.12, clearProps: CLEAR, scrollTrigger: { trigger: week, start: "top 70%", once: true } },
        );
      }
    });

    // ── Liens internes : défilement en douceur, piloté par GSAP ─────────────
    // (le `scroll-behavior: smooth` du navigateur gêne ScrollTrigger, qui pose la position d'un coup quand il recalcule)
    const onAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href") ?? "";
      // « # » seul : retour en haut de page (le mot Harmony de l'en-tête)
      const target = hash === "#" ? null : document.getElementById(decodeURIComponent(hash.slice(1)));
      if (hash !== "#" && !target) return;
      event.preventDefault();
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const calm = window.matchMedia(MEDIA.calm).matches;
      const distance = target ? Math.abs(target.getBoundingClientRect().top - offset) : window.scrollY;
      gsap.to(window, {
        // Plus loin, un peu plus long — sans jamais faire attendre
        duration: calm ? 0 : gsap.utils.clamp(0.45, 1.1, distance / 4200),
        scrollTo: target ? { y: target, offsetY: offset, autoKill: true } : { y: 0, autoKill: true },
        overwrite: true,
        onComplete: () => {
          if (!target) return;
          // Le focus suit, pour le clavier et les lecteurs d'écran
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        },
      });
      history.pushState(null, "", hash === "#" ? location.pathname + location.search : hash);
    };
    document.addEventListener("click", onAnchor);

    // Les polices et les images décalent les sections : les déclencheurs sont recalculés une fois la page stable
    const refresh = () => ScrollTrigger.refresh();
    void document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh, { once: true });
    return () => {
      document.removeEventListener("click", onAnchor);
      window.removeEventListener("load", refresh);
      mm.revert();
    };
  });

  return null;
}
