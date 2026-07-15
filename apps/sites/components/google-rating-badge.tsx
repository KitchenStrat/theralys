export function GoogleRatingBadge({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "inline-flex items-center gap-3 rounded-2xl bg-[var(--site-text)] px-4 py-3 text-white shadow-lg"
      }
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.7 6.6 19.6l1.1-6L3.2 9.4l6.1-.8L12 3z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        <span className="block text-lg font-bold leading-tight">{formatRating(rating)}/5</span>
        <span className="block text-sm opacity-80">avis google</span>
      </span>
    </div>
  );
}

function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1).replace(".", ",");
}
