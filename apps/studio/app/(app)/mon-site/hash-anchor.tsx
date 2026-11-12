"use client";

import { useEffect } from "react";

/**
 * Arrivée sur l'écran par un lien qui vise une de ses cartes
 * (« /mon-site#statistiques », depuis l'accueil). Depuis que les pages du
 * studio ont un état de chargement, la navigation interne fait défiler vers
 * l'ancre au moment où la silhouette s'affiche — la carte n'existe pas
 * encore — et n'y revient plus : on restait en haut de la page. Une fois les
 * cartes montées, on y conduit donc ici. Sans effet sur un chargement direct :
 * le navigateur a déjà fait défiler au même endroit.
 */
export function HashAnchor() {
  useEffect(() => {
    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      // Ancre illisible : rien à viser
    }
    if (id !== "") document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
