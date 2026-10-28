"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, Spinner } from "@theralys/ui";
import {
  META_ADS_ANALYSES_PER_MONTH,
  type MetaAdsBudgetEstimate,
  type MetaAdsCheckId,
  type MetaAdsDiagnostic,
  type MetaAdsReadinessCheck,
  type MetaAdsReadinessStatus,
  type MetaAdsVerdict,
  type MetaAffinity,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { MetaAdsAnalysisView, MetaAdsUsageView } from "@/lib/meta-ads/data";
import { launchMetaAnalysis } from "./actions";
import type { MetaSiteInfo } from "./meta-client";
import type { MetaTab } from "./tabs";

const eur = (value: number, digits = 0) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const num = (value: number) => value.toLocaleString("fr-FR");

const ANALYSIS_FAILED_FALLBACK = "L'analyse a échoué : réessayez dans un instant.";
/** Analyse lancée ailleurs (autre onglet, autre session) : la page se relit à cet intervalle jusqu'à la fin */
const RUNNING_REFRESH_MS = 10_000;

/** Couleurs et libellés du verdict — jetons du thème (`packages/ui/src/styles.css`). */
const VERDICT: Record<MetaAdsVerdict, { color: string; tone: "success" | "warning" | "danger"; label: string }> = {
  go: { color: "var(--color-success-500)", tone: "success", label: "Feu vert" },
  go_with_prerequisites: { color: "var(--color-warning-500)", tone: "warning", label: "Feu vert après réglages" },
  wait: { color: "var(--color-danger-500)", tone: "danger", label: "Pas encore" },
};

const AFFINITY: Record<MetaAffinity["level"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  forte: { tone: "success", label: "Affinité forte" },
  moyenne: { tone: "warning", label: "Affinité moyenne" },
  faible: { tone: "neutral", label: "Affinité faible" },
};

const STATUS: Record<MetaAdsReadinessStatus, { glyph: string; label: string; className: string }> = {
  ok: { glyph: "✓", label: "OK", className: "bg-success-100 text-success-500" },
  todo: { glyph: "!", label: "À faire", className: "bg-warning-100 text-warning-500" },
  unknown: { glyph: "–", label: "Inconnu", className: "bg-cream-200 text-ink-500" },
};

const STATUS_ORDER: Record<MetaAdsReadinessStatus, number> = { todo: 0, unknown: 1, ok: 2 };

/** À faire d'abord (bloquants en tête), puis inconnus, puis OK — ordre d'origine conservé à égalité. */
export function sortChecks(checks: MetaAdsReadinessCheck[]): MetaAdsReadinessCheck[] {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Number(b.critical) - Number(a.critical));
}

type CheckLink = { kind: "fiche" } | { kind: "editor" } | { kind: "tab" };

/** Où régler le point : onglet Paramétrage (Pixel), éditeur du site ou section Fiche Google. */
function checkLink(id: MetaAdsCheckId): CheckLink {
  switch (id) {
    case "pixel":
      return { kind: "tab" };
    case "reviews":
    case "profile_linked":
      return { kind: "fiche" };
    case "cookie_banner":
    case "facebook_page":
    case "instagram":
    case "booking":
    case "phone":
    case "photos":
    case "landing_pages":
      return { kind: "editor" };
  }
}

