"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, Spinner } from "@theralys/ui";
import {
  GOOGLE_ADS_ANALYSES_PER_MONTH,
  GOOGLE_ADS_CORE_MAX,
  type GoogleAdsBudgetEstimate,
  type GoogleAdsCheckId,
  type GoogleAdsDemand,
  type GoogleAdsDiagnostic,
  type GoogleAdsReadinessCheck,
  type GoogleAdsReadinessStatus,
  type GoogleAdsVerdict,
} from "@theralys/shared";
import type { GoogleBudget } from "@theralys/jobs";
import { formatDayFr } from "@/lib/calendar";
import type { GoogleAdsAnalysisView, GoogleAdsUsage } from "@/lib/google-ads/data";
import { launchAdsAnalysis } from "./actions";
import type { AdsSiteInfo } from "./ads-client";
import type { AdsTab } from "./tabs";

const usd = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const eur = (value: number, digits = 0) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const num = (value: number) => value.toLocaleString("fr-FR");

/** Couleurs et libellés du verdict — jetons du thème (`packages/ui/src/styles.css`). */
const VERDICT: Record<GoogleAdsVerdict, { color: string; tone: "success" | "warning" | "danger"; label: string }> = {
  go: { color: "var(--color-success-500)", tone: "success", label: "Feu vert" },
  go_with_prerequisites: { color: "var(--color-warning-500)", tone: "warning", label: "Feu vert après réglages" },
  wait: { color: "var(--color-danger-500)", tone: "danger", label: "Pas encore" },
};

const STATUS: Record<GoogleAdsReadinessStatus, { glyph: string; label: string; className: string }> = {
  ok: { glyph: "✓", label: "OK", className: "bg-success-100 text-success-500" },
  todo: { glyph: "!", label: "À faire", className: "bg-warning-100 text-warning-500" },
  unknown: { glyph: "–", label: "Inconnu", className: "bg-cream-200 text-ink-500" },
};

const STATUS_ORDER: Record<GoogleAdsReadinessStatus, number> = { todo: 0, unknown: 1, ok: 2 };

/** À faire d'abord (bloquants en tête), puis inconnus, puis OK — ordre d'origine conservé à égalité. */
export function sortChecks(checks: GoogleAdsReadinessCheck[]): GoogleAdsReadinessCheck[] {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Number(b.critical) - Number(a.critical));
}

type CheckLink = { kind: "fiche" } | { kind: "editor" } | { kind: "tab" };

/** Où régler le point : section Fiche Google, réglages du site (éditeur) ou onglet Paramétrage & suivi. */
function checkLink(id: GoogleAdsCheckId): CheckLink {
  switch (id) {
    case "profile_linked":
    case "profile_claimed":
    case "reviews":
    case "hours":
    case "photos":
      return { kind: "fiche" };
    case "tracking_tag":
    case "tracking_conversions":
      return { kind: "tab" };
    case "booking":
    case "phone":
    case "landing_pages":
      return { kind: "editor" };
  }
}

export function DiagnosticTab({
  latest,
  current,
  usage,
  budget,
  analysisCostUsd,
  site,
  onSelectTab,
}: {
  latest: GoogleAdsAnalysisView | null;
  current: GoogleAdsAnalysisView | null;
  usage: GoogleAdsUsage;
  budget: GoogleBudget;
  analysisCostUsd: number;
  site: AdsSiteInfo;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const running = pending || latest?.status === "running";
  const canLaunch = usage.analysesRemaining > 0 && budget.remainingUsd >= analysisCostUsd;
  const diagnostic = current?.diagnostic ?? null;

  function launch() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await launchAdsAnalysis();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Analyse terminée.");
      router.refresh();
    });
  }

  const subject = [site.profession, site.city].filter(Boolean).join(" à ") || "votre cabinet";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Analyse de la demande</h2>
            <p className="mt-1 text-sm text-ink-500">
              Harmony interroge les données Google Ads (recherches mensuelles, coûts par clic, concurrence) pour{" "}
              <strong className="text-ink-700">{subject}</strong>, puis vérifie que votre cabinet est prêt à investir.
            </p>
            {current ? <p className="mt-1 text-xs text-ink-500">Dernière analyse le {formatDayFr(current.createdAt, "day")}.</p> : null}
          </div>
          <Button onClick={launch} disabled={running || !canLaunch} title={!canLaunch ? "Quota ou budget du mois atteint" : undefined}>
            {running ? (
              <>
                <Spinner className="text-white" /> Analyse en cours…
              </>
            ) : current ? (
              "Actualiser l'analyse"
            ) : (
              "Lancer l'analyse"
            )}
          </Button>
        </div>
        <p className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">
          Analyses restantes ce mois-ci :{" "}
          <strong className="text-ink-700">
            {usage.analysesRemaining} sur {GOOGLE_ADS_ANALYSES_PER_MONTH}
          </strong>{" "}
          · Budget restant : <strong className="text-ink-700">{usd(budget.remainingUsd)}</strong> sur {usd(budget.budgetUsd)} · Une analyse ≈{" "}
          {usd(analysisCostUsd)}, comprise dans votre formule.
        </p>
        {running && !pending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-700" aria-live="polite">
            <Spinner /> Une analyse est en cours : les résultats s&apos;afficheront dans un instant.
          </p>
        ) : null}
        {latest?.status === "error" && latest.error ? (
          <p className="mt-3 text-sm text-danger-500" role="alert">
            La dernière analyse a échoué : {latest.error}
            {current ? " — les résultats affichés sont ceux de l'analyse précédente." : ""}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger-500" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-success-500" role="status">
            {message}
          </p>
        ) : null}
      </Card>

      {!diagnostic ? (
        <EmptyState subject={subject} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-6">
            <VerdictCard diagnostic={diagnostic} />
            <DemandCard demand={diagnostic.demand} onSelectTab={onSelectTab} />
            <BudgetCard budget={diagnostic.budget} />
          </div>
          <ChecksCard checks={diagnostic.checks} onSelectTab={onSelectTab} />
        </div>
      )}
    </div>
  );
}

