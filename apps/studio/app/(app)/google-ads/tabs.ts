/** Onglets de la section « Google Ads » (partagés par la page serveur et le client). */

export const ADS_TABS = [
  { id: "diagnostic", label: "Diagnostic" },
  { id: "mots-cles", label: "Mots-clés" },
  { id: "plan", label: "Plan d'action" },
  { id: "parametrage", label: "Paramétrage & suivi" },
] as const;
export type AdsTab = (typeof ADS_TABS)[number]["id"];

export function isAdsTab(value: unknown): value is AdsTab {
  return ADS_TABS.some((t) => t.id === value);
}

export function adsTabHref(tab: AdsTab): string {
  return `/google-ads?onglet=${tab}`;
}
