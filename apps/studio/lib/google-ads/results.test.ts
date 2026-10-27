import { describe, expect, it } from "vitest";
import { summarizeAdsResults } from "./results";

describe("summarizeAdsResults", () => {
  it("ne compte que la source google_ads : visiteurs distincts, clics RDV et appels", () => {
    const result = summarizeAdsResults([
      { type: "pageview", visitorId: "a", source: "google_ads" },
      { type: "pageview", visitorId: "a", source: "google_ads" },
      { type: "pageview", visitorId: "b", source: "google_ads" },
      { type: "pageview", visitorId: null, source: "google_ads" },
      { type: "rdv_click", visitorId: "a", source: "google_ads" },
      { type: "call_click", visitorId: null, source: "google_ads" },
      { type: "call_click", visitorId: "b", source: "google_ads" },
      // Autres sources et événements sans source : ignorés
      { type: "pageview", visitorId: "c", source: "google" },
      { type: "rdv_click", visitorId: "c", source: "instagram" },
      { type: "pageview", visitorId: "d", source: null },
      { type: "call_click", visitorId: null, source: null },
    ]);
    expect(result).toEqual({ visits: 3, rdvClicks: 1, callClicks: 2, unit: "visitors" });
  });

  it("sans identifiant visiteur, compte les pages vues", () => {
    expect(
      summarizeAdsResults([
        { type: "pageview", visitorId: null, source: "google_ads" },
        { type: "pageview", visitorId: null, source: "google_ads" },
      ]),
    ).toEqual({ visits: 2, rdvClicks: 0, callClicks: 0, unit: "views" });
  });

  it("liste vide : zéro partout, unité « vues »", () => {
    expect(summarizeAdsResults([])).toEqual({ visits: 0, rdvClicks: 0, callClicks: 0, unit: "views" });
  });
});