function EmptyState({ subject }: { subject: string }) {
  return (
    <Card className="p-8">
      <h2 className="text-xl font-semibold">Google Ads est-il pertinent pour {subject} ?</h2>
      <p className="mt-2 text-sm text-ink-700">
        Avant de dépenser le moindre euro, l&apos;analyse répond à trois questions :
      </p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["Y a-t-il une demande ?", "Combien de personnes cherchent votre métier dans votre ville chaque mois, et à quel coût par clic."],
          ["Êtes-vous prêt ?", "Fiche Google reliée, prise de rendez-vous, téléphone, avis : ce qui transforme un clic en patient."],
          ["Quel budget ?", "Un budget mensuel conseillé, avec les clics et les prises de contact attendus."],
        ].map(([title, text], i) => (
          <li key={title} className="rounded-2xl bg-cream-50 p-4">
            <p className="font-semibold text-ink-900">
              <span className="mr-2 text-primary-600">{i + 1}.</span>
              {title}
            </p>
            <p className="mt-1 text-sm text-ink-700">{text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-500">
        Vous obtenez aussi vos mots-clés à cibler et un plan d&apos;action complet (campagne, annonces, budget). Rien n&apos;est
        publié à votre place : vous paramétrez votre compte Google Ads en suivant le tuto de l&apos;onglet Paramétrage &amp; suivi.
      </p>
    </Card>
  );
}

function VerdictCard({ diagnostic }: { diagnostic: GoogleAdsDiagnostic }) {
  const verdict = VERDICT[diagnostic.verdict];
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Verdict</h2>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <ScoreGauge score={diagnostic.score} color={verdict.color} />
        <div className="min-w-0 flex-1">
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
          <p className="mt-2 text-lg font-semibold text-ink-900">{diagnostic.headline}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-700">{diagnostic.summary}</p>
      {diagnostic.prerequisites.length > 0 ? (
        <p className="mt-3 text-xs text-ink-500">
          À régler : {diagnostic.prerequisites.join(" · ")}
        </p>
      ) : null}
    </Card>
  );
}

/** Jauge SVG du score (0..100), sans bibliothèque : cercle de fond + arc coloré selon le verdict. */
export function ScoreGauge({ score, color }: { score: number; color: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  return (
    <svg width="136" height="136" viewBox="0 0 136 136" role="img" aria-label={`Préparation ${clamped} sur 100`} className="shrink-0">
      <circle cx="68" cy="68" r={radius} fill="none" stroke="var(--color-cream-200)" strokeWidth="12" />
      <circle
        cx="68"
        cy="68"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform="rotate(-90 68 68)"
      />
      <text x="68" y="64" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--color-ink-900)">
        {clamped}
      </text>
      <text x="68" y="88" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--color-ink-500)">
        / 100
      </text>
    </svg>
  );
}

function DemandCard({ demand, onSelectTab }: { demand: GoogleAdsDemand; onSelectTab: (tab: AdsTab) => void }) {
  const cpc =
    demand.cpcMinEur === null || demand.cpcMaxEur === null
      ? "—"
      : demand.cpcMinEur === demand.cpcMaxEur
        ? eur(demand.cpcMinEur, 2)
        : `${eur(demand.cpcMinEur, 2)} – ${eur(demand.cpcMaxEur, 2)}`;
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Demande</h2>
      <p className="mt-1 text-sm text-ink-500">
        Ce que tapent vos futurs patients sur Google, d&apos;après les données Google Ads.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Recherches / mois" value={num(demand.coreMonthlySearches)} hint={`sur vos ${Math.min(demand.keywordsCount, GOOGLE_ADS_CORE_MAX)} expressions principales`} />
        <Stat label="Toutes expressions" value={num(demand.totalMonthlySearches)} hint={`${demand.keywordsCount} mot${demand.keywordsCount > 1 ? "s" : ""}-clé${demand.keywordsCount > 1 ? "s" : ""} retenu${demand.keywordsCount > 1 ? "s" : ""}`} />
        <Stat label="Coût par clic" value={cpc} hint={demand.cpcMedianEur !== null ? `médiane ${eur(demand.cpcMedianEur, 2)}` : "estimation Google Ads"} />
        <Stat label="Concurrence" value={demand.competition ? capitalize(demand.competition) : "—"} hint="entre annonceurs, sur le cœur" />
      </dl>
      <button type="button" onClick={() => onSelectTab("mots-cles")} className="mt-4 text-sm font-medium text-primary-600 hover:underline">
        Voir les mots-clés à cibler →
      </button>
    </Card>
  );
}

