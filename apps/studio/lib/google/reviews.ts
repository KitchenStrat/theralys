/**
 * Avis Google de la section « Fiche Google » : synthèse (répartition des
 * notes, taux de réponse, thèmes les plus cités), filtres et lien « Répondre
 * sur Google » — fonctions pures, testées sans base.
 */

import { GOOGLE_REVIEW_TOPICS, type GoogleReviewAnalysis, type GoogleReviewTopic } from "@theralys/shared";

/** Avis tel que la page le reçoit (projection sérialisable d'une ligne `google_reviews`). */
export type GoogleReviewView = {
  id: string;
  authorName: string;
  authorPhotoUrl: string | null;
  /** 1..5 */
  rating: number;
  text: string;
  /** ISO 8601 */
  reviewedAt: string | null;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  reviewUrl: string | null;
  analysis: GoogleReviewAnalysis | null;
};

export type ReviewsSummary = {
  total: number;
  /** Note moyenne sur les avis connus (1 décimale), null sans avis */
  average: number | null;
  /** Nombre d'avis par note, 5 → 1 */
  distribution: { rating: 1 | 2 | 3 | 4 | 5; count: number; share: number }[];
  /** Avis avec une réponse du praticien */
  answered: number;
  /** Taux de réponse 0..100, null sans avis */
  responseRate: number | null;
  /** Avis analysés (IA) */
  analyzed: number;
  /** Avis sans analyse (bouton « Analyser les nouveaux avis ») */
  unanalyzed: number;
  negative: number;
  /** Thèmes les plus cités dans les analyses (≤ 5), avec leur libellé */
  topTopics: { id: GoogleReviewTopic; label: string; count: number }[];
};

export type ReviewFilter = "tous" | "sans_reponse" | "negatifs";

export const REVIEW_FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "sans_reponse", label: "Sans réponse" },
  { id: "negatifs", label: "Négatifs" },
];

export function isReviewFilter(value: unknown): value is ReviewFilter {
  return REVIEW_FILTERS.some((f) => f.id === value);
}

/** Un avis a une réponse quand `ownerReply` est non vide. */
export function hasOwnerReply(review: Pick<GoogleReviewView, "ownerReply">): boolean {
  return (review.ownerReply ?? "").trim() !== "";
}

/** Négatif : note ≤ 2, ou sentiment « negatif » de l'analyse. */
export function isNegative(review: Pick<GoogleReviewView, "rating" | "analysis">): boolean {
  return review.rating <= 2 || review.analysis?.sentiment === "negatif";
}

export function filterReviews<T extends Pick<GoogleReviewView, "rating" | "analysis" | "ownerReply">>(
  reviews: T[],
  filter: ReviewFilter,
): T[] {
  if (filter === "sans_reponse") return reviews.filter((r) => !hasOwnerReply(r));
  if (filter === "negatifs") return reviews.filter(isNegative);
  return reviews;
}

export function summarizeReviews(reviews: Pick<GoogleReviewView, "rating" | "ownerReply" | "analysis">[]): ReviewsSummary {
  const total = reviews.length;
  const counts = new Map<number, number>();
  const topics = new Map<GoogleReviewTopic, number>();
  let answered = 0;
  let analyzed = 0;
  let negative = 0;
  let sum = 0;
  for (const review of reviews) {
    const rating = Math.min(5, Math.max(1, Math.round(review.rating)));
    counts.set(rating, (counts.get(rating) ?? 0) + 1);
    sum += rating;
    if (hasOwnerReply(review)) answered += 1;
    if (review.analysis) {
      analyzed += 1;
      for (const topic of review.analysis.topics) topics.set(topic, (topics.get(topic) ?? 0) + 1);
    }
    if (isNegative(review)) negative += 1;
  }
  const distribution = ([5, 4, 3, 2, 1] as const).map((rating) => {
    const count = counts.get(rating) ?? 0;
    return { rating, count, share: total === 0 ? 0 : Math.round((count / total) * 100) };
  });
  const labelOf = (id: GoogleReviewTopic) => GOOGLE_REVIEW_TOPICS.find((t) => t.id === id)?.label ?? id;
  const topTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, count]) => ({ id, label: labelOf(id), count }));
  return {
    total,
    average: total === 0 ? null : Math.round((sum / total) * 10) / 10,
    distribution,
    answered,
    responseRate: total === 0 ? null : Math.round((answered / total) * 100),
    analyzed,
    unanalyzed: total - analyzed,
    negative,
    topTopics,
  };
}

/** Hôtes Google acceptés pour le lien « Répondre sur Google » (liste blanche). */
const GOOGLE_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com", "search.google.com", "business.google.com", "maps.app.goo.gl", "g.page"]);

/**
 * Lien vers l'avis sur Google : `reviewUrl` s'il pointe vers un hôte Google
 * en HTTPS, sinon la page des avis de la fiche (`placeid`), sinon null (fiche
 * non reliée).
 */
export function reviewGoogleUrl(reviewUrl: string | null, placeId: string | null): string | null {
  if (reviewUrl) {
    try {
      const url = new URL(reviewUrl);
      if (url.protocol === "https:" && GOOGLE_HOSTS.has(url.hostname.toLowerCase())) return url.toString();
    } catch {
      // URL invalide : repli ci-dessous
    }
  }
  if (placeId && /^[A-Za-z0-9_:-]{3,200}$/.test(placeId)) {
    return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;
  }
  return null;
}
