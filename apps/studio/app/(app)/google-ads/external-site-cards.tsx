"use client";

import { clsx } from "clsx";
import { ArrowRight, ChartColumn, ExternalLink, Globe, House, RefreshCw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, LinkButton } from "@/components/ds";
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
import { CheckBadge, CheckMark, FinePrint, Notice, TEXT_LINK } from "./ads-ui";

/**
 * Blocs de l'onglet « Paramétrage & suivi » quand les annonces mènent au site
 * du client (Google Ads et Meta Ads). Le studio ne peut rien installer sur un
 * site qu'il n'héberge pas : à la place du formulaire de suivi, le relevé de
 * la dernière lecture du site et l'endroit où poser la balise ; à la place du
 * bloc « Résultats », où lire chaque chiffre.
 *
 * Les couleurs suivent la section de la page qui les affiche (Cobalt pour
 * Google Ads, Iris pour Meta Ads) : aucune n'est fixée ici.
 */

/** Les trois états d'un constat, dits en un mot à côté de leur pictogramme. */
const FINDING_LABEL: Record<TrackingFindingStatus, string> = {
  ok: "Repéré",
  todo: "Non repéré",
  unknown: "À vérifier",
};

/** Fond de la ligne : il appuie le statut, que le pictogramme et le mot disent déjà. */
const FINDING_BOX: Record<TrackingFindingStatus, string> = {
  ok: "bg-ds-success-100/50 ring-ds-success-600/25",
  todo: "bg-ds-warning-100/60 ring-ds-warning-500/35",
  unknown: "bg-ds-ink-50 ring-ds-ink-200",
};

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
    <Card data-testid="external-tracking">
      <CardHeader icon={ScanSearch} title={title} description={intro} />

      <h3 className="mt-6 text-base font-semibold text-ds-ink-900">{codeRead ? "Ce que la dernière lecture de votre site a relevé" : "Ce que nous savons de votre site"}</h3>
      {codeRead ? null : (
        <Notice tone="warning" className="mt-2" data-testid="external-code-unread">
          {CODE_UNREAD_NOTE}
        </Notice>
      )}
      <ul className="mt-3 space-y-2" aria-label={codeRead ? "Relevé de la dernière lecture de votre site" : "Ce que nous savons de votre site"}>
        {findings.map((finding) => (
          <li
            key={finding.id}
            className={clsx("flex items-start gap-3.5 rounded-ds-md px-3.5 py-3 ring-1", FINDING_BOX[finding.status])}
            data-testid={`external-finding-${finding.id}`}
            data-status={finding.status}
          >
            <CheckMark state={finding.status} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              {/* Petit écran : le statut passe toujours sous le libellé */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <p className="text-base font-semibold text-ds-ink-900 max-sm:basis-full">{finding.label}</p>
                <CheckBadge state={finding.status}>{FINDING_LABEL[finding.status]}</CheckBadge>
              </div>
              <p className="mt-0.5 text-ds-body text-ds-ink-700">{finding.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {codeRead ? (
        <Notice icon={RefreshCw} className="mt-3">
          {REREAD_REMINDER}{" "}
          <Link href={MON_SITE_HREF} className={`${TEXT_LINK} whitespace-nowrap`}>
            Ouvrir Mon site
          </Link>
        </Notice>
      ) : null}

      <h3 className="mt-6 text-base font-semibold text-ds-ink-900">{adviceTitle}</h3>
      {advice.possible ? (
        <p className="mt-1.5 text-base text-ds-ink-700" data-testid="external-install-advice">
          {tagInstallIntro(advice)} {advice.text}
        </p>
      ) : (
        <Notice tone="warning" className="mt-2" data-testid="external-install-advice">
          {tagInstallIntro(advice)} {advice.text}
        </Notice>
      )}

      {codeRead ? <FinePrint className="mt-5 border-t border-ds-ink-200 pt-4">{READING_LIMIT}</FinePrint> : null}
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
    <Card data-testid="external-results">
      <CardHeader icon={ChartColumn} title="Résultats" description={EXTERNAL_RESULTS.reason} />
      <h3 className="mt-6 text-base font-semibold text-ds-ink-900">Où regarder</h3>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        <li className="flex flex-col items-start gap-3 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
          <span aria-hidden className="grid size-9 place-items-center rounded-[0.625rem] bg-white text-ds-section-accent shadow-sm">
            <ChartColumn size={18} />
          </span>
          <p className="text-ds-body text-ds-ink-700">{account}</p>
          <LinkButton href={accountLink.href} external variant="secondary" size="sm" className="mt-auto" iconRight={<ExternalLink size={16} aria-hidden />}>
            {accountLink.label}
          </LinkButton>
        </li>
        <li className="flex flex-col items-start gap-3 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
          <span aria-hidden className="grid size-9 place-items-center rounded-[0.625rem] bg-white text-ds-section-accent shadow-sm">
            <House size={18} />
          </span>
          <p className="text-ds-body text-ds-ink-700">
            {EXTERNAL_RESULTS.site}
            {measureSnippet ? null : ` ${EXTERNAL_RESULTS.measureMissing}`}
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            <LinkButton href="/" variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden />}>
              Ouvrir l&apos;accueil
            </LinkButton>
            {measureSnippet ? null : (
              <LinkButton href={MON_SITE_HREF} variant="secondary" size="sm" icon={<Globe size={16} aria-hidden />}>
                Ouvrir Mon site
              </LinkButton>
            )}
          </div>
        </li>
      </ul>
    </Card>
  );
}
