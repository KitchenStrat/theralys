/**
 * Résultats des annonces payantes sur 30 jours : visites, clics RDV et appels
 * venus d'une source donnée (`meta_ads` pour la section Meta Ads). Version
 * locale du studio, même logique que `summarizeAdsResults` de
 * `@theralys/analytics` (qui gagne un paramètre `source` au lot E, développé
 * en parallèle) : à remplacer par l'import du paquet à l'intégration.
 */

import type { AnalyticsSource } from "@theralys/shared";

export type PaidResultEvent = { type: string; visitorId: string | null; source: string | null };

export type PaidResults = {
  /** Visiteurs distincts si des identifiants existent, sinon pages vues */
  visits: number;
  rdvClicks: number;
  callClicks: number;
  unit: "visitors" | "views";
};

/**
 * Seuls les événements de la source demandée comptent. Visites : un visiteur
 * identifié compte une fois, chaque page vue sans identifiant compte pour une ;
 * l'unité est `visitors` dès qu'un identifiant existe. Les clics sont comptés
 * par événement, même sans identifiant.
 */
export function summarizePaidResults(events: PaidResultEvent[], source: AnalyticsSource): PaidResults {
  const ids = new Set<string>();
  let anonymous = 0;
  let rdvClicks = 0;
  let callClicks = 0;
  for (const e of events) {
    if (e.source !== source) continue;
    if (e.type === "pageview") {
      if (e.visitorId) ids.add(e.visitorId);
      else anonymous++;
    } else if (e.type === "rdv_click") rdvClicks++;
    else if (e.type === "call_click") callClicks++;
  }
  return { visits: ids.size + anonymous, rdvClicks, callClicks, unit: ids.size > 0 ? "visitors" : "views" };
}
