"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  CircleCheck,
  Hourglass,
  ListChecks,
  MousePointerClick,
  OctagonAlert,
  PhoneCall,
  Play,
  RefreshCw,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  GOOGLE_ADS_ANALYSES_PER_MONTH,
  GOOGLE_ADS_CORE_MAX,
  usdToEur,
  type GoogleAdsBudgetEstimate,
  type GoogleAdsDemand,
  type GoogleAdsDiagnostic,
  type GoogleAdsForecast,
  type GoogleAdsReadinessCheck,
  type GoogleAdsReadinessStatus,
  type GoogleAdsVerdict,
} from "@theralys/shared";
import type { GoogleBudget } from "@theralys/jobs";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardHeader,
  IconBadge,
  InlineSuccess,
  KpiTile,
  LinkButton,
  ProgressBar,
  ProgressRing,
  StepProgress,
  useStepTimeline,
  type BadgeTone,
  type TimedStep,
} from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import { adsCheckLink } from "@/lib/google-ads/checks";
import type { GoogleAdsAnalysisView, GoogleAdsUsage } from "@/lib/google-ads/data";
import { MON_SITE_HREF } from "@/lib/google-ads/external-tracking";
import { launchAdsAnalysis } from "./actions";
import type { AdsSiteInfo } from "./ads-client";
import { CheckBadge, CheckMark, Figure, FigureList, FinePrint, Notice } from "./ads-ui";
import type { AdsTab } from "./tabs";

const usd = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const eur = (value: number, digits = 0) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const num = (value: number) => value.toLocaleString("fr-FR");
const TWO_DECIMALS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const ANALYSIS_FAILED_FALLBACK = "L'analyse a échoué : réessayez dans un instant.";
/** Analyse lancée ailleurs (autre onglet, autre session) : la page se relit à cet intervalle jusqu'à la fin */
const RUNNING_REFRESH_MS = 10_000;

/**
 * Ce que fait l'analyse, dans l'ordre, avec la durée habituelle de chaque
 * étape : le service ne remonte pas son avancement, l'attente le montre donc
 * d'après ces durées (la dernière étape ne se termine qu'à la vraie fin).
 */
const ANALYSIS_STEPS: readonly TimedStep[] = [
  {
    label: "Recherche des mots-clés",
    seconds: 12,
    details: [
      "Idées de recherches autour de votre métier et de votre ville",
      "Recherches par mois et coût par clic de chaque expression",
      "Tri : les expressions hors sujet sont écartées",
    ],
  },
  { label: "Prévision de trafic", seconds: 10, details: ["Clics et coût attendus sur vos expressions principales"] },
  { label: "Diagnostic", seconds: 6, details: ["Fiche Google, prise de rendez-vous, téléphone, avis", "Calcul du budget conseillé"] },
  {
    label: "Plan d'action",
    seconds: 32,
    details: ["Structure de la campagne", "Groupes d'annonces et mots-clés", "Rédaction des annonces", "Jalons à 7, 30, 60 et 90 jours"],
  },
];

/** Libellé, ton et pictogramme du verdict : jamais la couleur seule. */
const VERDICT: Record<GoogleAdsVerdict, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  go: { tone: "success", icon: CircleCheck, label: "Feu vert" },
  go_with_prerequisites: { tone: "warning", icon: SlidersHorizontal, label: "Feu vert après réglages" },
  wait: { tone: "danger", icon: Hourglass, label: "Pas encore" },
};

/** Les trois états d'un point de préparation, dits en un mot à côté de leur pictogramme. */
const STATUS_LABEL: Record<GoogleAdsReadinessStatus, string> = {
  ok: "Acquis",
  todo: "À régler",
  unknown: "À vérifier",
};

const STATUS_ORDER: Record<GoogleAdsReadinessStatus, number> = { todo: 0, unknown: 1, ok: 2 };

