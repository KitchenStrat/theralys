import type { LegalPageInput, Section, SiteTheme } from "@theralys/shared";
import { cabinetAddressLine, visibleCabinets } from "./cabinets";
import { findSection } from "./page-sections";

/** Sous-ensemble du site nécessaire aux pages légales (cf. `Site` de @theralys/db). */
export type LegalSiteInput = {
  name: string;
  bookingUrl: string | null;
  updatedAt: Date;
  theme: Pick<SiteTheme, "legal" | "tracking" | "cabinets">;
};

/** Sous-ensemble du prospect (praticien) relié au site. */
export type LegalPractitionerInput = {
  firstName: string;
  lastName: string;
  profession: string;
  googleAddress?: string | null;
};

/**
 * Adresse principale publiée dans les mentions légales : fiche Google reliée,
 * sinon premier cabinet saisi dans le studio (« adresse, CP ville »), sinon
 * l'adresse de la section Contact de l'accueil.
 */
export function legalAddress(
  practitioner: LegalPractitionerInput | null,
  theme: Pick<SiteTheme, "cabinets">,
  homeSections: Section[] | null | undefined,
): string | null {
  const google = practitioner?.googleAddress?.trim();
  if (google) return google;
  const [cabinet] = visibleCabinets(theme);
  if (cabinet) return cabinetAddressLine(cabinet);
  const contact = findSection(homeSections, "contact");
  const address = contact?.address?.trim();
  return address || null;
}

/**
 * Construit l'entrée de `buildLegalPage` à partir des données du site :
 * praticien (prospect), coordonnées de la section Contact de l'accueil,
 * informations légales et suivi du thème, lien de prise de rendez-vous.
 * Sans prospect relié (cas limite), le nom du site tient lieu d'éditeur.
 */
export function buildLegalInput(opts: {
  site: LegalSiteInput;
  siteUrl: string;
  practitioner: LegalPractitionerInput | null;
  homeSections: Section[] | null | undefined;
}): LegalPageInput {
  const { site, siteUrl, practitioner, homeSections } = opts;
  const contact = findSection(homeSections, "contact");
  return {
    siteName: site.name,
    siteUrl,
    practitioner: practitioner
      ? {
          firstName: practitioner.firstName,
          lastName: practitioner.lastName,
          profession: practitioner.profession,
        }
      : { firstName: site.name, lastName: "", profession: "praticien bien-être" },
    address: legalAddress(practitioner, site.theme, homeSections),
    phone: contact?.phone?.trim() || null,
    email: contact?.email?.trim() || null,
    legal: site.theme.legal ?? null,
    tracking: site.theme.tracking ?? null,
    bookingUrl: site.bookingUrl,
    updatedAt: site.updatedAt,
  };
}
