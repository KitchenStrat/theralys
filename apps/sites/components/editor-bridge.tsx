"use client";

import { useEffect } from "react";

/**
 * Pont avec l'éditeur du studio, actif uniquement quand le site est affiché
 * dans l'iframe de l'éditeur ET que celui-ci s'est annoncé par postMessage
 * (`hy:hello`). Hors éditeur, ce composant ne fait rien.
 *
 * Protocole :
 *  - reçu  `hy:hello`            → active le mode édition (surbrillance)
 *  - émis  `hy:select {index}`   → clic du praticien sur une section
 *  - reçu  `hy:focus {index}`    → défilement vers une section
 */
export function EditorBridge() {
  useEffect(() => {
    if (window.self === window.top) return;

    let editorOrigin: string | null = null;
    let editorWindow: Window | null = null;

    const style = document.createElement("style");
    style.textContent = `
      .hy-editing [data-hy-section] { position: relative; }
      .hy-editing [data-hy-section]:hover {
        outline: 2px dashed var(--site-primary);
        outline-offset: -2px;
        cursor: pointer;
      }
      .hy-editing [data-hy-section]:hover::after {
        content: "✎ Modifier cette section";
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
      }
    `;

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; index?: number } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "hy:hello") {
        editorOrigin = event.origin;
        editorWindow = event.source as Window;
        document.head.appendChild(style);
        document.documentElement.classList.add("hy-editing");
        return;
      }
      if (event.origin !== editorOrigin) return;
      if (data.type === "hy:focus" && typeof data.index === "number") {
        document
          .querySelector(`[data-hy-section="${data.index}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function onClick(event: MouseEvent) {
      if (!editorWindow || !editorOrigin) return;
      const target = (event.target as HTMLElement).closest("[data-hy-section]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(target.getAttribute("data-hy-section"));
      editorWindow.postMessage({ type: "hy:select", index }, editorOrigin);
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
