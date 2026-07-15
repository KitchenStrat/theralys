import { describe, expect, it } from "vitest";
import { summarizePeriod, type EventLike } from "./aggregate";
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

  it("rejette un type inconnu ou un siteId invalide", () => {
    expect(() => trackEventSchema.parse({ siteId: "nope", type: "pageview" })).toThrow();
    expect(() =>
      trackEventSchema.parse({ siteId: "3f1d4c9a-0b6e-4a1e-9f6a-2d3b4c5d6e7f", type: "click" }),
    ).toThrow();
  });
});
