"use client";

import { useEffect, useState } from "react";

/**
 * Barre fixe du téléphone et de la tablette, sur les pages de contenu : la
 * demande de démo et le retour à l'accueil restent sous le pouce pendant toute
 * la lecture. Elle n'apparaît qu'une fois le haut de page dépassé (ses boutons
 * y sont déjà) et s'efface devant le pied de page, pour ne rien recouvrir.
 * Sur grand écran, l'en-tête fixe porte déjà ces deux chemins.
 */
export function StickyCta() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    let atFooter = false;
    const update = () => setShown(window.scrollY > 520 && !atFooter);
    const observer =
      footer && "IntersectionObserver" in window
        ? new IntersectionObserver(([entry]) => {
            atFooter = Boolean(entry?.isIntersecting);
            update();
          })
        : null;
    if (footer) observer?.observe(footer);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      data-testid="barre-demo"
      data-visible={shown}
      // Masquée, elle ne reçoit ni le focus ni les lecteurs d'écran
      inert={!shown}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-cream-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-14px_30px_-18px_rgb(12_74_110/0.45)] backdrop-blur transition-transform duration-300 motion-reduce:transition-none lg:hidden ${shown ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-2.5">
        <a href="/" data-cta="accueil" className="focus-ring inline-flex min-h-12 shrink-0 items-center rounded-full border border-primary-200 bg-white px-4 text-[0.95rem] font-semibold text-primary-800">
          Accueil
        </a>
        <a href="/#demo" data-cta="demo" className="cta focus-ring inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-primary-600 px-4 text-[0.95rem] font-semibold whitespace-nowrap text-white shadow-md shadow-black/15 active:scale-[0.98]">
          Demander ma démo gratuite
        </a>
      </div>
    </div>
  );
}
