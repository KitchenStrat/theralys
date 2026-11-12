"use client";

import { ArrowRight, Replace } from "lucide-react";
import { Button } from "@/components/ds";
import type { AnalysisSiteNotice as Notice } from "@/lib/google-ads/analysis-site";

/**
 * Avertissement en tête de section (Google Ads et Meta Ads) quand l'analyse
 * affichée a été préparée pour un autre site que celui sur lequel les outils
 * s'appuient aujourd'hui : le praticien a connecté ou retiré son site depuis.
 * Il invite à relancer l'analyse ; `onRelaunch` mène à l'onglet Diagnostic,
 * où se trouve le bouton (absent quand cet onglet est déjà affiché).
 *
 * Le bloc ne porte pas de marge : il se place dans la pile de la page
 * (`space-y-6`), entre l'en-tête et les onglets.
 */
export function AnalysisSiteNotice({ notice, onRelaunch }: { notice: Notice; onRelaunch?: () => void }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3.5 rounded-ds-card bg-ds-warning-100 p-4 text-ds-warning-900 ring-1 ring-ds-warning-500/45 sm:gap-4 sm:p-5"
      data-testid="analysis-site-notice"
    >
      {/* warning-500 ne porte que de l'encre foncée */}
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-ds-sm bg-ds-warning-500 text-ds-ink-900">
        <Replace size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-ds-display text-lg/7 font-bold">{notice.title}</p>
        <p className="mt-1 text-ds-body text-ds-ink-800">{notice.detail}</p>
        {onRelaunch ? (
          <Button type="button" variant="secondary" size="sm" className="mt-3" iconRight={<ArrowRight size={16} aria-hidden />} onClick={onRelaunch}>
            Aller au diagnostic pour relancer l&apos;analyse
          </Button>
        ) : null}
      </div>
    </div>
  );
}
