import { describe, expect, it } from "vitest";
import type { GoogleReviewAnalysis } from "@theralys/shared";
import { filterReviews, reviewGoogleUrl, summarizeReviews } from "./reviews";

function analysis(sentiment: GoogleReviewAnalysis["sentiment"], topics: GoogleReviewAnalysis["topics"]): GoogleReviewAnalysis {
  return {
    sentiment,
    topics,
    suggestedReply: "Merci pour votre retour.",
    generatedAt: "2026-10-26T09:00:00.000Z",
    generator: "mock",
    voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
  };
}

const REVIEWS = [
  { rating: 5, ownerReply: "Merci !", analysis: analysis("positif", ["accueil", "ecoute"]) },
  { rating: 5, ownerReply: null, analysis: analysis("positif", ["ecoute", "douceur"]) },
  { rating: 4, ownerReply: "  ", analysis: null },
  { rating: 3, ownerReply: null, analysis: analysis("mitige", ["tarifs", "ecoute"]) },
  { rating: 1, ownerReply: null, analysis: null },
];

describe("summarizeReviews", () => {
  it("répartition, moyenne, taux de réponse, thèmes et compteurs", () => {
    const summary = summarizeReviews(REVIEWS);
    expect(summary.total).toBe(5);
    expect(summary.average).toBe(3.6);
    expect(summary.distribution.map((d) => [d.rating, d.count, d.share])).toEqual([
      [5, 2, 40],
      [4, 1, 20],
      [3, 1, 20],
      [2, 0, 0],
      [1, 1, 20],
    ]);
    // Une réponse vide ne compte pas
    expect(summary.answered).toBe(1);
    expect(summary.responseRate).toBe(20);
    expect(summary.analyzed).toBe(3);
    expect(summary.unanalyzed).toBe(2);
    expect(summary.negative).toBe(1);
    expect(summary.topTopics).toEqual([
      { id: "ecoute", label: "Écoute", count: 3 },
      { id: "accueil", label: "Accueil", count: 1 },
      { id: "douceur", label: "Douceur", count: 1 },
      { id: "tarifs", label: "Tarifs", count: 1 },
    ]);
  });

  it("sans avis : valeurs nulles plutôt que NaN", () => {
    const summary = summarizeReviews([]);
    expect(summary.average).toBeNull();
    expect(summary.responseRate).toBeNull();
    expect(summary.distribution.every((d) => d.count === 0 && d.share === 0)).toBe(true);
    expect(summary.topTopics).toEqual([]);
  });

  it("les notes hors 1..5 sont ramenées dans la plage", () => {
    expect(summarizeReviews([{ rating: 7, ownerReply: null, analysis: null }]).distribution[0]!.count).toBe(1);
  });
});

describe("filterReviews", () => {
  it("sans réponse / négatifs (note ≤ 2 ou sentiment négatif)", () => {
    const negativeSentiment = { rating: 3, ownerReply: null, analysis: analysis("negatif", []) };
    const all = [...REVIEWS, negativeSentiment];
    expect(filterReviews(all, "tous")).toHaveLength(6);
    expect(filterReviews(all, "sans_reponse")).toHaveLength(5);
    expect(filterReviews(all, "negatifs")).toEqual([REVIEWS[4], negativeSentiment]);
  });
});

describe("reviewGoogleUrl", () => {
  it("accepte les hôtes Google en HTTPS, sinon la page des avis de la fiche", () => {
    expect(reviewGoogleUrl("https://www.google.com/maps/reviews/abc", "ChIJ123")).toBe("https://www.google.com/maps/reviews/abc");
    expect(reviewGoogleUrl("https://search.google.com/local/reviews?placeid=x", null)).toBe(
      "https://search.google.com/local/reviews?placeid=x",
    );
    expect(reviewGoogleUrl("http://www.google.com/maps", "ChIJ123")).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJ123",
    );
    expect(reviewGoogleUrl("https://evil.example/google.com", "ChIJ123")).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJ123",
    );
    expect(reviewGoogleUrl("javascript:alert(1)", "ChIJ123")).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJ123",
    );
    expect(reviewGoogleUrl(null, "mock-claire-dupont-albi")).toBe(
      "https://search.google.com/local/reviews?placeid=mock-claire-dupont-albi",
    );
    expect(reviewGoogleUrl(null, "bad id with spaces")).toBeNull();
    expect(reviewGoogleUrl(null, null)).toBeNull();
  });
});
