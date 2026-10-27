import { describe, expect, it } from "vitest";
import {
  summarizeAdsResults,
  summarizePeriod,
  summarizeSources,
  type EventLike,
  type SourceEventLike,
} from "./aggregate";
import { parseConsent } from "./consent";
import { trackEventSchema } from "./events";

function ev(type: EventLike["type"], visitorId: string | null, iso: string): EventLike {
  return { type, visitorId, occurredAt: new Date(iso) };
}

describe("summarizePeriod", () => {
  const from = new Date("2026-07-08T00:00:00Z");
  const to = new Date("2026-07-15T00:00:00Z");

  it("compte les visiteurs uniques (cookie consenti uniquement)", () => {
    const events = [
      ev("pageview", "v1", "2026-07-09T10:00:00Z"),
      ev("pageview", "v1", "2026-07-10T10:00:00Z"), // même visiteur
      ev("pageview", "v2", "2026-07-10T11:00:00Z"),
      ev("pageview", null, "2026-07-11T09:00:00Z"), // sans consentement : non compté
    ];
    const stats = summarizePeriod(events, from, to);
    expect(stats.visitors).toBe(2);
  });

  it("compte les clics RDV même sans identifiant visiteur", () => {
    const events = [
      ev("rdv_click", "v1", "2026-07-09T10:00:00Z"),
      ev("rdv_click", null, "2026-07-09T11:00:00Z"),
    ];
    expect(summarizePeriod(events, from, to).rdvClicks).toBe(2);
  });

  it("les clics sur le téléphone (call_click) ne comptent ni en clics RDV ni en visiteurs", () => {
    const events = [
      ev("call_click", "v1", "2026-07-09T10:00:00Z"),
      ev("call_click", null, "2026-07-09T11:00:00Z"),
      ev("rdv_click", "v1", "2026-07-09T12:00:00Z"),
      ev("call_click", "v2", "2026-07-02T10:00:00Z"), // période précédente
    ];
    const stats = summarizePeriod(events, from, to);
    expect(stats.rdvClicks).toBe(1);
    expect(stats.rdvClicksChangePct).toBeNull();
    expect(stats.visitors).toBe(0);
    expect(stats.daily.reduce((sum, d) => sum + d.rdvClicks, 0)).toBe(1);
  });

  it("calcule la variation vs période précédente", () => {
    const events = [
      // période précédente (1-8 juillet) : 2 visiteurs
      ev("pageview", "a", "2026-07-02T10:00:00Z"),
      ev("pageview", "b", "2026-07-03T10:00:00Z"),
      // période courante : 3 visiteurs → +50 %
      ev("pageview", "c", "2026-07-09T10:00:00Z"),
      ev("pageview", "d", "2026-07-10T10:00:00Z"),
      ev("pageview", "e", "2026-07-11T10:00:00Z"),
    ];
    expect(summarizePeriod(events, from, to).visitorsChangePct).toBe(50);
  });

  it("variation null quand la période précédente est vide", () => {
    const events = [ev("pageview", "a", "2026-07-09T10:00:00Z")];
    expect(summarizePeriod(events, from, to).visitorsChangePct).toBeNull();
  });

  it("produit une série journalière complète", () => {
    const stats = summarizePeriod([], from, to);
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily[0]?.day).toBe("2026-07-08");
    expect(stats.daily[6]?.day).toBe("2026-07-14");
  });

  it("les événements hors période sont ignorés", () => {
    const events = [ev("pageview", "x", "2026-06-01T10:00:00Z")];
    expect(summarizePeriod(events, from, to).visitors).toBe(0);
  });
});

describe("summarizeSources", () => {
  const src = (source: string | null, visitorId: string | null, type: SourceEventLike["type"] = "pageview"): SourceEventLike => ({
    type,
    visitorId,
    source,
  });

  it("compte les visiteurs uniques par source, parts en %, tri décroissant", () => {
    const summary = summarizeSources([
      src("instagram", "v1"),
      src("instagram", "v1"), // même visiteur : une seule fois
      src("instagram", "v2"),
      src("google", "v3"),
      src("direct", "v4"),
      src("instagram", "v5"),
    ]);
    expect(summary.unit).toBe("visitors");
    expect(summary.total).toBe(5);
    expect(summary.rows).toEqual([
      { source: "instagram", count: 3, share: 60 },
      { source: "google", count: 1, share: 20 },
      { source: "direct", count: 1, share: 20 },
    ]);
  });

  it("exclut les événements sans source (historique, navigation interne), les clics RDV et les valeurs inconnues", () => {
    const summary = summarizeSources([
      src(null, "v1"),
      src(null, "v2"),
      src("instagram", "v3", "rdv_click"),
      src("myspace", "v4"),
      src("facebook", "v5"),
    ]);
    expect(summary.total).toBe(1);
    expect(summary.rows).toEqual([{ source: "facebook", count: 1, share: 100 }]);
  });

  it("sans identifiant visiteur, compte les vues", () => {
    const summary = summarizeSources([src("google", null), src("google", null), src("other", null)]);
    expect(summary.unit).toBe("views");
    expect(summary.rows).toEqual([
      { source: "google", count: 2, share: 67 },
      { source: "other", count: 1, share: 33 },
    ]);
  });

  it("à égalité, suit l'ordre des sources (réseaux d'abord, accès direct et autres sites en fin)", () => {
    const summary = summarizeSources([src("other", "a"), src("direct", "b"), src("linkedin", "c"), src("google", "d")]);
    expect(summary.rows.map((r) => r.source)).toEqual(["linkedin", "google", "direct", "other"]);
  });

  it("vide sans aucune provenance", () => {
    expect(summarizeSources([])).toEqual({ total: 0, unit: "views", rows: [] });
  });

  it("ignore les clics sur le téléphone (call_click)", () => {
    expect(summarizeSources([src("google_ads", "v1", "call_click"), src("google_ads", "v2")])).toEqual({
      total: 1,
      unit: "visitors",
      rows: [{ source: "google_ads", count: 1, share: 100 }],
    });
  });
});

