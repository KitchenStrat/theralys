/** Onglets de la section « Fiche Google » (partagés par la page serveur et le client). */

export const GOOGLE_TABS = [
  { id: "audit", label: "Audit" },
  { id: "visibilite", label: "Visibilité" },
  { id: "avis", label: "Avis" },
  { id: "posts", label: "Posts Google" },
] as const;
export type GoogleTab = (typeof GOOGLE_TABS)[number]["id"];

export function isGoogleTab(value: unknown): value is GoogleTab {
  return GOOGLE_TABS.some((t) => t.id === value);
}

/** Lien vers un onglet, en conservant `?mois=` (calendrier des posts). */
export function tabHref(tab: GoogleTab, month?: string): string {
  const params = new URLSearchParams();
  params.set("onglet", tab);
  if (month) params.set("mois", month);
  return `/fiche-google?${params.toString()}`;
}
