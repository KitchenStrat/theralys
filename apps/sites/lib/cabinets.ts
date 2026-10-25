import type { SiteCabinet, SiteTheme } from "@theralys/shared";

/**
 * Cabinets supplémentaires saisis dans les paramètres du studio
 * (praticiens multi-cabinets) : seuls ceux qui ont un nom et une adresse
 * sont affichés (hero, section Contact, pied de page).
 */
export function visibleCabinets(theme: Pick<SiteTheme, "cabinets">): SiteCabinet[] {
  return (theme.cabinets ?? []).filter((c) => c.name.trim() && c.address.trim());
}

/** « 12 rue des Lices, 81000 Albi » — sans la partie ville si elle est vide. */
export function cabinetAddressLine(cabinet: SiteCabinet): string {
  const cityPart = `${cabinet.postalCode} ${cabinet.city}`.trim();
  return cityPart ? `${cabinet.address}, ${cityPart}` : cabinet.address;
}

/** Lien Google Maps construit sur le nom et l'adresse du cabinet. */
export function cabinetMapsUrl(cabinet: SiteCabinet): string {
  const query = [cabinet.name, cabinet.address, `${cabinet.postalCode} ${cabinet.city}`.trim()]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