/** À faire d'abord (bloquants en tête), puis inconnus, puis OK — ordre d'origine conservé à égalité. */
export function sortChecks(checks: GoogleAdsReadinessCheck[]): GoogleAdsReadinessCheck[] {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Number(b.critical) - Number(a.critical));
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
  const runningElsewhere = latest?.status === "running" && !pending;
  const running = pending || latest?.status === "running";
  const canLaunch = usage.analysesRemaining > 0 && budget.remainingUsd >= analysisCostUsd;
  const diagnostic = current?.diagnostic ?? null;

  /*
   * Analyse en cours lancée ailleurs : rien ne la rafraîchirait sinon — relecture périodique jusqu'à la fin.
   *
   * Un seul minuteur à la fois : il n'est posé que lorsque `runningElsewhere` devient vrai, et retiré dès
   * qu'il redevient faux (analyse terminée ou en erreur, ou lancement repris ici) comme au démontage de
   * l'onglet. Il ne dépend de rien d'autre : la relecture passe par une référence, si bien qu'un `router`
   * ou une fonction qui changeraient d'identité d'un rendu à l'autre ne le relancent jamais (le compte à
   * rebours de 10 s n'est pas remis à zéro par un rendu). Un tic est sauté tant que la relecture précédente
   * n'est pas appliquée : sur un serveur lent, les relectures ne s'empilent pas non plus dans la file du routeur.
   */
  const [refreshing, startRefresh] = useTransition();
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    refreshRef.current = () => {
      if (refreshing) return;
      startRefresh(() => router.refresh());
    };
  }, [refreshing, router]);
  useEffect(() => {
    if (!runningElsewhere) return;
    const timer = window.setInterval(() => refreshRef.current(), RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [runningElsewhere]);

  function launch() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await launchAdsAnalysis();
      if (result.error) {
        const remaining =
          typeof result.remaining === "number"
            ? ` Il vous reste ${result.remaining} analyse${result.remaining > 1 ? "s" : ""} ce mois-ci.`
            : "";
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

  const launcher = (
    <AnalysisCard
      subject={subject}
      current={current}
      latest={latest}
      usage={usage}
      budget={budget}
      analysisCostUsd={analysisCostUsd}
      pending={pending}
      runningElsewhere={runningElsewhere}
      running={running}
      canLaunch={canLaunch}
      error={error}
      message={message}
      onLaunch={launch}
      onSelectTab={onSelectTab}
    />
  );

  if (!diagnostic) {
    return (
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Pitch subject={subject} />
        {/* Sur petit écran, le bouton passe avant l'explication : l'action reste à portée de pouce */}
        <div className="max-xl:order-first">{launcher}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Les deux cartes ont la même hauteur ; pendant l'attente, celle de l'analyse s'allonge (étapes) et le verdict garde la sienne plutôt que de s'étirer à vide */}
      <div className={clsx("grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", running && "items-start")}>
        <VerdictCard diagnostic={diagnostic} hasPlan={Boolean(current?.plan)} onSelectTab={onSelectTab} />
        {launcher}
      </div>
      <KeyFigures demand={diagnostic.demand} budget={diagnostic.budget} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChecksCard checks={diagnostic.checks} externalSite={diagnostic.externalSite === true} onSelectTab={onSelectTab} />
        {/* Détail des chiffres : côte à côte sur tablette, empilés dans la colonne de droite sur grand écran */}
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <DemandCard demand={diagnostic.demand} onSelectTab={onSelectTab} />
          <BudgetCard budget={diagnostic.budget} forecast={current?.forecast ?? null} />
        </div>
      </div>
    </div>
  );
}

/**
 * Lancement de l'analyse : ce qu'elle fait et pour qui, le bouton, ce qu'il
 * reste du quota du mois, puis l'attente (étapes nommées) et l'issue.
 */
function AnalysisCard({
  subject,
  current,
  latest,
  usage,
  budget,
  analysisCostUsd,
  pending,
  runningElsewhere,
  running,
  canLaunch,
  error,
  message,
  onLaunch,
  onSelectTab,
}: {
  subject: string;
  current: GoogleAdsAnalysisView | null;
  latest: GoogleAdsAnalysisView | null;
  usage: GoogleAdsUsage;
  budget: GoogleBudget;
  analysisCostUsd: number;
  pending: boolean;
  runningElsewhere: boolean;
  running: boolean;
  canLaunch: boolean;
  error: string | null;
  message: string | null;
  onLaunch: () => void;
  onSelectTab: (tab: AdsTab) => void;
}) {
  // « Analyse terminée : diagnostic, mots-clés et plan d'action mis à jour. » → le fait en gras, sa précision dessous
  const [messageHead, ...messageRest] = (message ?? "").split(" : ");
  const messageDetail = messageRest.join(" : ");
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={ScanSearch}
        title="Analyse de la demande"
        description={
          <>
            Harmony interroge les données Google Ads (recherches mensuelles, coûts par clic, concurrence) pour{" "}
            <strong className="font-semibold text-ds-ink-800">{subject}</strong>, puis vérifie que votre cabinet est prêt à investir.
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          onClick={onLaunch}
          loading={running}
          disabled={!canLaunch}
          title={!canLaunch ? "Quota ou budget du mois atteint" : undefined}
          icon={current ? <RefreshCw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
        >
          {running ? "Analyse en cours…" : current ? "Actualiser l'analyse" : "Lancer l'analyse"}
        </Button>
        {current ? <p className="text-ds-body text-ds-ink-600">Dernière analyse le {formatDayFr(current.createdAt, "day")}.</p> : null}
      </div>

      {/* Région vivante permanente : l'attente y est annoncée une fois ; le bloc d'étapes annonce ensuite chaque changement */}
      <p aria-live="polite" className="sr-only">
        {pending
          ? "Analyse en cours, jusqu'à une minute : recherche des mots-clés, prévision, diagnostic puis plan d'action…"
          : runningElsewhere
            ? "Une analyse est en cours : les résultats s'afficheront dans un instant."
            : ""}
      </p>

      {running ? (
        <AnalysisProgress launchedHere={pending} subject={subject} />
      ) : (
        // `mt-auto` : à côté du verdict, la carte s'étire à sa hauteur et le quota reste au pied
        <div className="mt-auto pt-5">
          <ProgressBar
            size="sm"
            value={usage.analysesRemaining}
            max={GOOGLE_ADS_ANALYSES_PER_MONTH}
            label={
              <>
                Analyses restantes ce mois-ci :{" "}
                <strong className="font-semibold text-ds-ink-900">
                  {usage.analysesRemaining} sur {GOOGLE_ADS_ANALYSES_PER_MONTH}
                </strong>
              </>
            }
            valueText={`${usage.analysesRemaining} sur ${GOOGLE_ADS_ANALYSES_PER_MONTH}`}
            hideValueText
          />
          <FinePrint className="mt-2.5">
            Budget restant : <strong className="font-semibold text-ds-ink-800">{usd(budget.remainingUsd)}</strong> sur {usd(budget.budgetUsd)} · Une analyse ≈{" "}
            {usd(analysisCostUsd)}, comprise dans votre formule.
          </FinePrint>
          {!canLaunch ? (
            <Notice className="mt-3">Quota ou budget du mois atteint : vous pourrez relancer l&apos;analyse le mois prochain.</Notice>
          ) : null}
        </div>
      )}

      {latest?.status === "error" && !error ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {sentence(latest.error?.trim() ? `La dernière analyse a échoué : ${latest.error.trim()}` : ANALYSIS_FAILED_FALLBACK)}
          {current ? " Les résultats affichés sont ceux de l'analyse précédente." : ""}
        </Notice>
      ) : null}
      {current && !current.plan && !pending ? (
        <Notice tone="warning" icon={Wrench} className="mt-4">
          <p>{sentence(current.error?.trim() ? current.error.trim() : "Le plan d'action n'a pas pu être généré.")} Mots-clés et diagnostic sont là.</p>
          {/* Un vrai bouton (cible de 44 px au doigt) : il mène à l'onglet Plan, où le plan se génère */}
          <Button type="button" variant="secondary" size="sm" className="mt-2.5" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => onSelectTab("plan")}>
            Aller générer le plan d&apos;action
          </Button>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {error}
        </Notice>
      ) : null}
      {message ? (
        <InlineSuccess className="mt-4" detail={messageDetail ? `${messageDetail.charAt(0).toUpperCase()}${messageDetail.slice(1)}` : undefined}>
          {messageDetail ? messageHead : message}
        </InlineSuccess>
      ) : null}
    </Card>
  );
}

/**
 * Attente de l'analyse : les étapes défilent d'après leurs durées habituelles.
 * Lancée d'ici, le temps écoulé est affiché ; lancée ailleurs, on ne sait pas
 * depuis quand elle tourne — pas de chronomètre inventé, la page se relit seule.
 */
function AnalysisProgress({ launchedHere, subject }: { launchedHere: boolean; subject: string }) {
  const { current, elapsed, inStep } = useStepTimeline(ANALYSIS_STEPS, true);
  const details = ANALYSIS_STEPS[current]?.details ?? [];
  const detail = details.length > 0 ? details[Math.min(details.length - 1, Math.floor(inStep / 3))] : undefined;
  return (
    <div className="mt-5 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200">
      <StepProgress
        icon={Search}
        title={launchedHere ? `Nous étudions la demande pour ${subject}` : "Une analyse est en cours"}
        steps={ANALYSIS_STEPS}
        current={current}
        estimate="jusqu'à une minute"
        elapsed={launchedHere ? Math.floor(elapsed) : undefined}
        detail={detail}
        hint={
          launchedHere
            ? "Restez sur cet onglet : les résultats s'afficheront ici dès la fin de l'analyse."
            : "Elle a été lancée depuis un autre onglet ou un autre appareil : les résultats s'afficheront dans un instant, sans rien toucher."
        }
      />
    </div>
  );
}

/** Avant la première analyse : ce qu'elle apporte, en trois questions. */
function Pitch({ subject }: { subject: string }) {
  const questions: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Search, title: "Y a-t-il une demande ?", text: "Combien de personnes cherchent votre métier dans votre ville chaque mois, et à quel coût par clic." },
    { icon: ListChecks, title: "Êtes-vous prêt ?", text: "Fiche Google reliée, prise de rendez-vous, téléphone, avis : ce qui transforme un clic en patient." },
    { icon: Wallet, title: "Quel budget ?", text: "Un budget mensuel conseillé, avec les clics et les prises de contact attendus." },
  ];
  return (
    <Card variant="tinted" padding="lg">
      <h2 className="font-ds-display text-xl/7 font-bold text-ds-section-ink text-balance sm:text-2xl/8">Google Ads est-il pertinent pour {subject} ?</h2>
      <p className="mt-2 text-base text-ds-ink-700">Avant de dépenser le moindre euro, l&apos;analyse répond à trois questions :</p>
      <ol className="mt-5 space-y-3">
        {questions.map((question, i) => (
          <li key={question.title} className="flex items-start gap-3.5 rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-900/5">
            <IconBadge icon={question.icon} size="md" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-ds-ink-900">
                <span className="mr-1.5 text-ds-section-accent ds-tnum">{i + 1}.</span>
                {question.title}
              </p>
              <p className="mt-0.5 text-ds-body text-ds-ink-700">{question.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-ds-body text-ds-ink-700">
        Vous obtenez aussi vos mots-clés à cibler et un plan d&apos;action complet (campagne, annonces, budget). Rien n&apos;est publié à
        votre place : vous paramétrez votre compte Google Ads en suivant le pas-à-pas de l&apos;onglet Paramétrage &amp; suivi.
      </p>
    </Card>
  );
}

function VerdictCard({ diagnostic, hasPlan, onSelectTab }: { diagnostic: GoogleAdsDiagnostic; hasPlan: boolean; onSelectTab: (tab: AdsTab) => void }) {
  const verdict = VERDICT[diagnostic.verdict];
  const score = Math.max(0, Math.min(100, diagnostic.score));
  return (
    <Card variant="tinted" className="flex flex-col">
      <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">Verdict</h2>
      <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-5">
        {/* Anneau à la couleur de la section, sur piste blanche : le verdict, lui, est dit par le badge (pictogramme et mot) */}
        <ProgressRing value={score} max={100} label={`Préparation ${score} sur 100`} size={152} thickness={14} className="[--ds-ring-track:white]">
          <span className="block font-ds-display text-5xl/none font-extrabold text-ds-section-ink">
            <AnimatedNumber value={score} />
          </span>
          <span className="mt-1.5 block text-ds-meta font-semibold text-ds-ink-600">sur 100</span>
        </ProgressRing>
        <div className="min-w-0 flex-[1_1_17rem]">
          <Badge tone={verdict.tone} icon={verdict.icon}>
            {verdict.label}
          </Badge>
          <p className="mt-3 font-ds-display text-2xl/8 font-bold text-ds-section-ink text-balance sm:text-[1.75rem]/9">{diagnostic.headline}</p>
        </div>
      </div>
      <p className="mt-5 text-base text-ds-ink-700 text-pretty">{diagnostic.summary}</p>
      {diagnostic.prerequisites.length > 0 || hasPlan ? (
        // Pied de carte : ce qu'il reste à régler (le détail est dans la check-list), puis la suite — le plan
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          {diagnostic.prerequisites.length > 0 ? (
            // Longue liste : elle prend toute la largeur, le bouton passe dessous
            <Notice tone="plain" icon={Wrench} className={clsx("min-w-0", diagnostic.prerequisites.length > 3 ? "basis-full" : "flex-[1_1_18rem]")}>
              <span className="font-semibold text-ds-ink-900">À régler :</span> {diagnostic.prerequisites.join(" · ")}
            </Notice>
          ) : null}
          {hasPlan ? (
            <Button type="button" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />} onClick={() => onSelectTab("plan")}>
              Voir le plan d&apos;action
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Les quatre chiffres qui résument l'analyse : la demande, le coût, le budget, ce qu'on peut en attendre. */
function KeyFigures({ demand, budget }: { demand: GoogleAdsDemand; budget: GoogleAdsBudgetEstimate }) {
  const core = Math.min(demand.keywordsCount, GOOGLE_ADS_CORE_MAX);
  const cpcRange =
    demand.cpcMinEur === null || demand.cpcMaxEur === null || demand.cpcMinEur === demand.cpcMaxEur
      ? "estimation Google Ads"
      : `de ${eur(demand.cpcMinEur, 2)} à ${eur(demand.cpcMaxEur, 2)}`;
  const hasCpc = demand.cpcMedianEur !== null;
  return (
    <section aria-labelledby="ads-key-figures">
      <h2 id="ads-key-figures" className="sr-only">
        Les chiffres clés de votre analyse
      </h2>
      <div className={clsx("grid grid-cols-2 gap-3 sm:gap-4", hasCpc ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <KpiTile
          icon={Search}
          label="Recherches par mois"
          caption={`${core} expression${core > 1 ? "s" : ""} principale${core > 1 ? "s" : ""}`}
          value={demand.coreMonthlySearches}
        />
        {demand.cpcMedianEur !== null ? (
          <KpiTile icon={MousePointerClick} label="Coût par clic (médiane)" caption={cpcRange} value={demand.cpcMedianEur} format={TWO_DECIMALS} suffix=" €" />
        ) : null}
        <KpiTile
          icon={Wallet}
          label="Budget conseillé par mois"
          caption={`${eur(budget.monthlyMinEur)} au minimum`}
          value={budget.monthlyRecommendedEur}
          suffix=" €"
        />
        <KpiTile
          icon={PhoneCall}
          label="Contacts attendus par mois"
          caption="rendez-vous, appels, e-mails"
          prefix={`${num(budget.contactsMin)} – `}
          value={budget.contactsMax}
          className={hasCpc ? undefined : "max-xl:col-span-2"}
        />
      </div>
    </section>
  );
}

function DemandCard({ demand, onSelectTab }: { demand: GoogleAdsDemand; onSelectTab: (tab: AdsTab) => void }) {
  const cpc =
    demand.cpcMinEur === null || demand.cpcMaxEur === null
      ? "—"
      : demand.cpcMinEur === demand.cpcMaxEur
        ? eur(demand.cpcMinEur, 2)
        : `${eur(demand.cpcMinEur, 2)} – ${eur(demand.cpcMaxEur, 2)}`;
  const core = Math.min(demand.keywordsCount, GOOGLE_ADS_CORE_MAX);
  return (
    <Card>
      <CardHeader icon={Search} title="Demande" description="Ce que tapent vos futurs patients sur Google, d'après les données Google Ads." />
      <FigureList className="mt-4">
        <Figure label="Recherches / mois" value={num(demand.coreMonthlySearches)} hint={`sur vos ${core} expressions principales`} />
        <Figure
          label="Toutes expressions"
          value={num(demand.totalMonthlySearches)}
          hint={`${demand.keywordsCount} mot${demand.keywordsCount > 1 ? "s" : ""}-clé${demand.keywordsCount > 1 ? "s" : ""} retenu${demand.keywordsCount > 1 ? "s" : ""}`}
        />
        <Figure label="Coût par clic" value={cpc} hint={demand.cpcMedianEur !== null ? `médiane ${eur(demand.cpcMedianEur, 2)}` : "estimation Google Ads"} />
        <Figure label="Concurrence" value={demand.competition ? capitalize(demand.competition) : "—"} hint="entre annonceurs, sur le cœur" />
      </FigureList>
      <Button type="button" variant="secondary" size="sm" className="mt-4" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => onSelectTab("mots-cles")}>
        Voir les mots-clés à cibler
      </Button>
    </Card>
  );
}

const BASIS_LABEL: Record<GoogleAdsBudgetEstimate["basis"], (cpc: string) => string> = {
  forecast: (cpc) => `D'après la prévision de trafic Google Ads sur vos expressions principales (coût par clic moyen ${cpc}).`,
  cpc: (cpc) => `D'après le coût par clic médian de vos expressions principales (${cpc}).`,
  none: (cpc) => `Estimation par défaut (coût par clic ${cpc}) : la demande n'a pas pu être chiffrée.`,
};

function BudgetCard({ budget, forecast }: { budget: GoogleAdsBudgetEstimate; forecast: GoogleAdsForecast | null }) {
  return (
    <Card>
      <CardHeader icon={Wallet} title="Budget" description="Ce qu'il faut prévoir pour que la campagne ait un sens." />
      <FigureList className="mt-4">
        <Figure label="Minimum" value={eur(budget.monthlyMinEur)} hint="par mois" />
        <Figure label="Conseillé" value={eur(budget.monthlyRecommendedEur)} hint="par mois" highlight />
        <Figure label="Par jour" value={eur(budget.dailyRecommendedEur, 2)} hint="budget quotidien" />
        <Figure label="Clics attendus" value={`${num(budget.clicksMin)} – ${num(budget.clicksMax)}`} hint="par mois" />
        <Figure label="Prises de contact" value={`${num(budget.contactsMin)} – ${num(budget.contactsMax)}`} hint="rendez-vous, appels, e-mails" />
      </FigureList>
      <FinePrint className="mt-4">{BASIS_LABEL[budget.basis](eur(budget.cpcEur, 2))}</FinePrint>
      {forecast ? <ForecastNote forecast={forecast} /> : null}
    </Card>
  );
}

/**
 * Prévision Google Ads : un agrégat sur l'ensemble des mots-clés cœur
 * (`rows` n'est jamais parcourue — une seule ligne, sans mot-clé) : clics,
 * coût (converti en €) et enchère maximale envoyée.
 */
function ForecastNote({ forecast }: { forecast: GoogleAdsForecast }) {
  const cost = usdToEur(forecast.totalCostUsd);
  const bid = usdToEur(forecast.bidUsd);
  return (
    <FinePrint className="mt-2">
      Prévision Google Ads pour le mois prochain, sur l&apos;ensemble des mots-clés cœur : environ {num(forecast.totalClicks)} clic
      {forecast.totalClicks > 1 ? "s" : ""}
      {cost !== null ? ` pour ${eur(cost)}` : ""}
      {bid !== null ? `, avec une enchère maximale de ${eur(bid, 2)} par clic` : ""}
      {forecast.source === "mock" ? " (données de démonstration)" : ""}.
    </FinePrint>
  );
}

function ChecksCard({
  checks,
  externalSite,
  onSelectTab,
}: {
  checks: GoogleAdsReadinessCheck[];
  /** Bilan établi pour le site du client : ses points se règlent sur ce site et dans « Mon site », pas dans l'éditeur */
  externalSite: boolean;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const sorted = sortChecks(checks);
  const todo = checks.filter((c) => c.status === "todo");
  const acquired = checks.filter((c) => c.status === "ok").length;
  return (
    <Card>
      <CardHeader
        icon={ListChecks}
        title="Êtes-vous prêt ?"
        description={
          todo.length === 0
            ? "Tous les points sont au vert : chaque clic payé a une chance de devenir un patient."
            : `${todo.length} point${todo.length > 1 ? "s" : ""} à régler avant (ou juste après) le lancement — les bloquants d'abord.`
        }
      />
      {checks.length > 0 ? (
        <ProgressBar className="mt-5" value={acquired} max={checks.length} label="Points acquis" valueText={`${acquired} sur ${checks.length}`} />
      ) : null}
      <ul className="mt-4 space-y-2" aria-label="Points de préparation">
        {sorted.map((check) => (
          <CheckRow key={check.id} check={check} externalSite={externalSite} onSelectTab={onSelectTab} />
        ))}
      </ul>
    </Card>
  );
}

function CheckRow({ check, externalSite, onSelectTab }: { check: GoogleAdsReadinessCheck; externalSite: boolean; onSelectTab: (tab: AdsTab) => void }) {
  const link = check.status === "ok" ? null : adsCheckLink(check.id, externalSite);
  const arrow = <ArrowRight size={16} aria-hidden />;
  return (
    <li
      className={clsx(
        "flex items-start gap-3.5 rounded-ds-md px-3.5 py-3",
        check.status === "todo" ? "bg-ds-warning-100/60 ring-1 ring-ds-warning-500/35" : check.status === "unknown" ? "bg-ds-ink-50 ring-1 ring-ds-ink-200" : "",
      )}
    >
      <CheckMark state={check.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {/* Petit écran : le statut passe toujours sous le libellé (jamais tantôt à droite, tantôt dessous) */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="text-base font-semibold text-ds-ink-900 max-sm:basis-full">{check.label}</p>
          <span className="flex flex-wrap items-center gap-1.5">
            {check.critical && check.status !== "ok" ? (
              <Badge tone="danger" icon={OctagonAlert}>
                Bloquant
              </Badge>
            ) : null}
            <CheckBadge state={check.status}>{STATUS_LABEL[check.status]}</CheckBadge>
          </span>
        </div>
        <p className="mt-0.5 text-ds-body text-ds-ink-700">{check.detail}</p>
        {link ? (
          <div className="mt-2.5">
            {link === "fiche" ? (
              <LinkButton href="/fiche-google" variant="secondary" size="sm" iconRight={arrow}>
                Ouvrir Fiche Google
              </LinkButton>
            ) : null}
            {link === "editor" ? (
              <LinkButton href="/editor" variant="secondary" size="sm" iconRight={arrow}>
                Modifier mon site
              </LinkButton>
            ) : null}
            {link === "site" ? (
              <LinkButton href={MON_SITE_HREF} variant="secondary" size="sm" iconRight={arrow}>
                Ouvrir Mon site
              </LinkButton>
            ) : null}
            {link === "tab" ? (
              <Button type="button" variant="secondary" size="sm" iconRight={arrow} onClick={() => onSelectTab("parametrage")}>
                Ouvrir Paramétrage &amp; suivi
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Termine un message par un point s'il n'a pas déjà sa ponctuation (une autre phrase le suit). */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}
