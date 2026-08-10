"use client";

/**
 * Carrousel d'avis façon widget Google : cartes avec photo de profil (ou
 * pastille initiale colorée), étoiles or, badge « vérifié », logo G officiel,
 * texte tronqué avec « Lire la suite » et flèches de navigation.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type GoogleReviewCard = {
  id: string;
  authorName: string;
  authorPhotoUrl: string | null;
  rating: number;
  /** Date relative pré-calculée côté serveur (« il y a 3 semaines ») ou null. */
  dateLabel: string | null;
  text: string;
};

const GOOGLE_GOLD = "#fbbc04";
const GOOGLE_BLUE = "#4285f4";
/** Palette des pastilles d'initiales, proche des couleurs de profil Google. */
const AVATAR_COLORS = [
  "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3",
  "#00acc1", "#00897b", "#43a047", "#fb8c00", "#8d6e63", "#546e7a",
];

export function GoogleStars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.max(0, Math.min(Math.round(rating), 5));
  return (
    <span
      aria-label={`${rating} étoiles sur 5`}
      className={`inline-flex leading-none tracking-[0.08em] ${className}`}
      style={{ color: GOOGLE_GOLD }}
    >
      {"★".repeat(full)}
      <span className="opacity-30">{"★".repeat(5 - full)}</span>
    </span>
  );
}

/** Logo « G » officiel Google (4 couleurs). */
export function GoogleG({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Google">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Badge bleu « avis vérifié » affiché après les étoiles, comme sur Google. */
function VerifiedBadge() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-label="Avis vérifié">
      <circle cx="12" cy="12" r="10" fill={GOOGLE_BLUE} />
      <path fill="#fff" d="M10.6 16.2l-3.6-3.6 1.4-1.4 2.2 2.2 5-5 1.4 1.4z" />
    </svg>
  );
}

function ReviewAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const color = AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function ReviewCard({ review }: { review: GoogleReviewCard }) {
  const [expanded, setExpanded] = useState(false);
  const truncatable = review.text.length > 160;
  return (
    <figure className="relative w-[22rem] shrink-0 snap-start rounded-[var(--r-lg)] bg-[var(--site-surface)] p-7 shadow-sm sm:w-[24rem]">
      <GoogleG className="absolute right-6 top-6 h-6 w-6" />
      <figcaption className="flex min-w-0 items-center gap-3 pr-10">
        <ReviewAvatar name={review.authorName} photoUrl={review.authorPhotoUrl} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{review.authorName}</span>
          <span className="block text-sm opacity-60">{review.dateLabel ?? "Avis Google"}</span>
        </span>
      </figcaption>
      <p className="mt-3 flex items-center gap-1.5">
        <GoogleStars rating={review.rating} className="text-[1.1rem]" />
        <VerifiedBadge />
      </p>
      <blockquote
        className={`mt-3 text-[1.02rem] leading-relaxed opacity-85 ${expanded ? "" : "line-clamp-4"}`}
      >
        {review.text}
      </blockquote>
      {truncatable ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium opacity-60 transition hover:opacity-90"
        >
          {expanded ? "Masquer" : "Lire la suite"}
        </button>
      ) : null}
    </figure>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Avis précédents" : "Avis suivants"}
      className={`absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-700 shadow-md transition sm:flex ${
        direction === "prev" ? "-left-3" : "-right-3"
      } ${disabled ? "cursor-default opacity-0" : "hover:scale-105"}`}
    >
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${direction === "prev" ? "rotate-180" : ""}`}>
        <path fill="currentColor" d="M8.6 5l7 7-7 7-1.4-1.4L12.8 12 7.2 6.4z" />
      </svg>
    </button>
  );
}

export function GoogleReviewsCarousel({ reviews }: { reviews: GoogleReviewCard[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanPrev(track.scrollLeft > 8);
    setCanNext(track.scrollLeft < track.scrollWidth - track.clientWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows]);

  const scrollByCard = (sign: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: sign * step, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <ArrowButton direction="prev" disabled={!canPrev} onClick={() => scrollByCard(-1)} />
      <ArrowButton direction="next" disabled={!canNext} onClick={() => scrollByCard(1)} />
      <div
        ref={trackRef}
        onScroll={updateArrows}
        style={{ scrollbarWidth: "none" }}
        className="flex snap-x gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}
