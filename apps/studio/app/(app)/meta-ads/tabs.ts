/** Onglets de la section « Meta Ads » (partagés par la page serveur et le client). */

export const META_TABS = [
  { id: "diagnostic", label: "Diagnostic" },
  { id: "marche", label: "Marché" },
  { id: "annonces", label: "Annonces" },
  { id: "plan", label: "Plan et ciblage" },
  { id: "parametrage", label: "Paramétrage et suivi" },
] as const;
export type MetaTab = (typeof META_TABS)[number]["id"];

export function isMetaTab(value: unknown): value is MetaTab {
  return META_TABS.some((t) => t.id === value);
}

export function metaTabHref(tab: MetaTab): string {
  return `/meta-ads?onglet=${tab}`;
}
