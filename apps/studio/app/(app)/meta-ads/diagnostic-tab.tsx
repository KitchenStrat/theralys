"use client";

import { clsx } from "clsx";
import {
  ArrowRight,
  Binoculars,
  CalendarDays,
  CircleCheck,
  CircleHelp,
  FlaskConical,
  HeartHandshake,
  Hourglass,
  Info,
  ListChecks,
  MousePointerClick,
  OctagonAlert,
  PhoneCall,
  Radar,
  RefreshCw,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Sparkles,
  TriangleAlert,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
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
  NBSP,
  ProgressBar,
  ProgressRing,
  Spinner,
  type BadgeTone,
} from "@/components/ds";
import {
  META_ADS_ANALYSES_PER_MONTH,
  META_ADS_BENCHMARKS,
  type MetaAdsBudgetEstimate,
  type MetaAdsDiagnostic,
  type MetaAdsReadinessCheck,
  type MetaAdsReadinessStatus,
  type MetaAdsVerdict,
  type MetaAffinity,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { MON_SITE_HREF } from "@/lib/google-ads/external-tracking";
import { metaCheckLink } from "@/lib/meta-ads/checks";
import type { MetaAdsAnalysisView, MetaAdsUsageView } from "@/lib/meta-ads/data";
import { marketUnavailableNotice, type MarketUnavailableNotice } from "@/lib/meta-ads/market-status";
import { AnalysisProgress } from "./analysis-progress";
import type { MetaSiteInfo } from "./meta-client";
import { Notice, StepNumber, TEXT_LINK_ON_TINT } from "./parts";
import type { MetaTab } from "./tabs";
import type { AnalysisLaunch } from "./use-analysis-launch";

const eur = (value: number, digits = 0) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const num = (value: number) => value.toLocaleString("fr-FR");
const pct = (ratio: number) => (ratio * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Repères de coût affichés sous le budget, depuis `META_ADS_BENCHMARKS` (coût par clic, part des visites qui prennent contact). */
export function budgetBenchmarksLabel(): string {
  const [cpcLow, cpcHigh] = META_ADS_BENCHMARKS.cpcEur;
  const [rateLow, rateHigh] = META_ADS_BENCHMARKS.contactRate;
  return `coût par clic ${eur(cpcLow, 2)} – ${eur(cpcHigh, 2)}, ${pct(rateLow)} à ${pct(rateHigh)} % des visites qui prennent contact`;
}

const ANALYSIS_FAILED_FALLBACK = "L'analyse a échoué : réessayez dans un instant.";

/** Verdict : un mot, une icône et une teinte — l'anneau du score, lui, garde la couleur de la section. */
const VERDICT: Record<MetaAdsVerdict, { tone: BadgeTone; label: string; icon: LucideIcon }> = {
  go: { tone: "success", label: "Feu vert", icon: CircleCheck },
  go_with_prerequisites: { tone: "warning", label: "Feu vert après réglages", icon: Wrench },
  wait: { tone: "danger", label: "Pas encore", icon: Hourglass },
};

const AFFINITY: Record<MetaAffinity["level"], { tone: BadgeTone; label: string; icon: LucideIcon; rank: number }> = {
  forte: { tone: "success", label: "Affinité forte", icon: SignalHigh, rank: 3 },
  moyenne: { tone: "warning", label: "Affinité moyenne", icon: SignalMedium, rank: 2 },
  faible: { tone: "neutral", label: "Affinité faible", icon: SignalLow, rank: 1 },
};

/** Les trois états d'un point de préparation : toujours une icône et un mot, jamais la couleur seule. */
const STATUS: Record<MetaAdsReadinessStatus, { label: string; tone: BadgeTone; icon: LucideIcon; bubble: string; row: string }> = {
  ok: { label: "Acquis", tone: "success", icon: CircleCheck, bubble: "bg-ds-success-100 text-ds-success-700", row: "" },
  todo: { label: "À régler", tone: "warning", icon: TriangleAlert, bubble: "bg-white text-ds-warning-700 inset-ring inset-ring-ds-warning-500/40", row: "bg-ds-warning-100/60 inset-ring inset-ring-ds-warning-500/25" },
  unknown: { label: "À vérifier", tone: "neutral", icon: CircleHelp, bubble: "bg-white text-ds-ink-600 inset-ring inset-ring-ds-ink-300", row: "bg-ds-ink-100/70 inset-ring inset-ring-ds-ink-200" },
};

const STATUS_ORDER: Record<MetaAdsReadinessStatus, number> = { todo: 0, unknown: 1, ok: 2 };

/** À faire d'abord (bloquants en tête), puis inconnus, puis OK — ordre d'origine conservé à égalité. */
export function sortChecks(checks: MetaAdsReadinessCheck[]): MetaAdsReadinessCheck[] {
  return [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Number(b.critical) - Number(a.critical));
}

export function DiagnosticTab({
  latest,
  current,
  usage,
  site,
  launcher,
  onSelectTab,
}: {
  latest: MetaAdsAnalysisView | null;
  current: MetaAdsAnalysisView | null;
  usage: MetaAdsUsageView;
  site: MetaSiteInfo;
  /** Lancement de l'analyse, partagé avec l'onglet « Marché » */
  launcher: AnalysisLaunch;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const { pending, runningElsewhere, error } = launcher;
  const diagnostic = current?.diagnostic ?? null;
  const generationMissing = Boolean(current && (!current.creatives || !current.videoPlan || !current.plan));
  // Analyse aboutie sans veille : jeton absent (client / démo) ou échec signalé par le service (`error`)
  const marketNotice = current && current.market === null ? marketUnavailableNotice({ provider: current.provider, error: current.error, siteType: site.type, generationMissing }) : null;

  const subject = [site.profession, site.city].filter(Boolean).join(" à ") || "votre cabinet";

  const analysisCard = (
    <AnalysisCard
      hero={!diagnostic}
      subject={subject}
      current={current}
      usage={usage}
      launcher={launcher}
      generationNotice={
        generationMissing && !pending ? (current?.error?.trim() ? current.error.trim() : "Les annonces, le plan vidéo ou le plan de campagne n'ont pas pu être générés.") : null
      }
      marketNotice={marketNotice && !pending ? marketNotice : null}
      onSelectTab={onSelectTab}
    />
  );

  return (
    <div className="space-y-6">
      {/* État des résultats affichés : dit en tête d'onglet, avant le verdict */}
      {latest?.status === "error" && !error ? (
        <Notice tone="danger" icon={TriangleAlert} role="alert">
          {latest.error?.trim() ? `La dernière analyse a échoué : ${latest.error.trim()}` : ANALYSIS_FAILED_FALLBACK}
          {current ? " — les résultats affichés sont ceux de l'analyse précédente." : ""}
        </Notice>
      ) : null}
      {runningElsewhere ? (
        <Notice tone="section" role="status" leading={<Spinner className="size-[1.125rem]" />}>
          Une analyse est en cours : les résultats s&apos;afficheront dans un instant.
        </Notice>
      ) : null}

      {!diagnostic ? (
        <>
          {analysisCard}
          <Explainer subject={subject} />
        </>
      ) : (
        <>
          {/* Le verdict d'abord ; à côté (ou dessous), de quoi actualiser l'analyse */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <VerdictCard diagnostic={diagnostic} />
            {analysisCard}
          </div>
          <BudgetSection budget={diagnostic.budget} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ChecksCard checks={diagnostic.checks} externalSite={diagnostic.externalSite === true} onSelectTab={onSelectTab} />
            <div className="space-y-6">
              <AffinityCard affinity={diagnostic.affinity} profession={site.profession} />
              {diagnostic.marketNote ? <MarketNoteCard note={diagnostic.marketNote} source={current?.market?.source ?? null} onSelectTab={onSelectTab} /> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Lancement de l'analyse : ce qu'elle fait, le bouton, le quota du mois, puis
 * l'attente (étapes nommées) et l'issue. Sans analyse encore, c'est la carte
 * mise en avant de l'onglet (`hero`).
 */
function AnalysisCard({
  hero,
  subject,
  current,
  usage,
  launcher,
  generationNotice,
  marketNotice,
  onSelectTab,
}: {
  hero: boolean;
  subject: string;
  current: MetaAdsAnalysisView | null;
  usage: MetaAdsUsageView;
  launcher: AnalysisLaunch;
  /** Annonces, plan vidéo ou plan manquants : message à afficher (null : rien à dire) */
  generationNotice: string | null;
  marketNotice: MarketUnavailableNotice | null;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const { pending, running, canLaunch, error, message, startedAt, launch } = launcher;
  const button = (
    <Button
      onClick={launch}
      loading={running}
      disabled={!canLaunch}
      size={hero ? "lg" : "md"}
      title={!canLaunch ? "Quota du mois atteint" : undefined}
      icon={current ? <RefreshCw size={18} aria-hidden /> : <Sparkles size={18} aria-hidden />}
    >
      {running ? "Analyse en cours…" : current ? "Actualiser l'analyse" : "Lancer l'analyse"}
    </Button>
  );
  const description = (
    <>
      Harmony relève les annonces des praticiens autour de vous dans la bibliothèque publicitaire Meta, vérifie que votre cabinet est prêt à
      investir pour <strong className="font-semibold text-ds-ink-900">{subject}</strong>, puis prépare vos annonces, votre plan vidéo et votre plan
      de campagne.
    </>
  );

  return (
    <Card variant={hero ? "tinted" : "plain"} padding={hero ? "lg" : "md"} className={clsx("flex flex-col", hero && "bg-ds-section-soft")}>
      {hero ? (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 flex-[1_1_24rem] items-start gap-4">
            <IconBadge icon={Radar} size="lg" />
            <div className="min-w-0">
              <h2 className="font-ds-display text-xl/7 font-bold text-ds-section-ink sm:text-2xl/8">Analyse Meta Ads</h2>
              <p className="mt-1 max-w-[68ch] text-base text-ds-ink-700">{description}</p>
            </div>
          </div>
          <div className="shrink-0">{button}</div>
        </div>
      ) : (
        <>
          <CardHeader
            icon={Radar}
            title="Analyse Meta Ads"
            description={current ? `Dernière analyse le ${formatDayFr(current.createdAt, "day")}.` : undefined}
          />
          <p className="mt-3 text-ds-body text-ds-ink-600">{description}</p>
          <div className="mt-4">{button}</div>
        </>
      )}
      {hero && current ? <p className="mt-3 text-ds-meta text-ds-ink-600">Dernière analyse le {formatDayFr(current.createdAt, "day")}.</p> : null}

      <p className={clsx("text-ds-meta text-ds-ink-600", hero ? "mt-5 border-t border-ds-section-line pt-4" : "mt-4")}>
        Analyses restantes ce mois-ci :{" "}
        <strong className="font-semibold text-ds-ink-900">
          {usage.analysesRemaining} sur {META_ADS_ANALYSES_PER_MONTH}
        </strong>{" "}
        · comprises dans votre formule, sans frais de données.
        {!canLaunch ? " La prochaine analyse sera possible le mois prochain." : ""}
      </p>

      {/* Région vivante permanente : l'attente y est annoncée ; le détail des étapes s'affiche juste dessous, hors région */}
      <div aria-live="polite">
        {pending ? (
          <p className="sr-only">
            Analyse en cours, jusqu&apos;à deux minutes : veille du marché, diagnostic, annonces, plan vidéo puis plan de campagne…
          </p>
        ) : null}
      </div>
      {pending ? (
        <div className={clsx("mt-5 rounded-ds-md p-4", hero ? "bg-white inset-ring inset-ring-ds-section-line/70" : "bg-ds-ink-50 inset-ring inset-ring-ds-ink-200")}>
          <AnalysisProgress startedAt={startedAt} where="Vous pouvez consulter les autres onglets pendant l'analyse : les résultats s'afficheront ici." />
        </div>
      ) : null}

      {generationNotice ? (
        <Notice tone="warning" icon={TriangleAlert} className="mt-4">
          {generationNotice} Le diagnostic est là :{" "}
          <button type="button" onClick={() => onSelectTab("annonces")} className={TEXT_LINK_ON_TINT}>
            régénérer les annonces
          </button>
        </Notice>
      ) : null}
      {marketNotice ? (
        <Notice tone="neutral" icon={Info} className="mt-4">
          <p data-testid="meta-market-notice">
            <strong className="font-semibold text-ds-ink-900">{marketNotice.title}</strong> {marketNotice.detail}
          </p>
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" icon={TriangleAlert} role="alert" className="mt-4">
          {error}
        </Notice>
      ) : null}
      {message && !pending ? (
        <InlineSuccess size="sm" className="mt-4">
          {message}
        </InlineSuccess>
      ) : null}
    </Card>
  );
}

/** Sans analyse encore : ce que l'analyse apportera, en trois questions. */
function Explainer({ subject }: { subject: string }) {
  const questions: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: Binoculars,
      title: "Que font les autres ?",
      text: "Les annonces des praticiens autour de vous dans la bibliothèque publicitaire Meta : angles, accroches, offres, durée de diffusion.",
    },
    {
      icon: ListChecks,
      title: "Êtes-vous prêt ?",
      text: "Pixel installé, page Facebook, prise de rendez-vous, téléphone, photos, avis : ce qui transforme un clic en patient.",
    },
    {
      icon: Wallet,
      title: "Quel budget ?",
      text: "Un budget quotidien et mensuel conseillé, avec les visites et les prises de contact attendues, mesurées par le Pixel.",
    },
  ];
  return (
    <Card padding="lg">
      <h2 className="font-ds-display text-xl/7 font-bold text-ds-ink-900 text-balance sm:text-2xl/8">Meta Ads est-il pertinent pour {subject} ?</h2>
      <p className="mt-2 text-base text-ds-ink-700">Avant de dépenser le moindre euro, l&apos;analyse répond à trois questions :</p>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {questions.map(({ icon, title, text }, i) => (
          <li key={title} className="rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70 sm:p-5">
            <div className="flex items-center gap-3">
              <IconBadge icon={icon} size="md" />
              <StepNumber size="sm">{i + 1}</StepNumber>
            </div>
            <p className="mt-3 font-ds-display text-lg/7 font-bold text-ds-section-ink">
              <span className="sr-only">{i + 1}. </span>
              {title}
            </p>
            <p className="mt-1 text-ds-body text-ds-ink-700">{text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-ds-body text-ds-ink-600">
        Vous obtenez aussi vos annonces prêtes à publier (visuels en trois formats et textes), un plan vidéo à tourner vous-même et un plan de
        campagne complet. Rien n&apos;est publié à votre place : vous diffusez depuis votre compte Meta en suivant le tuto de l&apos;onglet
        Paramétrage et suivi.
      </p>
    </Card>
  );
}

/** Le verdict, à lire d'un coup d'œil : le score dans un anneau à la couleur de la section, un mot, puis la phrase en clair. */
function VerdictCard({ diagnostic }: { diagnostic: MetaAdsDiagnostic }) {
  const verdict = VERDICT[diagnostic.verdict];
  const score = Math.max(0, Math.min(100, Math.round(diagnostic.score)));
  return (
    <section aria-labelledby="meta-verdict" className="flex flex-col justify-center rounded-ds-card p-6 shadow-ds-pop ds-border-gradient sm:p-8">
      <div className="flex flex-col items-center gap-x-8 gap-y-5 sm:flex-row sm:items-center">
        <ScoreRing score={score} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start">
            <h2 id="meta-verdict" className="text-ds-meta font-semibold tracking-wide text-ds-section-accent uppercase">
              Verdict
            </h2>
            <Badge tone={verdict.tone} icon={verdict.icon}>
              {verdict.label}
            </Badge>
          </div>
          <p className="mt-2.5 font-ds-display text-2xl/8 font-bold text-ds-ink-900 text-balance sm:text-[1.75rem]/9">{diagnostic.headline}</p>
        </div>
      </div>
      <p className="mt-5 text-base text-ds-ink-700 text-pretty">{diagnostic.summary}</p>
      {diagnostic.prerequisites.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-ds-body font-semibold text-ds-ink-800">À régler :</p>
          <ul className="contents" aria-label="Points à régler">
            {diagnostic.prerequisites.map((item) => (
              <li key={item}>
                <Badge tone="warning" icon={TriangleAlert} className="max-w-full whitespace-normal">
                  {item}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Score de préparation (0..100) dans l'anneau du design system : il se découvre à l'arrivée, le chiffre roule jusqu'à sa valeur. */
export function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <ProgressRing value={clamped} max={100} label={`Préparation ${clamped} sur 100`} valueText={`${clamped} sur 100`} size={136} thickness={13}>
      <span className="block font-ds-display text-[2.75rem] leading-none font-bold text-ds-section-ink">
        <AnimatedNumber value={clamped} />
      </span>
      <span className="mt-1 block text-ds-meta font-semibold text-ds-ink-600">sur 100</span>
    </ProgressRing>
  );
}

/** Budget et résultats attendus : quatre chiffres clés, puis d'où ils viennent. */
function BudgetSection({ budget }: { budget: MetaAdsBudgetEstimate }) {
  return (
    <section aria-labelledby="meta-budget">
      <h2 id="meta-budget" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
        Budget
      </h2>
      <p className="mt-0.5 text-ds-body text-ds-ink-600">Ce qu&apos;il faut prévoir pour que la campagne ait un sens.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile icon={Wallet} label="Budget conseillé par mois" caption={`minimum ${eur(budget.monthlyMinEur)}`} value={budget.monthlyRecommendedEur} suffix={`${NBSP}€`} />
        <KpiTile icon={CalendarDays} label="Budget par jour" caption="budget quotidien" value={budget.dailyRecommendedEur} suffix={`${NBSP}€`} />
        <KpiTile
          icon={MousePointerClick}
          label="Visites attendues par mois"
          caption="sur le site"
          value={budget.clicksMin}
          suffix={`${NBSP}–${NBSP}${num(budget.clicksMax)}`}
        />
        <KpiTile
          icon={PhoneCall}
          label="Prises de contact par mois"
          caption="rendez-vous, appels, e-mails"
          value={budget.contactsMin}
          suffix={`${NBSP}–${NBSP}${num(budget.contactsMax)}`}
        />
      </div>
      <Notice tone="section" icon={Info} className="mt-4">
        <p>
          Minimum pour que la campagne ait un sens :{" "}
          <strong className="font-semibold text-ds-ink-900">
            {eur(budget.monthlyMinEur)} par mois ({eur(budget.dailyMinEur)} / jour)
          </strong>
          . Les prises de contact comptent les rendez-vous, les appels et les e-mails.
        </p>
        <p className="mt-1">
          D&apos;après les repères de coût d&apos;un cabinet local sur Meta ({budgetBenchmarksLabel()}). Visites et prises de contact sont{" "}
          <strong className="font-semibold text-ds-ink-900">mesurées par le Pixel</strong> : sans lui, aucun chiffre réel.
        </p>
      </Notice>
    </section>
  );
}

function AffinityCard({ affinity, profession }: { affinity: MetaAffinity; profession: string }) {
  const level = AFFINITY[affinity.level];
  return (
    <Card>
      <CardHeader
        icon={HeartHandshake}
        title="Affinité du métier"
        description="Sur Meta, on ne cherche rien : la publicité crée l'envie. Certains métiers s'y prêtent mieux que d'autres."
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={level.tone} icon={level.icon}>
          {level.label}
        </Badge>
        {profession ? <span className="text-base font-semibold text-ds-ink-900">{profession}</span> : null}
      </div>
      <ProgressBar className="mt-3" size="sm" value={level.rank} max={3} ariaLabel="Affinité du métier avec Meta" valueText={level.label} hideValueText />
      <p className="mt-3 text-base text-ds-ink-700">{affinity.reason}</p>
    </Card>
  );
}

function MarketNoteCard({ note, source, onSelectTab }: { note: string; source: string | null; onSelectTab: (tab: MetaTab) => void }) {
  return (
    <Card>
      <CardHeader icon={Binoculars} title="Lecture de la veille" />
      <p className="mt-3 text-base text-ds-ink-700">{note}</p>
      {source === "mock" ? (
        <p className="mt-3 flex items-center gap-1.5 text-ds-meta text-ds-ink-600">
          <FlaskConical size={14} aria-hidden className="shrink-0" />
          Données de démonstration.
        </p>
      ) : null}
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => onSelectTab("marche")} iconRight={<ArrowRight size={16} aria-hidden />}>
          Voir les annonces du marché
        </Button>
      </div>
    </Card>
  );
}

function ChecksCard({
  checks,
  externalSite,
  onSelectTab,
}: {
  checks: MetaAdsReadinessCheck[];
  /** Bilan établi pour le site du client : ses points se règlent sur ce site et dans « Mon site », pas dans l'éditeur */
  externalSite: boolean;
  onSelectTab: (tab: MetaTab) => void;
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
      <ProgressBar
        className="mt-5"
        value={acquired}
        max={Math.max(1, checks.length)}
        label="Points acquis"
        valueText={`${acquired} sur ${checks.length}`}
      />
      <ul className="mt-4 space-y-1.5" aria-label="Points de préparation">
        {sorted.map((check) => (
          <CheckRow key={check.id} check={check} externalSite={externalSite} onSelectTab={onSelectTab} />
        ))}
      </ul>
    </Card>
  );
}

function CheckRow({ check, externalSite, onSelectTab }: { check: MetaAdsReadinessCheck; externalSite: boolean; onSelectTab: (tab: MetaTab) => void }) {
  const status = STATUS[check.status];
  const StatusIcon = status.icon;
  const link = check.status === "ok" ? null : metaCheckLink(check.id, externalSite);
  const arrow = <ArrowRight size={16} aria-hidden />;
  return (
    <li className={clsx("flex items-start gap-3.5 rounded-ds-md px-3 py-3 sm:px-4", status.row)}>
      <span aria-hidden className={clsx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", status.bubble)}>
        <StatusIcon size={20} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="text-base font-semibold text-ds-ink-900">{check.label}</p>
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
          {check.critical && check.status !== "ok" ? (
            <Badge tone="danger" icon={OctagonAlert}>
              Bloquant
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-ds-body text-ds-ink-700">{check.detail}</p>
        {link === "fiche" ? (
          <LinkButton href="/fiche-google" variant="secondary" size="sm" className="mt-2.5" iconRight={arrow}>
            Ouvrir Fiche Google
          </LinkButton>
        ) : null}
        {link === "editor" ? (
          <LinkButton href="/editor" variant="secondary" size="sm" className="mt-2.5" iconRight={arrow}>
            Modifier mon site
          </LinkButton>
        ) : null}
        {link === "site" ? (
          <LinkButton href={MON_SITE_HREF} variant="secondary" size="sm" className="mt-2.5" iconRight={arrow}>
            Ouvrir Mon site
          </LinkButton>
        ) : null}
        {link === "tab" ? (
          <Button type="button" variant="secondary" size="sm" className="mt-2.5" onClick={() => onSelectTab("parametrage")} iconRight={arrow}>
            Ouvrir Paramétrage et suivi
          </Button>
        ) : null}
      </div>
    </li>
  );
}
