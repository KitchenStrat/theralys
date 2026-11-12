"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Frown,
  Meh,
  MessageSquareText,
  Reply,
  Search,
  SearchX,
  Smile,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Segmented, Select } from "@theralys/ui";
import {
  GOOGLE_REPLY_MAX,
  GOOGLE_REPLY_TONES,
  GOOGLE_REVIEW_TOPICS,
  htmlToPlainText,
  type GoogleReplyTone,
  type GoogleReviewSentiment,
} from "@theralys/shared";
import {
  AiBadge,
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  GenerationProgress,
  InlineSuccess,
  LinkButton,
  ProgressBar,
  ProgressRing,
  type TimedStep,
} from "@/components/ds";
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
import { analyzeReviews, generateReviewReply } from "./actions";
import { ErrorNote } from "./shared";
import { Stars } from "./stars";

/** Avis affichés par page (« Voir plus »). */
const PAGE_SIZE = 10;

const SENTIMENT: Record<GoogleReviewSentiment, { label: string; tone: "success" | "warning" | "danger"; icon: LucideIcon }> = {
  positif: { label: "Positif", tone: "success", icon: Smile },
  mitige: { label: "Mitigé", tone: "warning", icon: Meh },
  negatif: { label: "Négatif", tone: "danger", icon: Frown },
};

/** Étapes de l'analyse des nouveaux avis : la dernière dure jusqu'à la réponse du serveur. */
const ANALYSIS_STEPS: TimedStep[] = [
  { label: "Lecture des nouveaux avis", seconds: 4 },
  { label: "Repérage du ton et des thèmes", seconds: 10 },
  { label: "Rédaction des réponses proposées", seconds: 12 },
];

