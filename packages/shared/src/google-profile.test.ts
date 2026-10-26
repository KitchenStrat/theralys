import { describe, expect, it } from "vitest";
import {
  GOOGLE_MONTHLY_BUDGET_USD,
  aggregateCompetitors,
  auditGoogleProfile,
  benchmarkFrom,
  budgetRemainingUsd,
  captionToGoogleSummary,
  distanceKm,
  estimateScanCostUsd,
  findOwnListing,
  gridPoints,
  rankTone,
  summarizeScan,
  usageMonthKey,
  type GoogleMapsListing,
  type GoogleProfileSnapshot,
} from "./google-profile";

const center = { lat: 43.9289, lng: 2.1464 };

describe("grille de visibilité", () => {
  it("7×7 points centrés, le point central est le cabinet, ±5 km aux coins", () => {
    const points = gridPoints(center, 5);
    expect(points).toHaveLength(49);
    expect(points[24]).toEqual(center);
    expect(distanceKm(center, points[0]!)).toBeCloseTo(Math.sqrt(50), 0);
    expect(points[0]!.lat).toBeGreaterThan(center.lat);
    expect(points[0]!.lng).toBeLessThan(center.lng);
    expect(points[48]!.lat).toBeLessThan(center.lat);
  });

  it("coût estimé d'un relevé ≈ 0,10 $ ; budget restant jamais négatif", () => {
    expect(estimateScanCostUsd()).toBeCloseTo(0.098, 3);
    expect(budgetRemainingUsd(4.95)).toBeCloseTo(0.05, 4);
    expect(budgetRemainingUsd(7)).toBe(0);
    expect(GOOGLE_MONTHLY_BUDGET_USD).toBe(5);
    expect(usageMonthKey(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10");
  });

  it("résumé : part de visibilité, top 3, rang moyen", () => {
    const points = [1, 2, 3, 8, 15, null].map((rank, i) => ({ lat: i, lng: i, rank, top: [] }));
    const summary = summarizeScan(points);
    expect(summary).toMatchObject({ found: 5, total: 6, top3: 3, top10: 4 });
    expect(summary.avgRank).toBe(5.8);
    expect(summary.visibility).toBe(Math.round(((20 + 19 + 18 + 13 + 6) / 20 / 6) * 100));
    expect(rankTone(2)).toBe("top");
    expect(rankTone(9)).toBe("good");
    expect(rankTone(14)).toBe("weak");
    expect(rankTone(null)).toBe("none");
  });
});

const listing = (rank: number, title: string, cid: string, votes = 10): GoogleMapsListing => ({
  rank,
  title,
  placeId: null,
  cid,
  rating: 4.8,
  votes,
  category: "Sophrologue",
  totalPhotos: 12,
  isClaimed: true,
});

describe("concurrents", () => {
  it("le cabinet est reconnu par cid, place_id puis titre normalisé", () => {
    const l = [listing(1, "Cabinet Équilibre", "c1"), listing(2, "Claire Dupont — Sophrologue", "c2")];
    expect(findOwnListing(l, { cid: "c2" })?.rank).toBe(2);
    expect(findOwnListing(l, { title: "claire dupont" })?.rank).toBe(2);
    expect(findOwnListing(l, { title: "Inconnu" })).toBeNull();
  });

  it("agrège le podium de chaque point, hors le cabinet, trié par apparitions", () => {
    const own = { cid: "own" };
    const p1 = [listing(1, "A", "a", 40), listing(2, "Moi", "own"), listing(3, "B", "b", 20), listing(4, "C", "c")];
    const p2 = [listing(1, "B", "b", 20), listing(2, "A", "a", 40), listing(3, "C", "c", 5)];
    const competitors = aggregateCompetitors([p1, p2], own);
    expect(competitors.map((c) => c.title)).toEqual(["A", "B", "C"]);
    expect(competitors[0]).toMatchObject({ appearances: 2, avgRank: 1.5 });
    expect(competitors[2]).toMatchObject({ appearances: 1, avgRank: 3 });
    expect(benchmarkFrom(competitors).medianVotes).toBe(20);
  });
});

const snapshot: GoogleProfileSnapshot = {
  source: "dataforseo",
  fetchedAt: "2026-10-26T10:00:00Z",
  placeId: "p",
  cid: "c",
  title: "Claire Dupont Sophrologue",
  description: "x".repeat(300),
  category: "Sophrologue",
  additionalCategories: ["Praticien bien-être"],
  address: "12 rue des Lilas, Albi",
  phone: "05 63 00 00 00",
  website: "https://claire-dupont.harmony-web.fr",
  isClaimed: true,
  rating: 4.9,
  votes: 40,
  ratingDistribution: null,
  totalPhotos: 15,
  hasHours: true,
  hours: null,
  attributes: ["Sur rendez-vous", "Accès PMR", "Carte bancaire"],
  bookOnlineUrl: "https://rdv.example",
  mainImage: null,
  location: center,
};
const now = new Date("2026-10-26T12:00:00Z");

describe("audit déterministe", () => {
  it("fiche complète → score 100, grade A, aucune action", () => {
    const audit = auditGoogleProfile({
      snapshot,
      benchmark: null,
      reviews: [{ rating: 5, reviewedAt: "2026-10-01", ownerReply: "Merci" }],
      reviewsHaveOwnerReplies: true,
      site: { url: "https://claire-dupont.harmony-web.fr", hasBookingUrl: true },
      now,
    });
    expect(audit.score).toBe(100);
    expect(audit.grade).toBe("A");
    expect(audit.actions).toEqual([]);
    expect(audit.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("fiche pauvre → actions triées par impact, contrôles inconnus hors calcul", () => {
    const audit = auditGoogleProfile({
      snapshot: {
        ...snapshot,
        source: "places",
        description: null,
        phone: null,
        website: "https://doctolib.fr/x",
        isClaimed: null,
        totalPhotos: 2,
        hasHours: false,
        additionalCategories: [],
        votes: 4,
        rating: 4.2,
        bookOnlineUrl: null,
        attributes: [],
      },
      benchmark: benchmarkFrom([{ ...listing(1, "A", "a", 60), placeId: null, appearances: 3, avgRank: 1 }]),
      reviews: [],
      reviewsHaveOwnerReplies: false,
      site: { url: "https://claire-dupont.harmony-web.fr", hasBookingUrl: false },
      now,
    });
    expect(audit.score).toBeLessThan(50);
    expect(audit.grade).toBe("D");
    expect(audit.checks.find((c) => c.id === "claimed")?.status).toBe("unknown");
    expect(audit.checks.find((c) => c.id === "description")?.status).toBe("unknown");
    expect(audit.checks.find((c) => c.id === "attributes")?.status).toBe("unknown");
    expect(audit.checks.find((c) => c.id === "website")?.status).toBe("warn");
    const ids = audit.actions.map((a) => a.id);
    expect(ids.slice(0, 4)).toEqual(expect.arrayContaining(["add-phone", "add-hours", "get-reviews", "link-website"]));
    const impacts = audit.actions.map((a) => a.impact);
    const order = { fort: 0, moyen: 1, faible: 2 };
    expect(impacts.map((i) => order[i])).toEqual([...impacts.map((i) => order[i])].sort());
    expect(audit.actions.find((a) => a.id === "get-reviews")?.title).toBe("Obtenez 56 avis de plus");
  });

  it("un nom bourré de mots-clés est signalé", () => {
    const audit = auditGoogleProfile({
      snapshot: { ...snapshot, title: "Sophrologue Albi - Stress - Sommeil - Claire Dupont | Hypnose" },
      benchmark: null,
      reviews: [],
      reviewsHaveOwnerReplies: false,
      site: { url: "https://claire-dupont.harmony-web.fr", hasBookingUrl: true },
      now,
    });
    expect(audit.checks.find((c) => c.id === "title")?.status).toBe("warn");
    expect(audit.actions.some((a) => a.id === "clean-title")).toBe(true);
  });
});

describe("texte d'un post Google", () => {
  it("retire hashtags, ligne « bio » et borne la longueur", () => {
    const caption = "Un conseil simple.\n\nRespirez trois fois.\n\nPour prendre rendez-vous, le lien est dans ma bio.\n\n#Sophrologie #Albi #Bienetre";
    expect(captionToGoogleSummary(caption, "Pour prendre rendez-vous, le lien est dans ma bio.")).toBe(
      "Un conseil simple.\n\nRespirez trois fois.",
    );
    expect(captionToGoogleSummary("a".repeat(2000), "")).toHaveLength(1500);
  });
});
