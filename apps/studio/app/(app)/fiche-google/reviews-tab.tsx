"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, FieldHint, Segmented, Spinner } from "@theralys/ui";
import { GOOGLE_REPLY_MAX, GOOGLE_REVIEW_TOPICS, type GoogleReviewSentiment } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import {
  REVIEW_FILTERS,
  filterReviews,
  hasOwnerReply,
  reviewGoogleUrl,
  type GoogleReviewView,
  type ReviewFilter,
  type ReviewsSummary,
} from "@/lib/google/reviews";
import { analyzeReviews } from "./actions";
import { Stars } from "./stars";

/** Avis affichés par page (« Voir plus »). */
const PAGE_SIZE = 10;

const SENTIMENT: Record<GoogleReviewSentiment, { label: string; tone: "success" | "warning" | "danger" }> = {
  positif: { label: "Positif", tone: "success" },
  mitige: { label: "Mitigé", tone: "warning" },
  negatif: { label: "Négatif", tone: "danger" },
};

export function ReviewsTab({
  reviews,
  summary,
  placeId,
}: {
  reviews: GoogleReviewView[];
  summary: ReviewsSummary;
  placeId: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewFilter>("tous");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => filterReviews(reviews, filter), [reviews, filter]);
  const visible = filtered.slice(0, shown);

  function analyze() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await analyzeReviews();
      if (result.error) {
        setError(result.error);
        return;
      }
      const analyzed = result.analyzed ?? 0;
      setMessage(
        analyzed === 0
          ? "Aucun nouvel avis à analyser."
          : `${analyzed} avis analysé${analyzed > 1 ? "s" : ""} : réponses proposées prêtes à copier.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Vos avis en un coup d&apos;œil</h2>
            <p className="mt-1 text-sm text-ink-500">
              {summary.total} avis synchronisé{summary.total > 1 ? "s" : ""}
              {summary.average !== null ? ` · note moyenne ${summary.average.toLocaleString("fr-FR")}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button onClick={analyze} disabled={pending || reviews.length === 0}>
              {pending ? <Spinner className="text-white" /> : null} Analyser les nouveaux avis
              {summary.unanalyzed > 0 ? ` (${summary.unanalyzed})` : ""}
            </Button>
            <FieldHint>Sentiment, thèmes et réponse proposée — vous la collez vous-même sur Google.</FieldHint>
          </div>
        </div>

        {summary.total > 0 ? (
          <div className="mt-5 grid gap-6 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Répartition des notes</h3>
              <ul className="mt-2 space-y-1.5" aria-label="Répartition des notes">
                {summary.distribution.map((d) => (
                  <li key={d.rating} className="flex items-center gap-2 text-xs text-ink-700">
                    <span className="w-6 shrink-0 text-right">{d.rating} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
                      <span
                        className="block h-full rounded-full bg-warning-500"
                        style={{ width: `${d.share}%` }}
                        role="img"
                        aria-label={`${d.count} avis à ${d.rating} étoiles`}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Taux de réponse</h3>
              <p className="mt-2 text-3xl font-semibold text-ink-900">
                {summary.responseRate === null ? "—" : `${summary.responseRate} %`}
              </p>
              <p className="text-xs text-ink-500">
                {summary.answered} avis avec réponse sur {summary.total}
                {summary.negative > 0 ? ` · ${summary.negative} négatif${summary.negative > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Thèmes les plus cités</h3>
              {summary.topTopics.length === 0 ? (
                <p className="mt-2 text-xs text-ink-500">Disponibles après l&apos;analyse des avis.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Thèmes les plus cités">
                  {summary.topTopics.map((t) => (
                    <li key={t.id}>
                      <Badge tone="primary">
                        {t.label} <strong>{t.count}</strong>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
            Aucun avis synchronisé pour l&apos;instant. Ils arrivent avec la première synchronisation de votre fiche.
          </p>
        )}
        {message ? (
          <p className="mt-3 text-sm text-success-500" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger-500" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {reviews.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              aria-label="Filtrer les avis"
              options={REVIEW_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setShown(PAGE_SIZE);
              }}
              className="inline-flex"
            />
            <p className="text-sm text-ink-500" aria-live="polite">
              {filtered.length} avis
            </p>
          </div>

          {visible.length === 0 ? (
            <Card className="p-8 text-center text-sm text-ink-500">Aucun avis dans ce filtre.</Card>
          ) : (
            <ul className="space-y-4" aria-label="Avis">
              {visible.map((review) => (
                <li key={review.id}>
                  <ReviewCard review={review} placeId={placeId} />
                </li>
              ))}
            </ul>
          )}

          {filtered.length > shown ? (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Voir plus d&apos;avis ({filtered.length - shown} restants)
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Photo d'auteur acceptée : Google (googleusercontent) ou pastille data:URI de démo ; sinon initiale. */
function safeAvatar(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".googleusercontent.com") ? url : null;
  } catch {
    return null;
  }
}

function topicLabel(id: string): string {
  return GOOGLE_REVIEW_TOPICS.find((t) => t.id === id)?.label ?? id;
}

function ReviewCard({ review, placeId }: { review: GoogleReviewView; placeId: string | null }) {
  const avatar = safeAvatar(review.authorPhotoUrl);
  const answered = hasOwnerReply(review);
  const googleUrl = reviewGoogleUrl(review.reviewUrl, placeId);
  const sentiment = review.analysis ? SENTIMENT[review.analysis.sentiment] : null;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        {avatar ? (
          <img src={avatar} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700"
          >
            {review.authorName.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink-900">{review.authorName}</p>
            <p className="text-xs text-ink-500">{review.reviewedAt ? formatDayFr(review.reviewedAt, "day") : "Date inconnue"}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars rating={review.rating} />
            {sentiment ? <Badge tone={sentiment.tone}>{sentiment.label}</Badge> : null}
            {review.analysis?.topics.map((topic) => (
              <Badge key={topic} tone="neutral">
                {topicLabel(topic)}
              </Badge>
            ))}
            {answered ? <Badge tone="info">Répondu</Badge> : <Badge tone="warning">Sans réponse</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{review.text}</p>
        </div>
      </div>

      {answered ? (
        <div className="mt-4 rounded-2xl bg-cream-50 p-4 text-sm">
          <p className="font-medium text-ink-900">
            Votre réponse{review.ownerRepliedAt ? ` · ${formatDayFr(review.ownerRepliedAt, "day")}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-ink-700">{review.ownerReply}</p>
        </div>
      ) : (
        <ReplyEditor reviewId={review.id} suggested={review.analysis?.suggestedReply ?? ""} googleUrl={googleUrl} />
      )}
    </Card>
  );
}

/** Réponse proposée, modifiable, à copier puis coller sur Google (Harmony ne publie pas). */
function ReplyEditor({ reviewId, suggested, googleUrl }: { reviewId: string; suggested: string; googleUrl: string | null }) {
  const [text, setText] = useState(suggested);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `reply-${reviewId}`;

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible — sélectionnez le texte et copiez-le manuellement.");
    }
  }

  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        Réponse proposée
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, GOOGLE_REPLY_MAX))}
        maxLength={GOOGLE_REPLY_MAX}
        rows={4}
        placeholder={
          suggested === ""
            ? "Lancez « Analyser les nouveaux avis » pour obtenir une réponse proposée, ou rédigez la vôtre ici."
            : undefined
        }
        aria-describedby={`${id}-count`}
        className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-count`} className={clsx("text-xs", text.length >= GOOGLE_REPLY_MAX ? "text-danger-500" : "text-ink-500")}>
          {text.length} / {GOOGLE_REPLY_MAX} caractères
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copy} disabled={text.trim() === ""}>
            {copied ? "✓ Réponse copiée !" : "Copier"}
          </Button>
          {googleUrl ? (
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
            >
              Répondre sur Google ↗<span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