export function ReviewsTab({
  reviews,
  totalCount,
  summary,
  placeId,
  replyRemaining,
  replyTone,
  onLinkRequest,
}: {
  reviews: GoogleReviewView[];
  /** Total en base (les `reviews` sont les plus récents) */
  totalCount: number;
  summary: ReviewsSummary;
  placeId: string | null;
  /** Générations de réponse (ton choisi) restantes ce mois-ci */
  replyRemaining: number;
  /** Ton par défaut (voix du praticien) */
  replyTone: GoogleReplyTone;
  /** Fiche non reliée : ramène au champ de recherche de l'écran d'accueil */
  onLinkRequest?: () => void;
}) {
  const [remaining, setRemaining] = useState(replyRemaining);
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
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <CardHeader
            className="flex-[1_1_20rem]"
            icon={Star}
            title="Vos avis en un coup d'œil"
            description={
              <>
                {summary.total} avis synchronisé{summary.total > 1 ? "s" : ""}
                {totalCount > summary.total ? ` (les ${summary.total} plus récents sur ${totalCount})` : ""}
                {summary.average !== null ? ` · note moyenne ${summary.average.toLocaleString("fr-FR")}` : ""}
              </>
            }
          />
          <div className="flex max-w-full flex-col items-start gap-1.5 sm:items-end">
            <Button
              variant={summary.unanalyzed > 0 ? "primary" : "secondary"}
              onClick={analyze}
              loading={pending}
              disabled={reviews.length === 0}
              icon={<Sparkles size={18} aria-hidden />}
            >
              Analyser les nouveaux avis
              {summary.unanalyzed > 0 ? ` (${summary.unanalyzed})` : ""}
            </Button>
            <p className="max-w-80 text-ds-meta text-ds-ink-600 sm:text-right">
              Sentiment, thèmes et réponse proposée — vous la collez vous-même sur Google.
            </p>
          </div>
        </div>

        {pending && summary.unanalyzed > 0 ? (
          <div className="mt-5 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200 sm:p-5">
            <GenerationProgress
              icon={Sparkles}
              title="Nous analysons vos nouveaux avis"
              steps={ANALYSIS_STEPS}
              running
              hint="Ne fermez pas la page : les réponses proposées s'afficheront sous chaque avis."
            />
          </div>
        ) : null}

        {summary.total > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-7 md:grid-cols-2 xl:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="flex items-center gap-5 md:col-span-2 xl:col-span-1 xl:flex-col xl:items-start xl:justify-center xl:gap-3 xl:border-r xl:border-ds-ink-200 xl:pr-8">
              <p className="font-ds-display text-[4rem]/none font-extrabold tracking-tight text-ds-section-ink">
                {summary.average === null ? (
                  "—"
                ) : (
                  <AnimatedNumber value={summary.average} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />
                )}
              </p>
              <div className="min-w-0">
                {summary.average !== null ? <Stars rating={summary.average} size="lg" /> : null}
                <p className="mt-1 text-ds-body font-medium text-ds-ink-800">Note moyenne sur 5</p>
                <p className="text-ds-meta text-ds-ink-600">
                  sur vos {summary.total} avis synchronisé{summary.total > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="min-w-0">
              <h3 className="text-ds-body font-semibold text-ds-ink-900">Répartition des notes</h3>
              <ul className="mt-3 space-y-2.5" aria-label="Répartition des notes">
                {summary.distribution.map((d) => (
                  <li key={d.rating} className="flex items-center gap-3 text-ds-meta text-ds-ink-700">
                    <span className="flex w-8 shrink-0 items-center justify-end gap-1 font-semibold text-ds-ink-900 ds-tnum">
                      {d.rating}
                      <Star size={13} aria-hidden className="fill-ds-warning-500 text-ds-warning-700" />
                      <span className="sr-only">étoiles</span>
                    </span>
                    {/* Jauge du design system, à la couleur des étoiles */}
                    <ProgressBar
                      className="min-w-0 flex-1 [--ds-progress-track:var(--color-ds-ink-100)] [&_.ds-progress-fill]:bg-ds-warning-500 [&_.ds-progress-fill]:bg-none"
                      value={d.count}
                      max={summary.total}
                      ariaLabel={`${d.count} avis à ${d.rating} étoiles`}
                      valueText={`${d.share} % des avis`}
                      hideValueText
                    />
                    <span className="w-7 shrink-0 text-right font-semibold text-ds-ink-900 ds-tnum" aria-hidden>
                      {d.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 space-y-6">
              <div>
                <h3 className="text-ds-body font-semibold text-ds-ink-900">Taux de réponse</h3>
                <div className="mt-3 flex items-center gap-4">
                  <ProgressRing
                    value={summary.responseRate ?? 0}
                    label="Taux de réponse"
                    valueText={summary.responseRate === null ? "inconnu" : `${summary.responseRate} %`}
                    size={76}
                    thickness={8}
                  >
                    <span className="text-lg/none font-bold text-ds-ink-900 ds-tnum">
                      {summary.responseRate === null ? "—" : `${summary.responseRate} %`}
                    </span>
                  </ProgressRing>
                  <p className="min-w-0 text-ds-body text-ds-ink-700">
                    {summary.answered} avis avec réponse sur {summary.total}
                    {summary.negative > 0 ? ` · ${summary.negative} négatif${summary.negative > 1 ? "s" : ""}` : ""}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <h3 className="text-ds-body font-semibold text-ds-ink-900">Thèmes les plus cités</h3>
                  {summary.topTopics.length > 0 ? <AiBadge>Repérés par l&apos;IA</AiBadge> : null}
                </div>
                {summary.topTopics.length === 0 ? (
                  <p className="mt-2 text-ds-meta text-ds-ink-600">Disponibles après l&apos;analyse des avis.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Thèmes les plus cités">
                    {summary.topTopics.map((t) => (
                      <li key={t.id}>
                        <Badge tone="section" className="px-3 py-1.5">
                          {t.label} <strong className="font-bold ds-tnum">{t.count}</strong>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            className="mt-2"
            icon={MessageSquareText}
            title="Aucun avis synchronisé pour l'instant."
            action={
              placeId === null && onLinkRequest ? (
                <Button variant="secondary" icon={<Search size={18} aria-hidden />} onClick={onLinkRequest}>
                  Retrouver ma fiche
                </Button>
              ) : undefined
            }
          >
            Ils arrivent avec la première synchronisation de votre fiche. Vous verrez ici votre note, les thèmes qui reviennent
            et, pour chaque avis, une réponse proposée à copier.
          </EmptyState>
        )}
        {message ? <InlineSuccess className="mt-5">{message}</InlineSuccess> : null}
        {error ? <ErrorNote className="mt-5">{error}</ErrorNote> : null}
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
              className="inline-flex max-w-full bg-ds-ink-100 inset-ring inset-ring-ds-ink-200 pointer-coarse:[&>button]:min-h-11"
            />
            <p className="text-ds-body text-ds-ink-600" aria-live="polite">
              {filtered.length} avis
            </p>
          </div>

          {visible.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={SearchX}
                title="Aucun avis dans ce filtre."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilter("tous");
                      setShown(PAGE_SIZE);
                    }}
                  >
                    Voir tous les avis
                  </Button>
                }
              >
                {filter === "sans_reponse"
                  ? "Tous vos avis synchronisés ont déjà une réponse."
                  : filter === "negatifs"
                    ? "Aucun avis négatif parmi vos avis synchronisés."
                    : "Changez de filtre pour retrouver vos avis."}
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-4" aria-label="Avis">
              {/* Clé liée à l'analyse : la réponse proposée remplace le brouillon vide après « Analyser » */}
              {visible.map((review) => (
                <li key={`${review.id}:${review.analysis?.generatedAt ?? ""}`}>
                  <ReviewCard
                    review={review}
                    placeId={placeId}
                    defaultTone={review.analysis?.voice.tone ?? replyTone}
                    remaining={remaining}
                    onGenerated={setRemaining}
                  />
                </li>
              ))}
            </ul>
          )}

          {filtered.length > shown ? (
            <div className="text-center">
              <Button variant="secondary" iconRight={<ChevronDown size={18} aria-hidden />} onClick={() => setShown((n) => n + PAGE_SIZE)}>
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

function ReviewCard({
  review,
  placeId,
  defaultTone,
  remaining,
  onGenerated,
}: {
  review: GoogleReviewView;
  placeId: string | null;
  defaultTone: GoogleReplyTone;
  remaining: number;
  onGenerated: (remaining: number) => void;
}) {
  const avatar = safeAvatar(review.authorPhotoUrl);
  const answered = hasOwnerReply(review);
  const googleUrl = reviewGoogleUrl(review.reviewUrl, placeId);
  const sentiment = review.analysis ? SENTIMENT[review.analysis.sentiment] : null;
  const topics = review.analysis?.topics ?? [];
  const body = htmlToPlainText(review.text);
  return (
    <Card>
      <div className="flex items-start gap-3.5">
        {avatar ? (
          <img src={avatar} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-section-tint-2 text-base font-bold text-ds-section-ink"
          >
            {review.authorName.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-base font-semibold text-ds-ink-900">{review.authorName}</p>
            <p className="text-ds-meta text-ds-ink-600">{review.reviewedAt ? formatDayFr(review.reviewedAt, "day") : "Date inconnue"}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <Stars rating={review.rating} />
            <span className="mr-1 text-ds-meta font-semibold text-ds-ink-700 ds-tnum" aria-hidden>
              {review.rating}/5
            </span>
            {sentiment ? (
              <Badge tone={sentiment.tone} icon={sentiment.icon}>
                {sentiment.label}
              </Badge>
            ) : null}
            {answered ? (
              <Badge tone="success" icon={Check}>
                Répondu
              </Badge>
            ) : (
              <Badge tone="warning" icon={Clock}>
                Sans réponse
              </Badge>
            )}
          </div>
        </div>
      </div>

      {body ? <p className="mt-3.5 whitespace-pre-line text-base text-ds-ink-800">{body}</p> : null}

      {topics.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-ds-meta text-ds-ink-600">
          <Tag size={14} aria-hidden className="mr-0.5 shrink-0" />
          <span className="sr-only">Thèmes : </span>
          {topics.map((topic) => (
            <Badge key={topic} tone="neutral">
              {topicLabel(topic)}
            </Badge>
          ))}
        </p>
      ) : null}

      {answered ? (
        <div className="mt-4 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/60">
          <p className="flex items-center gap-2 text-ds-body font-semibold text-ds-section-ink">
            <Reply size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
            Votre réponse{review.ownerRepliedAt ? ` · ${formatDayFr(review.ownerRepliedAt, "day")}` : ""}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-ds-body text-ds-ink-700">{htmlToPlainText(review.ownerReply)}</p>
        </div>
      ) : (
        <ReplyEditor
          reviewId={review.id}
          suggested={review.analysis?.suggestedReply ?? ""}
          analyzed={review.analysis !== null}
          googleUrl={googleUrl}
          defaultTone={defaultTone}
          remaining={remaining}
          onGenerated={onGenerated}
          hasText={review.text.trim() !== ""}
        />
      )}
    </Card>
  );
}

/**
 * Réponse proposée, modifiable, à copier puis coller sur Google (Harmony ne
 * publie pas). Un avis analysé sans réponse proposée (réponse écartée par les
 * garde-fous) l'indique plutôt que d'inviter à relancer l'analyse.
 */
function ReplyEditor({
  reviewId,
  suggested,
  analyzed,
  googleUrl,
  defaultTone,
  remaining,
  onGenerated,
  hasText,
}: {
  reviewId: string;
  suggested: string;
  analyzed: boolean;
  googleUrl: string | null;
  defaultTone: GoogleReplyTone;
  remaining: number;
  onGenerated: (remaining: number) => void;
  /** Un avis « note seule » n'a rien à faire générer */
  hasText: boolean;
}) {
  const [text, setText] = useState(suggested);
  const [tone, setTone] = useState<GoogleReplyTone>(defaultTone);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  // Le texte affiché vient-il de l'IA (proposition de l'analyse ou génération à la demande) ? Marqué tant qu'il en reste
  const [fromAi, setFromAi] = useState(suggested !== "");
  const id = `reply-${reviewId}`;

  function generate() {
    setError(null);
    setCopied(false);
    startGenerating(async () => {
      const result = await generateReviewReply({ reviewId, tone });
      if (result.error) {
        setError(result.error);
        return;
      }
      setText((result.reply ?? "").slice(0, GOOGLE_REPLY_MAX));
      setFromAi(true);
      if (typeof result.remaining === "number") onGenerated(result.remaining);
    });
  }

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
    <div className="mt-4 border-t border-ds-ink-200 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <label htmlFor={id} className="block text-ds-body font-semibold text-ds-ink-900">
            Réponse proposée
          </label>
          {fromAi && text.trim() !== "" ? <AiBadge>Rédigée par l&apos;IA</AiBadge> : null}
        </div>
        {hasText ? (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <label htmlFor={`${id}-tone`} className="text-ds-meta font-medium text-ds-ink-700">
              Ton
            </label>
            <div className="shrink-0">
              <Select
                id={`${id}-tone`}
                value={tone}
                onChange={(e) => setTone(e.target.value as GoogleReplyTone)}
                disabled={generating}
                className="min-h-9 py-1.5 pointer-coarse:min-h-11"
              >
                {GOOGLE_REPLY_TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={generate}
              loading={generating}
              disabled={remaining <= 0}
              title={remaining <= 0 ? "Quota mensuel de générations atteint" : undefined}
              icon={<Sparkles size={16} aria-hidden />}
            >
              {generating ? "Rédaction…" : text.trim() === "" ? "Générer une réponse" : "Proposer une autre réponse"}
            </Button>
          </div>
        ) : null}
      </div>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, GOOGLE_REPLY_MAX))}
        maxLength={GOOGLE_REPLY_MAX}
        rows={4}
        placeholder={
          suggested !== ""
            ? undefined
            : analyzed
              ? "Pas de réponse proposée pour cet avis — rédigez la vôtre ici."
              : "Lancez « Analyser les nouveaux avis » pour obtenir une réponse proposée, ou rédigez la vôtre ici."
        }
        aria-describedby={`${id}-count`}
        className="mt-2 block w-full rounded-ds-sm border border-ds-ink-450 bg-white px-3.5 py-3 text-base text-ds-ink-900 placeholder:text-ds-ink-600"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p
          id={`${id}-count`}
          className={clsx("text-ds-meta", text.length >= GOOGLE_REPLY_MAX ? "font-medium text-ds-danger-700" : "text-ds-ink-600")}
        >
          {text.length} / {GOOGLE_REPLY_MAX} caractères
          {hasText ? ` · ${remaining} génération${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""} ce mois-ci` : ""}
        </p>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {copied ? <InlineSuccess>Réponse copiée !</InlineSuccess> : null}
          <Button variant="secondary" size="sm" onClick={copy} disabled={text.trim() === ""} icon={<Copy size={16} aria-hidden />}>
            Copier
          </Button>
          {googleUrl ? (
            <LinkButton href={googleUrl} external variant="secondary" size="sm" iconRight={<ExternalLink size={16} aria-hidden />}>
              Répondre sur Google
            </LinkButton>
          ) : null}
        </div>
      </div>
      {error ? <ErrorNote className="mt-3">{error}</ErrorNote> : null}
    </div>
  );
}