const BASIS_LABEL: Record<GoogleAdsBudgetEstimate["basis"], (cpc: string) => string> = {
  forecast: (cpc) => `D'après la prévision de trafic Google Ads sur vos expressions principales (coût par clic moyen ${cpc}).`,
  cpc: (cpc) => `D'après le coût par clic médian de vos expressions principales (${cpc}).`,
  none: (cpc) => `Estimation par défaut (coût par clic ${cpc}) : la demande n'a pas pu être chiffrée.`,
};

function BudgetCard({ budget }: { budget: GoogleAdsBudgetEstimate }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Budget</h2>
      <p className="mt-1 text-sm text-ink-500">Ce qu&apos;il faut prévoir pour que la campagne ait un sens.</p>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Minimum" value={eur(budget.monthlyMinEur)} hint="par mois" />
        <Stat label="Conseillé" value={eur(budget.monthlyRecommendedEur)} hint="par mois" highlight />
        <Stat label="Par jour" value={eur(budget.dailyRecommendedEur, 2)} hint="budget quotidien" />
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Clics attendus" value={`${num(budget.clicksMin)} – ${num(budget.clicksMax)}`} hint="par mois" />
        <Stat label="Prises de contact" value={`${num(budget.contactsMin)} – ${num(budget.contactsMax)}`} hint="rendez-vous, appels, e-mails" />
      </dl>
      <p className="mt-3 text-xs text-ink-500">{BASIS_LABEL[budget.basis](eur(budget.cpcEur, 2))}</p>
    </Card>
  );
}

function ChecksCard({ checks, onSelectTab }: { checks: GoogleAdsReadinessCheck[]; onSelectTab: (tab: AdsTab) => void }) {
  const sorted = sortChecks(checks);
  const todo = checks.filter((c) => c.status === "todo");
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Êtes-vous prêt ?</h2>
      <p className="mt-1 text-sm text-ink-500">
        {todo.length === 0
          ? "Tous les points sont au vert : chaque clic payé a une chance de devenir un patient."
          : `${todo.length} point${todo.length > 1 ? "s" : ""} à régler avant (ou juste après) le lancement — les bloquants d'abord.`}
      </p>
      <ul className="mt-3 divide-y divide-cream-200" aria-label="Points de préparation">
        {sorted.map((check) => (
          <CheckRow key={check.id} check={check} onSelectTab={onSelectTab} />
        ))}
      </ul>
    </Card>
  );
}

function CheckRow({ check, onSelectTab }: { check: GoogleAdsReadinessCheck; onSelectTab: (tab: AdsTab) => void }) {
  const status = STATUS[check.status];
  const link = check.status === "ok" ? null : checkLink(check.id);
  const linkClass = "text-xs font-medium text-primary-600 hover:underline";
  return (
    <li className="flex items-start gap-3 py-3">
      <span aria-hidden className={clsx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", status.className)}>
        {status.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink-900">
            <span className="sr-only">{status.label} — </span>
            {check.label}
          </p>
          {check.critical && check.status !== "ok" ? <Badge tone="danger">Bloquant</Badge> : null}
        </div>
        <p className="text-sm text-ink-700">{check.detail}</p>
        {link?.kind === "fiche" ? (
          <Link href="/fiche-google" className={linkClass}>
            Ouvrir Fiche Google →
          </Link>
        ) : null}
        {link?.kind === "editor" ? (
          <Link href="/editor" className={linkClass}>
            Modifier mon site →
          </Link>
        ) : null}
        {link?.kind === "tab" ? (
          <button type="button" onClick={() => onSelectTab("parametrage")} className={linkClass}>
            Ouvrir Paramétrage &amp; suivi →
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Stat({ label, value, hint, highlight = false }: { label: string; value: string; hint: string; highlight?: boolean }) {
  return (
    <div className={clsx("rounded-2xl p-3", highlight ? "bg-primary-50" : "bg-cream-50")}>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={clsx("font-semibold", value.length > 9 ? "text-base" : "text-xl", highlight ? "text-primary-800" : "text-ink-900")}>{value}</dd>
      <dd className="text-[11px] text-ink-500">{hint}</dd>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