describe("summarizeAdsResults", () => {
  const ev = (type: SourceEventLike["type"], visitorId: string | null, source: string | null = "google_ads"): SourceEventLike => ({
    type,
    visitorId,
    source,
  });

  it("ne compte que la provenance google_ads : visiteurs distincts, clics RDV et appels par événement", () => {
    const results = summarizeAdsResults([
      ev("pageview", "v1"),
      ev("pageview", "v1"), // même visiteur, deuxième page
      ev("pageview", "v2"),
      ev("rdv_click", "v1"),
      ev("rdv_click", "v1"), // deux clics du même visiteur : deux clics
      ev("call_click", "v2"),
      ev("call_click", null), // clic sans identifiant : compté
      ev("pageview", "v3", "google"), // recherche naturelle : exclue
      ev("rdv_click", "v3", "google"),
      ev("call_click", "v4", "instagram"),
      ev("pageview", "v5", null),
      ev("rdv_click", "v6", null),
    ]);
    expect(results).toEqual({ visits: 2, rdvClicks: 2, callClicks: 2, unit: "visitors" });
  });

  it("sans identifiant visiteur, compte les pages vues", () => {
    expect(summarizeAdsResults([ev("pageview", null), ev("pageview", null), ev("rdv_click", null)])).toEqual({
      visits: 2,
      rdvClicks: 1,
      callClicks: 0,
      unit: "views",
    });
  });

  it("mélange : les visiteurs identifiés comptent une fois, les vues anonymes s'ajoutent", () => {
    expect(summarizeAdsResults([ev("pageview", "v1"), ev("pageview", "v1"), ev("pageview", null)])).toEqual({
      visits: 2,
      rdvClicks: 0,
      callClicks: 0,
      unit: "visitors",
    });
  });

  it("vide sans visite venue des annonces", () => {
    expect(summarizeAdsResults([])).toEqual({ visits: 0, rdvClicks: 0, callClicks: 0, unit: "views" });
    expect(summarizeAdsResults([ev("pageview", "v1", "direct"), ev("rdv_click", "v1", "direct")])).toEqual({
      visits: 0,
      rdvClicks: 0,
      callClicks: 0,
      unit: "views",
    });
  });
});

describe("consentement", () => {
  it("ne reconnaît que granted/denied", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    expect(parseConsent("autre")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});

describe("validation des événements entrants", () => {
  it("accepte un payload valide", () => {
    const parsed = trackEventSchema.parse({
      siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f",
      type: "pageview",
      path: "/motifs/massage-sportif",
    });
    expect(parsed.type).toBe("pageview");
  });

  it("accepte referrer et src facultatifs, bornés en longueur", () => {
    const parsed = trackEventSchema.parse({
      siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f",
      type: "pageview",
      referrer: "https://l.instagram.com/",
      src: "ig",
    });
    expect(parsed.referrer).toBe("https://l.instagram.com/");
    expect(parsed.src).toBe("ig");
    expect(
      trackEventSchema.parse({ siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f", type: "rdv_click" }).referrer,
    ).toBeUndefined();
    // Clic sur le téléphone, avec le src de session (annonce Google)
    const call = trackEventSchema.parse({
      siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f",
      type: "call_click",
      path: "/",
      src: "ads",
    });
    expect(call.type).toBe("call_click");
    expect(call.src).toBe("ads");
    expect(() =>
      trackEventSchema.parse({ siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f", type: "pageview", referrer: "x".repeat(501) }),
    ).toThrow();
    expect(() =>
      trackEventSchema.parse({ siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f", type: "pageview", src: "x".repeat(21) }),
    ).toThrow();
  });

  it("rejette un type inconnu ou un siteId invalide", () => {
    expect(() => trackEventSchema.parse({ siteId: "nope", type: "pageview" })).toThrow();
    expect(() =>
      trackEventSchema.parse({ siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f", type: "click" }),
    ).toThrow();
  });
});
