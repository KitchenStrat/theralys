"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@theralys/shared";
import { markFeedback } from "./actions";

const BUTTON =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 pointer-coarse:min-h-11";

/** Ce qu'on peut faire d'un avis selon son état : le geste attendu d'abord, le retour en arrière ensuite. */
const MOVES: Record<FeedbackStatus, { to: FeedbackStatus; label: string; primary?: boolean }[]> = {
  new: [
    { to: "read", label: "Marquer comme lu", primary: true },
    { to: "done", label: "Pris en compte" },
  ],
  read: [
    { to: "done", label: "Pris en compte", primary: true },
    { to: "new", label: "Remettre en nouveau" },
  ],
  done: [{ to: "read", label: "Rouvrir" }],
};

/** Boutons de suivi d'un avis. L'état affiché suit la réponse du serveur. */
export function StatusButtons({ id, status }: { id: string; status: FeedbackStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(to: FeedbackStatus) {
    setError(null);
    startTransition(async () => {
      const result = await markFeedback(id, to);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {MOVES[status].map((option) => (
        <button
          key={option.to}
          type="button"
          disabled={pending}
          onClick={() => move(option.to)}
          aria-label={`${option.label} (aujourd'hui : ${FEEDBACK_STATUS_LABELS[status].toLowerCase()})`}
          className={
            option.primary
              ? `${BUTTON} border-primary-500 bg-primary-500 text-white hover:bg-primary-600`
              : `${BUTTON} border-cream-300 bg-white text-ink-700 hover:border-primary-300 hover:text-primary-700`
          }
        >
          {option.label}
        </button>
      ))}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
