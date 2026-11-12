"use client";

import { clsx } from "clsx";
import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { META_LIBRARY_BULK_MAX } from "@theralys/shared";
import { selectionLabel } from "@/lib/meta-ads/market-view";
import type { GalleryMode } from "./market-card";
import { FOCUS_RING_INVERSE, Icon } from "./market-icons";
import type { MarketToast } from "./use-market-library";

/** Durée d'affichage du bandeau (ms) ; le survol et le focus la suspendent. */
const TOAST_MS = 8000;

/** Commande posée sur une barre foncée : pilule de 36 px (44 px au doigt), anneau de focus blanc. */
const BAR_BUTTON = clsx("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-ds-body font-semibold text-white ds-press pointer-coarse:min-h-11", FOCUS_RING_INVERSE);

/**
 * Bandeau du bas : confirmation d'un geste (avec « Annuler » quand il peut
 * être défait) ou message d'échec. Se referme seul après quelques secondes.
 *
 * Il flotte au-dessus du contenu, dans la zone de lecture : au-dessus de la
 * barre basse de la coquille (mobile et tablette, 64 px), et centré sur la
 * zone de contenu — à droite de la barre latérale (280 px) — à partir de
 * 1 024 px.
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-5 lg:pl-[296px]">
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
            "pointer-events-auto flex max-w-full items-center gap-2 rounded-ds-md py-2.5 pr-2 pl-4 text-sm text-white shadow-ds-pop ds-rise sm:gap-3 sm:text-ds-body",
            toast.tone === "error" ? "bg-ds-danger-700" : "bg-ds-ink-900",
          )}
        >
          {/* Le ton se lit aussi à l'icône : coche pour une confirmation, alerte pour un échec */}
          {toast.tone === "error" ? <TriangleAlert size={18} aria-hidden className="shrink-0" /> : <Check size={18} strokeWidth={2.5} aria-hidden className="hidden shrink-0 sm:block" />}
          <span className="min-w-0 py-1">{toast.message}</span>
          {toast.undo ? (
            <button type="button" data-testid="meta-toast-undo" onClick={toast.undo} className={clsx(BAR_BUTTON, "shrink-0 bg-white/15 hover:bg-white/25")}>
              <Icon name="undo" className="size-4" />
              Annuler
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le message"
            className={clsx("grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-white/15 pointer-coarse:size-11", FOCUS_RING_INVERSE)}
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Barre du mode sélection, collée en bas de la galerie : compteur et gestes
 * groupés. Collée au-dessus de la barre basse de la coquille sous 1 024 px.
 */
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
  const button = clsx(BAR_BUTTON, "disabled:cursor-not-allowed disabled:opacity-55");
  return (
    <div className="pointer-events-none sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 mt-4 flex justify-center lg:bottom-4">
      <div data-testid="meta-bulk-bar" role="toolbar" aria-label="Actions sur la sélection" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-ds-md bg-ds-ink-900 px-2 py-2 text-white shadow-ds-pop ds-rise sm:pl-4">
        <p className="basis-full px-2 text-center text-ds-body font-medium ds-tnum sm:mr-1 sm:basis-auto sm:px-0" aria-live="polite">
          {none ? "Touchez les annonces à sélectionner" : selectionLabel(count)}
          {count >= META_LIBRARY_BULK_MAX ? <span className="font-normal"> (maximum par action)</span> : null}
        </p>
        {mode === "veille" ? (
          <>
            <button type="button" data-testid="meta-bulk-keep" onClick={onKeep} disabled={none} className={clsx(button, "bg-ds-brand-600 hover:bg-ds-brand-700")}>
              <Icon name="bookmark" filled className="size-4" />
              Garder
            </button>
            <button type="button" data-testid="meta-bulk-dismiss" onClick={onDismiss} disabled={none} className={clsx(button, "bg-white/15 hover:bg-ds-danger-600")}>
              <Icon name="trash" className="size-4" />
              Supprimer
            </button>
          </>
        ) : (
          <button type="button" data-testid="meta-bulk-unkeep" onClick={onRemove} disabled={none} className={clsx(button, "bg-white/15 hover:bg-ds-danger-600")}>
            <Icon name="bookmark" className="size-4" />
            Retirer de ma bibliothèque
          </button>
        )}
        <button type="button" data-testid="meta-bulk-cancel" onClick={onCancel} className={clsx(button, "font-medium hover:bg-white/15")}>
          Annuler
        </button>
      </div>
    </div>
  );
}
