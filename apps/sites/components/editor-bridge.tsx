"use client";

import { useEffect } from "react";

/**
 * Pont avec l'éditeur du studio, actif uniquement quand le site est affiché
 * dans l'iframe de l'éditeur ET que celui-ci s'est annoncé par postMessage
 * (`hy:hello`). Hors éditeur, ce composant ne fait rien.
 *
 * ── Protocole (postMessage, origine de l'éditeur mémorisée au `hy:hello`) ──
 *
 * Reçu par le site :
 *  - `hy:hello`                     active le mode édition : surbrillance au
 *                                   survol des sections, étiquette « ✎ <label> »
 *                                   (attribut `data-hy-label`), clics captés ;
 *  - `hy:focus { index }`           défile vers la section `[data-hy-section=index]` ;
 *  - `hy:theme { vars, ambiance? }` prévisualise un style (variables CSS du
 *                                   thème) avant publication.
 *
 * Émis vers l'éditeur :
 *  - `hy:ready`                     accusé de réception du `hy:hello` ;
 *  au clic sur une section :
 *  - `hy:select { index, hidden }`  section propre à la page : `index` = position
 *                                   dans `page.sections` (attribut
 *                                   `data-hy-section`), `hidden` = true si la
 *                                   section est masquée (barre « Section masquée »,
 *                                   attribut `data-hy-hidden`) → le studio
 *                                   propose de la réafficher ;
 *  - `hy:select { shared, hidden }` section héritée de l'accueil sur une page de
 *                                   spécialité (attribut `data-hy-shared` = type,
 *                                   ex. "reviews" ou "contact") : elle s'édite
 *                                   depuis la page d'accueil.
 *
 * Les attributs `data-hy-*` sont posés par `Sections` (components/sections.tsx).
 */
export function EditorBridge() {
  useEffect(() => {
    if (window.self === window.top) return;

    let editorOrigin: string | null = null;
    let editorWindow: Window | null = null;

    const style = document.createElement("style");
    style.textContent = `
      .hy-editing [data-hy-section],
      .hy-editing [data-hy-shared] { position: relative; scroll-margin-top: 96px; }
      .hy-editing [data-hy-section]:hover,
      .hy-editing [data-hy-shared]:hover {
        outline: 2px dashed var(--site-primary);
        outline-offset: -2px;
        cursor: pointer;
      }
      .hy-editing [data-hy-section]:hover::after,
      .hy-editing [data-hy-shared]:hover::after {
        content: "✎ " attr(data-hy-label);
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 50;
        background: var(--site-primary);
        color: #fff;
        font-size: 12px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        padding: 4px 12px;
        border-radius: 999px;
        pointer-events: none;
        white-space: nowrap;
      }
      /* Les contenus embarqués (carte Google Maps) avaleraient le clic : en mode
         édition, ils laissent passer la sélection de la section */
      .hy-editing [data-hy-section] iframe,
      .hy-editing [data-hy-shared] iframe { pointer-events: none; }
      /* Section héritée de l'accueil : étiquette plus discrète, contour pointillé */
      .hy-editing [data-hy-shared]:hover { outline-style: dotted; }
      .hy-editing [data-hy-shared]:hover::after {
        content: "✎ " attr(data-hy-label) " (page d’accueil)";
        background: var(--site-primary-dark);
      }
      /* Barre « Section masquée » : contour plein, étiquette alignée sur la barre */
      .hy-editing [data-hy-hidden] { cursor: pointer; }
      .hy-editing [data-hy-hidden]:hover {
        outline-style: solid;
        background: var(--site-soft);
      }
      .hy-editing [data-hy-hidden]:hover::after {
        content: "👁 Afficher " attr(data-hy-label);
        top: 50%;
        transform: translateY(-50%);
      }
    `;

    function onMessage(event: MessageEvent) {
      const data = event.data as {
        type?: string;
        index?: number;
        vars?: Record<string, string>;
        ambiance?: string;
      } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "hy:hello") {
        editorOrigin = event.origin;
        editorWindow = event.source as Window;
        if (!style.isConnected) document.head.appendChild(style);
        document.documentElement.classList.add("hy-editing");
        // Accusé de réception : l'éditeur cesse de ré-annoncer (l'hydratation
        // du site peut suivre de plusieurs secondes l'événement load de l'iframe)
        editorWindow.postMessage({ type: "hy:ready" }, editorOrigin);
        return;
      }
      if (event.origin !== editorOrigin) return;
      if (data.type === "hy:focus" && typeof data.index === "number") {
        document
          .querySelector(`[data-hy-section="${data.index}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // Prévisualisation du panneau Style : applique les variables du thème
      // sur le conteneur du site sans attendre la publication
      if (data.type === "hy:theme" && data.vars && typeof data.vars === "object") {
        const root = document.querySelector<HTMLElement>("[data-ambiance]");
        if (!root) return;
        for (const [key, value] of Object.entries(data.vars)) {
          if (key.startsWith("--") && typeof value === "string") {
            root.style.setProperty(key, value);
          }
        }
        if (typeof data.ambiance === "string") root.dataset.ambiance = data.ambiance;
      }
    }

    function onClick(event: MouseEvent) {
      if (!editorWindow || !editorOrigin) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-hy-section], [data-hy-shared]",
      );
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const hidden = target.hasAttribute("data-hy-hidden");
      const shared = target.getAttribute("data-hy-shared");
      if (shared) {
        editorWindow.postMessage({ type: "hy:select", shared, hidden }, editorOrigin);
        return;
      }
      const index = Number(target.getAttribute("data-hy-section"));
      if (!Number.isInteger(index)) return;
      editorWindow.postMessage({ type: "hy:select", index, hidden }, editorOrigin);
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      style.remove();
      document.documentElement.classList.remove("hy-editing");
    };
  }, []);

  return null;
}
