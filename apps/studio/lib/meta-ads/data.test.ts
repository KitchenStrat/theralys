import { describe, expect, it } from "vitest";
import { META_ADS_ANALYSIS_STALE_MINUTES } from "@theralys/jobs";
import { META_MARKET_MIN_ADS, META_MARKET_SELECTION, type MetaAdsMarket, type MetaMarketAd } from "@theralys/shared";
import { META_INTERRUPTED, META_RUNNING_STALE_MS, displayMetaStatus, marketRefreshNeeded, withRelevanceFilter } from "./data";

const NOW = new Date("2026-10-27T10:00:00Z");

describe("displayMetaStatus", () => {
  it("le seuil de péremption est celui du service (META_ADS_ANALYSIS_STALE_MINUTES)", () => {
    expect(META_RUNNING_STALE_MS).toBe(META_ADS_ANALYSIS_STALE_MINUTES * 60_000);
  });

  it("done et error sont rendus tels quels", () => {
    expect(displayMetaStatus("done", NOW, NOW)).toEqual({ status: "done", error: null });
    expect(displayMetaStatus("error", "2026-10-01T00:00:00Z", NOW)).toEqual({ status: "error", error: null });
  });

  it("une analyse en cours récente reste en cours, jusqu'au seuil inclus", () => {
    expect(displayMetaStatus("running", new Date(NOW.getTime() - 60_000), NOW)).toEqual({ status: "running", error: null });
    expect(displayMetaStatus("running", new Date(NOW.getTime() - META_RUNNING_STALE_MS), NOW)).toEqual({ status: "running", error: null });
  });

  it("une analyse en cours trop ancienne (d'après updatedAt) est affichée comme interrompue", () => {
    expect(displayMetaStatus("running", new Date(NOW.getTime() - META_RUNNING_STALE_MS - 1), NOW)).toEqual({ status: "error", error: META_INTERRUPTED });
    expect(displayMetaStatus("running", "pas une date", NOW).status).toBe("error");
  });
});

/** Annonce de la veille : un praticien (gardé par le filtre de pertinence) ou une boutique (écartée). */
function marketAd(id: string, kind: "praticien" | "boutique" = "praticien"): MetaMarketAd {
  const shop = kind === "boutique";
  return {
    id,
    pageId: `page-${id}`,
    pageName: shop ? "NutriZen" : `Sophrologue ${id}`,
    bodies: [shop ? "Livraison offerte dès 30 € : nos compléments alimentaires anti-stress, code promo ZEN10." : "Séances de sophrologie sur rendez-vous au cabinet."],
    titles: [],
    descriptions: [],
    captions: [shop ? "nutrizen-shop.fr" : "doctolib.fr"],
    libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    startedAt: "2026-09-01T00:00:00.000Z",
    stoppedAt: null,
    platforms: ["facebook"],
    languages: ["fr"],
    euTotalReach: 5_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [{ name: shop ? "France" : "Albi", type: shop ? "country" : "city", excluded: false }],
    payer: null,
    scope: "france",
    active: true,
    runningDays: 56,
    signal: "moyen",
    score: 5,
    matchedTerms: [],
  };
}

/** Veille enregistrée : `kept` annonces de praticiens et `shops` de boutique, sur `spotted` repérées. */
function market(kept: number, shops: number, spotted: number, overrides: Partial<MetaAdsMarket> = {}): MetaAdsMarket {
  return {
    version: 1,
    source: "meta",
    fetchedAt: "2026-10-01T08:00:00.000Z",
    country: "FR",
    terms: ["sophrologue"],
    scopeUsed: "france",
    counts: { ville: 0, departement: 0, region: 0, france: spotted },
    ads: [...Array.from({ length: kept }, (_, i) => marketAd(`p${i + 1}`)), ...Array.from({ length: shops }, (_, i) => marketAd(`b${i + 1}`, "boutique"))],
    calls: 6,
    truncated: false,
    insights: null,
    ...overrides,
  };
}

describe("marketRefreshNeeded : veille à rattraper d'office", () => {
  const seed = { profession: "Sophrologue" };
  const shown = (stored: MetaAdsMarket) => withRelevanceFilter(stored, seed)!;
  const needed = (stored: MetaAdsMarket, extra: Partial<Parameters<typeof marketRefreshNeeded>[0]> = {}) =>
    marketRefreshNeeded({ market: shown(stored), latestStatus: "done", providerAvailable: true, now: NOW, ...extra });

  it("veille d'avant le filtre : 60 annonces enregistrées, 12 montrées sur 701 repérées → à rattraper", () => {
    const legacy = market(12, 48, 701);
    expect(shown(legacy).ads).toHaveLength(12);
    expect(shown(legacy).filtered).toEqual({ formation: 0, commerce: 48, autre: 0 });
    expect(needed(legacy)).toBe(true);
  });

  it("le compte porte sur les annonces réellement montrées : 40 enregistrées dont 15 de boutique → 25 montrées, à rattraper ; 30 montrées → non", () => {
    expect(needed(market(25, 15, 300))).toBe(true);
    expect(needed(market(META_MARKET_MIN_ADS, 15, 300))).toBe(false);
  });

  it("jamais pendant une analyse, ni sans fournisseur de veille, ni sans veille", () => {
    const legacy = market(12, 48, 701);
    expect(needed(legacy, { latestStatus: "running" })).toBe(false);
    expect(needed(legacy, { latestStatus: "error" })).toBe(true);
    expect(needed(legacy, { providerAvailable: false })).toBe(false);
    expect(marketRefreshNeeded({ market: null, latestStatus: "done", providerAvailable: true, now: NOW })).toBe(false);
  });

  it("aucune boucle : veille aux règles courantes, tentative de moins de 24 h, ou relevé déjà montré en entier → non", () => {
    expect(needed(market(12, 0, 701, { selection: META_MARKET_SELECTION, filtered: { formation: 0, commerce: 0, autre: 0 } }))).toBe(false);
    expect(needed(market(12, 48, 701, { refreshAttemptedAt: new Date(NOW.getTime() - 3_600_000).toISOString() }))).toBe(false);
    expect(needed(market(12, 48, 701, { refreshAttemptedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() }))).toBe(true);
    expect(needed(market(12, 0, 12))).toBe(false);
  });
});