export function DiagnosticTab({
  latest,
  current,
  usage,
  site,
  onSelectTab,
}: {
  latest: MetaAdsAnalysisView | null;
  current: MetaAdsAnalysisView | null;
  usage: MetaAdsUsageView;
  site: MetaSiteInfo;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runningElsewhere = latest?.status === "running" && !pending;
  const running = pending || latest?.status === "running";
  const canLaunch = usage.analysesRemaining > 0;
  const diagnostic = current?.diagnostic ?? null;
  const generationMissing = Boolean(current && (!current.creatives || !current.videoPlan || !current.plan));

  // Analyse en cours lancée ailleurs : rien ne la rafraîchirait sinon — relecture périodique jusqu'à la fin
  useEffect(() => {
    if (!runningElsewhere) return;
    const timer = setInterval(() => router.refresh(), RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [runningElsewhere, router]);

  function launch() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await launchMetaAnalysis();
      if (result.error) {
        const remaining = typeof result.remaining === "number" ? ` Il vous reste ${result.remaining} analyse${result.remaining > 1 ? "s" : ""} ce mois-ci.` : "";
        setError(`${result.error}${remaining}`);
        // La ligne en erreur et le quota consommé sont relus
        router.refresh();
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
            <h2 className="text-xl font-semibold">Analyse Meta Ads</h2>
            <p className="mt-1 text-sm text-ink-500">
              Harmony relève les annonces des praticiens autour de vous dans la bibliothèque publicitaire Meta, vérifie que votre
              cabinet est prêt à investir pour <strong className="text-ink-700">{subject}</strong>, puis prépare vos annonces, votre plan
              vidéo et votre plan de campagne.
            </p>
            {current ? <p className="mt-1 text-xs text-ink-500">Dernière analyse le {formatDayFr(current.createdAt, "day")}.</p> : null}
          </div>
          <Button onClick={launch} disabled={running || !canLaunch} title={!canLaunch ? "Quota du mois atteint" : undefined}>
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
            {usage.analysesRemaining} sur {META_ADS_ANALYSES_PER_MONTH}
          </strong>{" "}
          · comprises dans votre formule, sans frais de données.
        </p>
        {/* Région vivante permanente : les messages d'attente y apparaissent et sont annoncés */}
        <div aria-live="polite">
          {pending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-700">
              <Spinner /> Analyse en cours, jusqu&apos;à deux minutes : veille du marché, diagnostic, annonces, plan vidéo puis plan de
              campagne…
            </p>
          ) : null}
          {runningElsewhere ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-700">
              <Spinner /> Une analyse est en cours : les résultats s&apos;afficheront dans un instant.
            </p>
          ) : null}
        </div>
        {latest?.status === "error" && !error ? (
          <p className="mt-3 text-sm text-danger-500" role="alert">
            {latest.error?.trim() ? `La dernière analyse a échoué : ${latest.error.trim()}` : ANALYSIS_FAILED_FALLBACK}
            {current ? " — les résultats affichés sont ceux de l'analyse précédente." : ""}
          </p>
        ) : null}
        {generationMissing && !pending ? (
          <p className="mt-3 rounded-xl bg-warning-100 px-4 py-2 text-sm text-ink-900">
            {current?.error?.trim() ? current.error.trim() : "Les annonces, le plan vidéo ou le plan de campagne n'ont pas pu être générés."} Le
            diagnostic est là :{" "}
            <button type="button" onClick={() => onSelectTab("annonces")} className="font-medium text-primary-700 underline">
              régénérer les annonces →
            </button>
          </p>
        ) : null}
        {current && current.provider === "none" && !generationMissing && !pending ? (
          <p className="mt-3 rounded-xl bg-cream-100 px-4 py-2 text-sm text-ink-700">
            {site.type === "demo"
              ? "Veille du marché indisponible pour cette analyse : relancez-la pour l'obtenir."
              : "Veille du marché en attente d'activation du jeton Meta : le diagnostic, vos annonces et votre plan sont disponibles ; la veille des annonces autour de vous s'ajoutera à la prochaine analyse, une fois le jeton activé par Harmony."}
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
            <AffinityCard affinity={diagnostic.affinity} profession={site.profession} />
            <BudgetCard budget={diagnostic.budget} />
            {diagnostic.marketNote ? <MarketNoteCard note={diagnostic.marketNote} source={current?.market?.source ?? null} onSelectTab={onSelectTab} /> : null}
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
      <h2 className="text-xl font-semibold">Meta Ads est-il pertinent pour {subject} ?</h2>
      <p className="mt-2 text-sm text-ink-700">Avant de dépenser le moindre euro, l&apos;analyse répond à trois questions :</p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["Que font les autres ?", "Les annonces des praticiens autour de vous dans la bibliothèque publicitaire Meta : angles, accroches, offres, durée de diffusion."],
          ["Êtes-vous prêt ?", "Pixel installé, page Facebook, prise de rendez-vous, téléphone, photos, avis : ce qui transforme un clic en patient."],
          ["Quel budget ?", "Un budget quotidien et mensuel conseillé, avec les visites et les prises de contact attendues, mesurées par le Pixel."],
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
        Vous obtenez aussi vos annonces prêtes à publier (visuels en trois formats et textes), un plan vidéo à tourner vous-même et un plan de
        campagne complet. Rien n&apos;est publié à votre place : vous diffusez depuis votre compte Meta en suivant le tuto de l&apos;onglet
        Paramétrage et suivi.
      </p>
    </Card>
  );
}

function VerdictCard({ diagnostic }: { diagnostic: MetaAdsDiagnostic }) {
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
      {diagnostic.prerequisites.length > 0 ? <p className="mt-3 text-xs text-ink-500">À régler : {diagnostic.prerequisites.join(" · ")}</p> : null}
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
      <circle cx="68" cy="68" r={radius} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 68 68)" />
      <text x="68" y="64" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--color-ink-900)">
        {clamped}
      </text>
      <text x="68" y="88" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--color-ink-500)">
        / 100
      </text>
    </svg>
  );
}

