"use client";

import { useEffect } from "react";

/**
 * Ouvre une fenêtre quand la page est atteinte par un lien qui la vise (une
 * étape de la mise en route de l'accueil, par exemple), puis retire l'ancre
 * de l'adresse : un rechargement ou un retour arrière ne rouvre pas la fenêtre
 * que l'on vient de fermer. L'état d'historique du routeur est conservé.
 *
 * L'ancre est lue à l'arrivée sur la page, et de nouveau si elle change sans
 * que la page soit rechargée (adresse modifiée à la main).
 */
export function useOpenFromHash(hash: string, open: () => void): void {
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash !== `#${hash}`) return;
      open();
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posé une fois : `open` ne fait qu'ouvrir, quelle que soit son identité
  }, []);
}
