import { describe, expect, it } from "vitest";
import { summarizePaidResults } from "./results";

describe("summarizePaidResults", () => {
  it("ne compte que la source demandée : visiteurs distincts, clics RDV et appels", () => {
    const result = summarizePaidResults(
      [
        { type: "pageview", visitorId: "a", source: "meta_ads" },
        { type: "pageview", visitorId: "a", source: "meta_ads" },
        { type: "pageview", visitorId: "b", source: "meta_ads" },
        { type: "pageview", visitorId: null, source: "meta_ads" },
        { type: "rdv_click", visitorId: "a", source: "meta_ads" },
        { type: "call_click", visitorId: null, source: "meta_ads" },
        { type: "call_click", visitorId: "b", source: "meta_ads" },
        // Autres sources (Google Ads compris) et événements sans source : ignorés
        { type: "pageview", visitorId: "c", source: "google_ads" },
        { type: "rdv_click", visitorId: "c", source: "instagram" },
        { type: "pageview", visitorId: "d", source: null },
        { type: "call_click", visitorId: null, source: null },
      ],
      "meta_ads",
    );
    expect(result).toEqual({ visits: 3, rdvClicks: 1, callClicks: 2, unit: "visitors" });
  });

  it("la même fonction sert Google Ads avec sa source", () => {
    expect(
      summarizePaidResults(
        [
          { type: "pageview", visitorId: "a", source: "google_ads" },
          { type: "pageview", visitorId: "b", source: "meta_ads" },
        ],
        "google_ads",
      ),
    ).toEqual({ visits: 1, rdvClicks: 0, callClicks: 0, unit: "visitors" });
  });

  it("sans identifiant visiteur, compte les pages vues", () => {
    expect(
      summarizePaidResults(
        [
          { type: "pageview", visitorId: null, source: "meta_ads" },
          { type: "pageview", visitorId: null, source: "meta_ads" },
        ],
        "meta_ads",
      ),
    ).toEqual({ visits: 2, rdvClicks: 0, callClicks: 0, unit: "views" });
  });

  it("liste vide : zéro partout, unité « vues »", () => {
    expect(summarizePaidResults([], "meta_ads")).toEqual({ visits: 0, rdvClicks: 0, callClicks: 0, unit: "views" });
  });
});