function AffinityCard({ affinity, profession }: { affinity: MetaAffinity; profession: string }) {
  const level = AFFINITY[affinity.level];
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Affinité du métier</h2>
      <p className="mt-1 text-sm text-ink-500">
        Sur Meta, on ne cherche rien : la publicité crée l&apos;envie. Certains métiers s&apos;y prêtent mieux que d&apos;autres.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={level.tone}>{level.label}</Badge>
        {profession ? <span className="text-sm font-medium text-ink-900">{profession}</span> : null}
      </div>
      <p className="mt-2 text-sm text-ink-700">{affinity.reason}</p>
    </Card>
  );
}

function BudgetCard({ budget }: { budget: MetaAdsBudgetEstimate }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Budget</h2>
      <p className="mt-1 text-sm text-ink-500">Ce qu&apos;il faut prévoir pour que la campagne ait un sens.</p>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Minimum" value={eur(budget.monthlyMinEur)} hint={`par mois (${eur(budget.dailyMinEur)} / jour)`} />
        <Stat label="Conseillé" value={eur(budget.monthlyRecommendedEur)} hint="par mois" highlight />
        <Stat label="Par jour" value={eur(budget.dailyRecommendedEur)} hint="budget quotidien" />
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Visites attendues" value={`${num(budget.clicksMin)} – ${num(budget.clicksMax)}`} hint="par mois, sur le site" />
        <Stat label="Prises de contact" value={`${num(budget.contactsMin)} – ${num(budget.contactsMax)}`} hint="rendez-vous, appels, e-mails" />
      </dl>
      <p className="mt-3 text-xs text-ink-500">
        D&apos;après les repères de coût d&apos;un cabinet local sur Meta (coût par clic 0,50 – 1 €, 3 à 8 % des visites qui prennent contact).
        Visites et prises de contact sont <strong className="text-ink-700">mesurées par le Pixel</strong> : sans lui, aucun chiffre réel.
      </p>
    </Card>
  );
}

function MarketNoteCard({ note, source, onSelectTab }: { note: string; source: string | null; onSelectTab: (tab: MetaTab) => void }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Lecture de la veille</h2>
      <p className="mt-2 text-sm text-ink-700">{note}</p>
      {source === "mock" ? <p className="mt-2 text-xs text-ink-500">Données de démonstration.</p> : null}
      <button type="button" onClick={() => onSelectTab("marche")} className="mt-3 text-sm font-medium text-primary-600 hover:underline">
        Voir les annonces du marché →
      </button>
    </Card>
  );
}

function ChecksCard({ checks, onSelectTab }: { checks: MetaAdsReadinessCheck[]; onSelectTab: (tab: MetaTab) => void }) {
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

function CheckRow({ check, onSelectTab }: { check: MetaAdsReadinessCheck; onSelectTab: (tab: MetaTab) => void }) {
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
            Ouvrir Paramétrage et suivi →
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
