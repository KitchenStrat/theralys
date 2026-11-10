"use client";

import { clsx } from "clsx";
import { useEffect, useRef } from "react";
import { META_LIBRARY_BULK_MAX } from "@theralys/shared";
import { selectionLabel } from "@/lib/meta-ads/market-view";
import type { GalleryMode } from "./market-card";
import { Icon } from "./market-icons";
import type { MarketToast } from "./use-market-library";

/** Durée d'affichage du bandeau (ms) ; le survol et le focus la suspendent. */
const TOAST_MS = 8000;

/**
 * Bandeau du bas : confirmation d'un geste (avec « Annuler » quand il peut
 * être défait) ou message d'échec. Se referme seul après quelques secondes.
 */
export function MarketToastBar({ toast, onClose }: { toast: MarketToast | null; onClose: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = toast?.key ?? null;

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function start() {
    stop();
    timer.current = setTimeout(onClose, TOAST_MS);
  }

  // Un nouveau message relance le délai ; l'ancien minuteur (même relancé au survol) est toujours annulé
  useEffect(() => {
    if (key === null) return;
    timer.current = setTimeout(onClose, TOAST_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [key, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-5 md:pl-[296px]">
      {toast ? (
        <div
          key={toast.key}
          data-testid="meta-toast"
          role={toast.tone === "error" ? "alert" : "status"}
          onMouseEnter={stop}
          onMouseLeave={start}
          onFocus={stop}
          onBlur={start}
          className={clsx(
            "mg-toast pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl py-2.5 pl-4 pr-2 text-sm shadow-pop",
            toast.tone === "error" ? "bg-danger-500 text-white" : "bg-ink-900 text-white",
          )}
        >
          <span className="min-w-0 py-1">{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              data-testid="meta-toast-undo"
              onClick={toast.undo}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Icon name="undo" className="h-4 w-4" />
              Annuler
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le message"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Barre du mode sélection, collée en bas de la galerie : compteur et gestes groupés. */
export function BulkBar({
  mode,
  count,
  onKeep,
  onDismiss,
  onRemove,
  onCancel,
}: {
  mode: GalleryMode;
  count: number;
  onKeep: () => void;
  onDismiss: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const none = count === 0;
  const button = clsx("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white");
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
      <div data-testid="meta-bulk-bar" role="toolbar" aria-label="Actions sur la sélection" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-2xl bg-ink-900 py-2 pl-4 pr-2 text-white shadow-pop">
        <p className="mr-1 text-sm font-medium tabular-nums" aria-live="polite">
          {none ? "Touchez les annonces à sélectionner" : selectionLabel(count)}
          {count >= META_LIBRARY_BULK_MAX ? <span className="font-normal text-white/70"> (maximum par action)</span> : null}
        </p>
        {mode === "veille" ? (
          <>
            <button type="button" data-testid="meta-bulk-keep" onClick={onKeep} disabled={none} className={clsx(button, "bg-primary-500 text-white hover:bg-primary-400")}>
              <Icon name="bookmark" filled className="h-4 w-4" />
              Garder
            </button>
            <button type="button" data-testid="meta-bulk-dismiss" onClick={onDismiss} disabled={none} className={clsx(button, "bg-white/15 text-white hover:bg-danger-500")}>
              <Icon name="trash" className="h-4 w-4" />
              Supprimer
            </button>
          </>
        ) : (
          <button type="button" data-testid="meta-bulk-unkeep" onClick={onRemove} disabled={none} className={clsx(button, "bg-white/15 text-white hover:bg-danger-500")}>
            <Icon name="bookmark" className="h-4 w-4" />
            Retirer de ma bibliothèque
          </button>
        )}
        <button type="button" data-testid="meta-bulk-cancel" onClick={onCancel} className={clsx(button, "font-medium text-white/80 hover:bg-white/10 hover:text-white")}>
          Annuler
        </button>
      </div>
    </div>
  );
}
