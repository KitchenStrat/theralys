import { describe, expect, it } from "vitest";
import { metaReadinessChecks, type MetaAdsCheckId, type MetaAdsDiagnosticInput } from "@theralys/shared";
import { metaCheckLink } from "./checks";

const INPUT: MetaAdsDiagnosticInput = {
  profession: "Sophrologue",
  city: "Albi",
  hasBookingUrl: false,
  hasPhone: false,
  hasPixel: false,
  cookieBanner: false,
  photosCount: 0,
  facebookUrl: null,
  instagramUrl: null,
  motifPages: 0,
  profile: { linked: false, rating: null, votes: null },
  market: null,
};

const linksOf = (externalSite: boolean): Record<string, string> =>
  Object.fromEntries(metaReadinessChecks({ ...INPUT, ...(externalSite ? { externalSite: true } : {}) }).map((check) => [check.id, metaCheckLink(check.id, externalSite)]));

describe("metaCheckLink — où régler un point du diagnostic", () => {
  it("bilan du site Harmony : ce qui tient au site se règle dans l'éditeur (inchangé)", () => {
    expect(linksOf(false)).toEqual({
      pixel: "tab",
      cookie_banner: "editor",
      facebook_page: "editor",
      instagram: "editor",
      booking: "editor",
      phone: "editor",
      photos: "editor",
      reviews: "fiche",
      profile_linked: "fiche",
      landing_pages: "editor",
    });
  });

  it("bilan du site du client : plus aucun lien vers l'éditeur, « Mon site » à la place", () => {
    const links = linksOf(true);
    expect(Object.values(links)).not.toContain("editor");
    const site: MetaAdsCheckId[] = ["cookie_banner", "facebook_page", "instagram", "booking", "phone", "photos", "landing_pages"];
    for (const id of site) expect(links[id]).toBe("site");
    // Le Pixel renvoie au pas-à-pas de l'onglet Paramétrage et suivi, les avis à la fiche Google
    expect(links.pixel).toBe("tab");
    expect(links.reviews).toBe("fiche");
    expect(links.profile_linked).toBe("fiche");
  });
});
