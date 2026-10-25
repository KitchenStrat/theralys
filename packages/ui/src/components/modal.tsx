"use client";

import { clsx } from "clsx";
import { useEffect, useRef, type ReactNode } from "react";

export type ModalSize = "md" | "lg" | "xl";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Largeur : md (max-w-lg, défaut), lg (max-w-2xl), xl (max-w-4xl) */
  size?: ModalSize;
  /** Hérité : équivalent de `size="lg"` */
  wide?: boolean;
  /**
   * Sans en-tête ni pied ni marges : le contenu dessine sa propre structure
   * (bandeau, progression, boutons) — assistants « Paramètres » du studio.
   * `title` reste le nom accessible de la boîte.
   */
  plain?: boolean;
};

const SIZES: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Éléments focalisables rendus (les `sr-only` en font partie, pas les `display: none`). */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * Boîte de dialogue modale : focus placé dans la boîte à l'ouverture, Tab et
 * Maj+Tab bouclent sur ses éléments, Échap et le clic hors ferment, le focus
 * revient à l'élément déclencheur à la fermeture.
 */
export function Modal({ open, onClose, title, children, footer, size, wide, plain }: ModalProps) {
  const resolvedSize: ModalSize = size ?? (wide ? "lg" : "md");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus initial et restitution : indépendants de `onClose` (souvent une fonction fléchée recréée à chaque rendu)
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (e.key !== "Tab" || !dialog) return;
      const items = focusablesIn(dialog);
      const active = document.activeElement;
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!(active instanceof Node) || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          "max-h-[90vh] w-full overflow-y-auto bg-white focus:outline-none",
          // Assistants « plain » (paramètres du blog / réseaux sociaux) : boîte plus ronde et ombre portée
          plain ? "rounded-3xl shadow-2xl" : "rounded-card shadow-pop",
          SIZES[resolvedSize],
        )}
      >
        {plain ? (
          children
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-full p-1 text-ink-500 hover:bg-cream-200"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
            {footer ? (
              <div className="flex justify-end gap-3 border-t border-cream-200 px-6 py-4">{footer}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
