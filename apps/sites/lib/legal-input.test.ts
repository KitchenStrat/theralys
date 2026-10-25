import { describe, expect, it } from "vitest";
import type { Section } from "@theralys/shared";
import { buildLegalInput, legalAddress, type LegalSiteInput } from "./legal-input";

const UPDATED = new Date("2026-10-25T12:00:00Z");

const SITE: LegalSiteInput = {
  name: "Claire Dupont, sophrologue à Albi",
  bookingUrl: "https://calendly.com/demo",
  updatedAt: UPDATED,
  theme: {
    legal: { siret: "123 456 789 00012", legalForm: "Entrepreneur individuel" },
    tracking: { googleAnalyticsId: "G-ABCDEF1234" },
    cabinets: [
      { name: "Cabinet du centre", address: "3 place du Vigan", postalCode: "81000", city: "Albi" },
    ],
  },
};

const PRACTITIONER = {
  firstName: "Claire",
  lastName: "Dupont",
  profession: "Sophrologue",
  googleAddress: "14 rue de la Berbie, 81000 Albi",
};

const HOME: Section[] = [
  { type: "hero", title: "Accueil", paragraphs: [] },
  {
    type: "contact",
    title: "Informations",
    address: "5 rue du Contact, 81000 Albi",
    phone: "06 39 98 01 23",
    email: "claire@exemple.fr",
  },
];

describe("legalAddress — replis d'adresse", () => {
  it("privilégie la fiche Google", () => {
    expect(legalAddress(PRACTITIONER, SITE.theme, HOME)).toBe("14 rue de la Berbie, 81000 Albi");
  });

  it("sans fiche Google, prend le premier cabinet « adresse, CP ville »", () => {
    expect(legalAddress({ ...PRACTITIONER, googleAddress: null }, SITE.theme, HOME)).toBe(
      "3 place du Vigan, 81000 Albi",
    );
    expect(legalAddress(null, SITE.theme, HOME)).toBe("3 place du Vigan, 81000 Albi");
  });

  it("ignore un cabinet incomplet (sans nom ou sans adresse)", () => {
    const theme = {
      cabinets: [{ name: "", address: "3 place du Vigan", postalCode: "81000", city: "Albi" }],
    };
    expect(legalAddress(null, theme, HOME)).toBe("5 rue du Contact, 81000 Albi");
  });

  it("sinon l'adresse de la section Contact de l'accueil, sinon null", () => {
    expect(legalAddress({ ...PRACTITIONER, googleAddress: "  " }, {}, HOME)).toBe(
      "5 rue du Contact, 81000 Albi",
    );
    expect(legalAddress(null, {}, [{ type: "contact", title: "Contact" }])).toBeNull();
    expect(legalAddress(null, {}, null)).toBeNull();
  });
});

describe("buildLegalInput", () => {
  it("assemble praticien, coordonnées de l'accueil, informations légales et suivi", () => {
    const input = buildLegalInput({
      site: SITE,
      siteUrl: "https://claire-dupont.fr",
      practitioner: PRACTITIONER,
      homeSections: HOME,
    });
    expect(input).toEqual({
      siteName: "Claire Dupont, sophrologue à Albi",
      siteUrl: "https://claire-dupont.fr",
      practitioner: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue" },
      address: "14 rue de la Berbie, 81000 Albi",
      phone: "06 39 98 01 23",
      email: "claire@exemple.fr",
      legal: { siret: "123 456 789 00012", legalForm: "Entrepreneur individuel" },
      tracking: { googleAnalyticsId: "G-ABCDEF1234" },
      bookingUrl: "https://calendly.com/demo",
      updatedAt: UPDATED,
    });
  });

  it("sans prospect relié, le nom du site tient lieu d'éditeur", () => {
    const input = buildLegalInput({
      site: { ...SITE, theme: {} },
      siteUrl: "https://claire-dupont.fr",
      practitioner: null,
      homeSections: null,
    });
    expect(input.practitioner).toEqual({
      firstName: "Claire Dupont, sophrologue à Albi",
      lastName: "",
      profession: "praticien bien-être",
    });
    expect(input.address).toBeNull();
    expect(input.phone).toBeNull();
    expect(input.email).toBeNull();
    expect(input.legal).toBeNull();
    expect(input.tracking).toBeNull();
  });

  it("téléphone et e-mail vides deviennent null", () => {
    const input = buildLegalInput({
      site: SITE,
      siteUrl: "https://claire-dupont.fr",
      practitioner: PRACTITIONER,
      homeSections: [{ type: "contact", title: "Contact", phone: "  ", email: "" }],
    });
    expect(input.phone).toBeNull();
    expect(input.email).toBeNull();
  });
});
