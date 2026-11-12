"use client";

import type { AnalysisSiteNotice as Notice } from "@/lib/google-ads/analysis-site";

/**
 * Avertissement en tête de section (Google Ads et Meta Ads) quand l'analyse
 * affichée a été préparée pour un autre site que celui sur lequel les outils
 * s'appuient aujourd'hui : le praticien a connecté ou retiré son site depuis.
 * Il invite à relancer l'analyse ; `onRelaunch` mène à l'onglet Diagnostic,
 * où se trouve le bouton (absent quand cet onglet est déjà affiché).
 */
export function AnalysisSiteNotice({ notice, onRelaunch }: { notice: Notice; onRelaunch?: () => void }) {
  return (
    <div role="note" className="mt-6 rounded-2xl bg-warning-100 px-5 py-4 text-sm text-ink-900" data-testid="analysis-site-notice">
      <p className="font-semibold">{notice.title}</p>
      <p className="mt-1">{notice.detail}</p>
      {onRelaunch ? (
        <button type="button" onClick={onRelaunch} className="mt-2 font-medium text-primary-700 underline">
          Aller au diagnostic pour relancer l&apos;analyse →
        </button>
      ) : null}
    </div>
  );
}
