import { describe, expect, it } from "vitest";
import {
  buildLegalPage,
  buildLegalPages,
  configuredTrackers,
  formatSiret,
  isLegalPageSlug,
  LEGAL_PAGES,
  type LegalPageInput,
} from "./legal-pages";

const BASE: LegalPageInput = {
  siteName: "Claire Dupont, sophrologue à Albi",
  siteUrl: "https://claire-dupont.fr",
  practitioner: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue" },
  address: "12 rue des Lices, 81000 Albi",
  phone: "05 63 00 00 00",
  email: "claire@exemple.fr",
  updatedAt: new Date("2026-10-25T12:00:00Z"),
};

describe("pages légales générées", () => {
  it("trois pages aux slugs stables, reconnus par isLegalPageSlug", () => {
    expect(LEGAL_PAGES.map((p) => p.slug)).toEqual([
      "mentions-legales",
      "politique-de-confidentialite",
      "politique-de-cookies",
    ]);
    expect(isLegalPageSlug("mentions-legales")).toBe(true);
    expect(isLegalPageSlug("blog")).toBe(false);
    expect(buildLegalPages(BASE).map((p) => p.title)).toEqual([
      "Mentions légales",
      "Politique de confidentialité",
      "Politique de cookies",
    ]);
  });

  it("mentions légales : éditeur, coordonnées, hébergeur, plateforme, médiateur sur demande, date", () => {
    const { body } = buildLegalPage("mentions-legales", BASE);
    expect(body).toContain("**Éditeur :** Claire Dupont, sophrologue");
    expect(body).toContain("12 rue des Lices, 81000 Albi");
    expect(body).toContain("05 63 00 00 00");
    expect(body).toContain("claire@exemple.fr");
    expect(body).toContain("Directeur de la publication :** Claire Dupont");
    expect(body).toContain("Vercel Inc.");
    expect(body).toContain("Harmony");
    expect(body).toContain("communiquées sur simple demande");
    expect(body).toContain("Dernière mise à jour : 25 octobre 2026");
    // Sans forme juridique / SIRET / prise de RDV : lignes absentes
    expect(body).not.toContain("SIRET");
    expect(body).not.toContain("Prise de rendez-vous");
  });

  it("mentions légales : SIRET, forme juridique, médiateur, prise de RDV et complément quand renseignés", () => {
    const { body } = buildLegalPage("mentions-legales", {
      ...BASE,
      bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire",
      legal: {
        legalForm: "Entrepreneur individuel",
        siret: "12345678900012",
        registration: "ADELI 81 00 0000 0",
        email: "contact@claire-dupont.fr",
        mediatorName: "CM2C",
        mediatorUrl: "https://www.cm2c.net",
        extra: "Assurance RC professionnelle : MAIF, contrat n° 1234.",
      },
    });
    expect(body).toContain("**Forme juridique :** Entrepreneur individuel");
    expect(body).toContain("**SIRET :** 123 456 789 00012");
    expect(body).toContain("ADELI 81 00 0000 0");
    // L'e-mail des informations légales prime sur celui du contact
    expect(body).toContain("contact@claire-dupont.fr");
    expect(body).not.toContain("claire@exemple.fr");
    expect(body).toContain("Médiateur désigné : **CM2C** — https://www.cm2c.net");
    expect(body).toContain("service tiers (doctolib.fr)");
    expect(body).toContain("## Informations complémentaires\n\nAssurance RC professionnelle");
  });

  it("confidentialité : responsable, droits RGPD et CNIL, outils tiers listés seulement s'ils sont configurés", () => {
    const plain = buildLegalPage("politique-de-confidentialite", BASE).body;
    expect(plain).toContain("responsable du traitement des données collectées sur ce site est Claire Dupont, sophrologue, 12 rue des Lices");
    expect(plain).toContain("CNIL");
    expect(plain).toContain("par e-mail (claire@exemple.fr) ou par téléphone (05 63 00 00 00)");
    expect(plain).not.toContain("Outils tiers");
    const tracked = buildLegalPage("politique-de-confidentialite", {
      ...BASE,
      tracking: { googleAnalyticsId: "G-ABC12345", metaPixelId: "1234567890123" },
    }).body;
    expect(tracked).toContain("Google Analytics 4 (Google Ireland Ltd, mesure d'audience)");
    expect(tracked).toContain(
      "Meta Pixel (Meta Platforms Ireland Ltd, mesure des conversions publicitaires (clics sur la prise de rendez-vous, le téléphone et l'e-mail))",
    );
  });

  it("cookies : bandeau actif (après acceptation, lien Gérer les cookies) ou désactivé (dès l'arrivée)", () => {
    const on = buildLegalPage("politique-de-cookies", {
      ...BASE,
      tracking: { cookieBanner: true, googleTagManagerId: "GTM-ABCD123" },
    }).body;
    expect(on).toContain("**tl_consent**");
    expect(on).toContain("Google Tag Manager");
    expect(on).toContain("ne sont chargés qu'après votre acceptation");
    expect(on).toContain("Gérer les cookies");
    const off = buildLegalPage("politique-de-cookies", {
      ...BASE,
      tracking: { cookieBanner: false, googleAdsId: "AW-123456789" },
    }).body;
    expect(off).toContain("bandeau de consentement est désactivé");
    expect(off).toContain("chargés dès votre arrivée");
    expect(off).not.toContain("Gérer les cookies");
  });

  it("formatSiret : 14 ou 9 chiffres groupés, sinon valeur telle quelle", () => {
    expect(formatSiret("12345678900012")).toBe("123 456 789 00012");
    expect(formatSiret("123 456 789 00012")).toBe("123 456 789 00012");
    expect(formatSiret("123456789")).toBe("123 456 789");
    expect(formatSiret(" RCS Albi 123 ")).toBe("RCS Albi 123");
    expect(formatSiret(undefined)).toBe("");
  });

  it("configuredTrackers : un outil par identifiant renseigné, dans un ordre stable", () => {
    expect(configuredTrackers(undefined)).toEqual([]);
    expect(
      configuredTrackers({ googleAnalyticsId: "G-1", googleTagManagerId: "GTM-1", googleAdsId: "AW-1", metaPixelId: "1" }).map(
        (t) => t.name,
      ),
    ).toEqual(["Google Analytics 4", "Google Tag Manager", "Google Ads", "Meta Pixel"]);
  });
});
