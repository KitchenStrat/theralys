"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@theralys/ui";
import { getImpersonationUrl } from "./actions";

/** Ouvre le studio du client dans sa session (mode support, jeton 2 min). */
export function OpenStudioButton({ siteId }: { siteId: string }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      title={error ? "Impossible d'ouvrir le studio" : "Ouvrir le studio du client (mode support)"}
      onClick={() => {
        // Fenêtre ouverte de façon synchrone (dans le geste utilisateur),
        // sinon le bloqueur de popups avale l'ouverture après l'await.
        const popup = window.open("about:blank", "_blank");
        startTransition(async () => {
          setError(false);
          const result = await getImpersonationUrl(siteId);
          if ("url" in result && popup) {
            popup.location.href = result.url;
          } else {
            popup?.close();
            setError(true);
          }
        });
      }}
      className="inline-flex items-center gap-1 rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-cream-100 disabled:opacity-50"
    >
      {busy ? <Spinner className="h-3 w-3" /> : "🛟"} Studio
    </button>
  );
}
