"use client";

import { clsx } from "clsx";
import { useEffect, type ReactNode } from "react";

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
};

const SIZES: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, children, footer, size, wide }: ModalProps) {
  const resolvedSize: ModalSize = size ?? (wide ? "lg" : "md");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "max-h-[90vh] w-full overflow-y-auto rounded-card bg-white shadow-pop",
          SIZES[resolvedSize],
        )}
      >
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
      </div>
    </div>
  );
}
