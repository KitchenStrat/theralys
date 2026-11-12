import { describe, expect, it } from "vitest";
import { adsReadinessChecks, type GoogleAdsCheckId, type GoogleAdsDiagnosticInput } from "@theralys/shared";
import { adsCheckLink } from "./checks";

const INPUT: GoogleAdsDiagnosticInput = {
  profession: "Sophrologue",
  city: "Albi",
  hasBookingUrl: false,
  hasPhone: false,
  hasAdsTag: false,
  hasConversionLabels: false,
  motifPages: 0,
  profile: { linked: false, claimed: null, rating: null, votes: null, hasHours: null, photos: null, auditScore: null },
  benchmark: null,
  keywords: null,
  forecast: null,
};

const linksOf = (externalSite: boolean): Record<string, string> =>
  Object.fromEntries(adsReadinessChecks({ ...INPUT, ...(externalSite ? { externalSite: true } : {}) }).map((check) => [check.id, adsCheckLink(check.id, externalSite)]));

describe("adsCheckLink — où régler un point du diagnostic", () => {
  it("bilan du site Harmony : rendez-vous, téléphone et pages se règlent dans l'éditeur (inchangé)", () => {
    expect(linksOf(false)).toEqual({
      profile_linked: "fiche",
      profile_claimed: "fiche",
      booking: "editor",
      phone: "editor",
      reviews: "fiche",
      hours: "fiche",
      photos: "fiche",
      tracking_tag: "tab",
      tracking_conversions: "tab",
      landing_pages: "editor",
    });
  });

  it("bilan du site du client : plus aucun lien vers l'éditeur, « Mon site » à la place", () => {
    const links = linksOf(true);
    expect(Object.values(links)).not.toContain("editor");
    const site: GoogleAdsCheckId[] = ["booking", "phone", "landing_pages"];
    for (const id of site) expect(links[id]).toBe("site");
    // Le reste ne dépend pas du site : fiche Google et onglet Paramétrage & suivi
    expect(links.tracking_tag).toBe("tab");
    expect(links.tracking_conversions).toBe("tab");
    expect(links.reviews).toBe("fiche");
  });
});
