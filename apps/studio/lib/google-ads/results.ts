/**
 * Résultats des annonces sur 30 jours : visites, clics RDV et appels venus
 * des annonces Google (source `google_ads` uniquement). Version locale du
 * studio, même signature que `summarizeAdsResults` de `@theralys/analytics`
 * (lot E, développé en parallèle) : à remplacer par l'import du paquet à
 * l'intégration.
 */

export type AdsResultEvent = { type: string; visitorId: string | null; source: string | null };

export type AdsResults = {
  /** Visiteurs distincts si des identifiants existent, sinon pages vues */
  visits: number;
  rdvClicks: number;
  callClicks: number;
  unit: "visitors" | "views";
};

const ADS_SOURCE = "google_ads";

/**
 * Seuls les événements de source `google_ads` comptent. Visites : un visiteur
 * identifié compte une fois, chaque page vue sans identifiant compte pour une ;
 * l'unité est `visitors` dès qu'un identifiant existe.
 */
export function summarizeAdsResults(events: AdsResultEvent[]): AdsResults {
  const ids = new Set<string>();
  let anonymous = 0;
  let rdvClicks = 0;
  let callClicks = 0;
  for (const e of events) {
    if (e.source !== ADS_SOURCE) continue;
    if (e.type === "pageview") {
      if (e.visitorId) ids.add(e.visitorId);
      else anonymous++;
    } else if (e.type === "rdv_click") rdvClicks++;
    else if (e.type === "call_click") callClicks++;
  }
  return { visits: ids.size + anonymous, rdvClicks, callClicks, unit: ids.size > 0 ? "visitors" : "views" };
}
