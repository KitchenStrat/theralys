"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DemoFormCard } from "./demo-form";

/**
 * La demande de démo, à portée de main : tout bouton « démo » de la page
 * (un lien vers `#demo`) ouvre cette fenêtre au lieu de faire défiler jusqu'au
 * formulaire du bas de page. Sans JavaScript, ou dans un navigateur sans
 * `<dialog>`, les mêmes liens mènent au formulaire du bas : rien n'est perdu.
 *
 * `<dialog>` natif : le focus reste dans la fenêtre, Échap la ferme, le reste
 * de la page est inerte. La page ne défile pas dessous (règle `html:has(…)`
 * de `globals.css`).
 */
export function DemoDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Une demande envoyée puis la fenêtre refermée : la suivante repart d'un formulaire neuf
  const [session, setSession] = useState(0);

  useEffect(() => {
    // En phase de capture : avant le défilement en douceur des liens internes, qui laisse alors la main
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href="#demo"]');
      const box = dialog.current;
      if (!link || !box || typeof box.showModal !== "function") return;
      event.preventDefault();
      if (box.open) return;
      opener.current = link;
      box.showModal();
      // À la souris ou au clavier, la saisie commence tout de suite ; au doigt, le clavier ne masque pas la fenêtre d'emblée
      if (window.matchMedia("(pointer: fine)").matches) box.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      else box.querySelector<HTMLElement>("[data-demo-title]")?.focus();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  function close() {
    dialog.current?.close();
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Demander ma démo gratuite"
      data-testid="demo-fenetre"
      className="demo-dialog"
      // Un clic sur le voile (hors de la carte) referme
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => {
        // La demande est partie : la prochaine ouverture repart de zéro
        if (dialog.current?.querySelector('[data-demo-step]:not([data-demo-step="form"])')) setSession((current) => current + 1);
        opener.current?.focus({ preventScroll: true });
      }}
    >
      <div className="relative p-6 sm:p-8">
        <button type="button" onClick={close} aria-label="Fermer" className="focus-ring absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full text-ink-700 hover:bg-cream-100">
          <X size={22} aria-hidden />
        </button>
        <DemoFormCard
          key={session}
          idPrefix="fenetre"
          onClose={close}
          title={
            <div className="pr-10">
              <h2 data-demo-title tabIndex={-1} className="font-display text-2xl leading-tight font-bold text-ink-900 outline-none">
                Votre démo gratuite
              </h2>
              <p className="mt-1.5 leading-relaxed text-ink-700">Sans engagement. Nous préparons un site pour votre pratique et votre ville.</p>
            </div>
          }
        />
      </div>
    </dialog>
  );
}
