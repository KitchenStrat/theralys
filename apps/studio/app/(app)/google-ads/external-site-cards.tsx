"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { Card } from "@theralys/ui";
import {
  CODE_UNREAD_NOTE,
  EXTERNAL_RESULTS,
  MON_SITE_HREF,
  READING_LIMIT,
  REREAD_REMINDER,
  tagInstallIntro,
  type TagInstallAdvice,
  type TrackingFinding,
  type TrackingFindingStatus,
} from "@/lib/google-ads/external-tracking";

/**
 * Blocs de l'onglet « Paramétrage & suivi » quand les annonces mènent au site
 * du client (Google Ads et Meta Ads). Le studio ne peut rien installer sur un
 * site qu'il n'héberge pas : à la place du formulaire de suivi, le relevé de
 * la dernière lecture du site et l'endroit où poser la balise ; à la place du
 * bloc « Résultats », où lire chaque chiffre.
 */

const FINDING: Record<TrackingFindingStatus, { glyph: string; label: string; className: string }> = {
  ok: { glyph: "✓", label: "Repéré", className: "bg-success-100 text-success-500" },
  todo: { glyph: "!", label: "Non repéré", className: "bg-warning-100 text-warning-500" },
  unknown: { glyph: "–", label: "À vérifier", className: "bg-cream-200 text-ink-500" },
};

const linkClass = "font-medium text-primary-600 hover:underline";

/**
 * Remplace le formulaire de suivi : ce que la dernière lecture du site a
 * relevé (avec le rappel de le relire après une installation), puis où
 * installer la balise selon l'outil qui a servi à créer le site.
 */
export function ExternalTrackingCard({
  title,
  intro,
  findings,
  codeRead,
  adviceTitle,
  advice,
}: {
  title: string;
  intro: React.ReactNode;
  findings: TrackingFinding[];
  /** `false` : le praticien a collé le texte de ses pages, leur code n'a jamais été lu — le relevé ne prétend rien en dire */
  codeRead: boolean;
  /** « Où installer la balise Google », « Où installer le Pixel » */
  adviceTitle: string;
  advice: TagInstallAdvice;
}) {
  return (
    <Card className="p-6" data-testid="external-tracking">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">{intro}</p>

      <h3 className="mt-5 text-sm font-semibold text-ink-900">{codeRead ? "Ce que la dernière lecture de votre site a relevé" : "Ce que nous savons de votre site"}</h3>
      {codeRead ? null : (
        <p className="mt-1 text-sm text-ink-700" data-testid="external-code-unread">
          {CODE_UNREAD_NOTE}
        </p>
      )}
      <ul className="mt-1 divide-y divide-cream-200" aria-label={codeRead ? "Relevé de la dernière lecture de votre site" : "Ce que nous savons de votre site"}>
        {findings.map((finding) => {
          const status = FINDING[finding.status];
          return (
            <li key={finding.id} className="flex items-start gap-3 py-3" data-testid={`external-finding-${finding.id}`} data-status={finding.status}>
              <span aria-hidden className={clsx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", status.className)}>
                {status.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">
                  <span className="sr-only">{status.label} — </span>
                  {finding.label}
                </p>
                <p className="text-sm text-ink-700">{finding.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {codeRead ? (
        <p className="mt-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          {REREAD_REMINDER}{" "}
          <Link href={MON_SITE_HREF} className={clsx(linkClass, "whitespace-nowrap")}>
            Ouvrir Mon site →
          </Link>
        </p>
      ) : null}

      <h3 className="mt-5 text-sm font-semibold text-ink-900">{adviceTitle}</h3>
      <p className={clsx("mt-1 text-sm", advice.possible ? "text-ink-700" : "rounded-xl bg-warning-100 px-4 py-3 text-ink-900")} data-testid="external-install-advice">
        {tagInstallIntro(advice)} {advice.text}
      </p>

      {codeRead ? <p className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">{READING_LIMIT}</p> : null}
    </Card>
  );
}

/**
 * Remplace le bloc « Résultats » : pourquoi le studio ne rattache pas les
 * visites aux annonces sur le site du client, et où lire chaque chiffre — le
 * compte publicitaire pour les annonces, l'accueil du studio pour les visites
 * de tout le site.
 */
export function ExternalResultsCard({
  account,
  accountLink,
  measureSnippet,
}: {
  /** Où lire les résultats des annonces (phrase complète) */
  account: string;
  accountLink: { href: string; label: string };
  /** Le code de mesure du studio a été repéré sur le site : sinon l'accueil n'a rien à montrer, et le bloc le dit */
  measureSnippet: boolean;
}) {
  return (
    <Card className="p-6" data-testid="external-results">
      <h2 className="text-xl font-semibold">Résultats</h2>
      <p className="mt-1 text-sm text-ink-700">{EXTERNAL_RESULTS.reason}</p>
      <h3 className="mt-4 text-sm font-semibold text-ink-900">Où regarder</h3>
      <ul className="mt-2 space-y-3 text-sm text-ink-700">
        <li className="rounded-2xl bg-cream-50 p-3">
          <p>{account}</p>
          <p className="mt-1">
            <a href={accountLink.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {accountLink.label} ↗<span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
        </li>
        <li className="rounded-2xl bg-cream-50 p-3">
          <p>
            {EXTERNAL_RESULTS.site}
            {measureSnippet ? null : ` ${EXTERNAL_RESULTS.measureMissing}`}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className={linkClass}>
              Ouvrir l&apos;accueil →
            </Link>
            {measureSnippet ? null : (
              <Link href={MON_SITE_HREF} className={linkClass}>
                Ouvrir Mon site →
              </Link>
            )}
          </p>
        </li>
      </ul>
    </Card>
  );
}
