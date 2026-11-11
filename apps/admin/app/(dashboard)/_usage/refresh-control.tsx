"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

/** Intervalle de rafraîchissement automatique, tant que l'onglet est visible (ms). */
const AUTO_REFRESH_MS = 60_000;

/**
 * « Actualisé à HH:MM » + bouton d'actualisation. Les chiffres sont relus
 * côté serveur (`router.refresh()`) : à la demande, puis toutes les minutes
 * tant que l'onglet est affiché — et dès son retour au premier plan si la
 * dernière lecture date de plus d'une minute.
 */
export function RefreshControl({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const lastRefresh = useRef(Date.now());

  const refresh = useCallback(() => {
    lastRefresh.current = Date.now();
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current >= AUTO_REFRESH_MS) refresh();
    };
    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return (
    <div className="flex items-center gap-2 text-xs text-ink-500">
      <span aria-live="polite" aria-atomic="true">
        Actualisé à <span className="tabular-nums">{updatedAt}</span>
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        title="Actualisation automatique toutes les minutes"
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1 font-medium text-ink-700 transition-colors hover:bg-cream-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:text-ink-500"
      >
        <svg aria-hidden viewBox="0 0 16 16" className={clsx("h-3 w-3", pending && "animate-spin")} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
          <path d="M13.5 2.5v3h-3" />
        </svg>
        {pending ? "Actualisation…" : "Actualiser"}
      </button>
    </div>
  );
}
