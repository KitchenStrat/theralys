"use client";

import { clsx } from "clsx";
import {
  ArrowRight,
  Binoculars,
  CalendarDays,
  Check,
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
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { MetaLine, Notice, TEXT_LINK_ON_TINT } from "./parts";
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
  go_with_prerequisites: { tone: "warning", label: "Feu vert après réglages", icon: SlidersHorizontal },
  wait: { tone: "danger", label: "Pas encore", icon: Hourglass },
};

const AFFINITY: Record<MetaAffinity["level"], { tone: BadgeTone; label: string; icon: LucideIcon; rank: number }> = {
  forte: { tone: "success", label: "Affinité forte", icon: SignalHigh, rank: 3 },
  moyenne: { tone: "warning", label: "Affinité moyenne", icon: SignalMedium, rank: 2 },
  faible: { tone: "neutral", label: "Affinité faible", icon: SignalLow, rank: 1 },
};

/**
 * Les trois états d'un point de préparation — acquis, à régler, à vérifier :
 * un repère en tête de ligne, puis le mot dans une pastille à son icône.
 * Jamais la couleur seule. (Même dessin que la check-list de Google Ads.)
 */
const STATUS: Record<MetaAdsReadinessStatus, { label: string; tone: BadgeTone; icon: LucideIcon; mark: string; row: string }> = {
  ok: { label: "Acquis", tone: "success", icon: Check, mark: "bg-ds-success-600 text-white", row: "" },
  // warning-500 ne porte que de l'encre foncée
  todo: { label: "À régler", tone: "warning", icon: TriangleAlert, mark: "bg-ds-warning-500 text-ds-ink-900", row: "bg-ds-warning-100/60 ring-1 ring-ds-warning-500/35" },
  unknown: { label: "À vérifier", tone: "neutral", icon: CircleHelp, mark: "bg-ds-ink-200 text-ds-ink-700", row: "bg-ds-ink-50 ring-1 ring-ds-ink-200" },
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
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Pitch subject={subject} />
          {/* Sur petit écran, le bouton passe avant l'explication : l'action reste à portée de pouce */}
          <div className="max-xl:order-first">{analysisCard}</div>
        </div>
      ) : (
        <>
          {/* Le verdict d'abord ; à côté (ou dessous), de quoi actualiser l'analyse. Pendant l'attente, la carte de droite s'allonge : le verdict garde sa hauteur */}
          <div className={clsx("grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", pending && "items-start")}>
            <VerdictCard diagnostic={diagnostic} hasCreatives={Boolean(current?.creatives)} onSelectTab={onSelectTab} />
            {analysisCard}
          </div>
          <KeyFigures budget={diagnostic.budget} />
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ChecksCard checks={diagnostic.checks} externalSite={diagnostic.externalSite === true} onSelectTab={onSelectTab} />
            <div className="space-y-6">
              <AffinityCard affinity={diagnostic.affinity} profession={site.profession} />
              <BudgetCard budget={diagnostic.budget} />
              {diagnostic.marketNote ? <MarketNoteCard note={diagnostic.marketNote} source={current?.market?.source ?? null} onSelectTab={onSelectTab} /> : null}
            </div>
          </div>
        </>
      )}
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
  usage,
  launcher,
  generationNotice,
  marketNotice,
  onSelectTab,
}: {
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
  // « Analyse terminée : veille du marché, diagnostic… mis à jour. » → le fait en gras, sa précision dessous
  const [messageHead, ...messageRest] = (message ?? "").split(" : ");
  const messageDetail = messageRest.join(" : ");

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={Radar}
        title="Analyse Meta Ads"
        description={
          <>
            Harmony relève les annonces des praticiens autour de vous dans la bibliothèque publicitaire Meta, vérifie que votre cabinet est prêt à
            investir pour <strong className="font-semibold text-ds-ink-800">{subject}</strong>, puis prépare vos annonces, votre plan vidéo et votre plan
            de campagne.
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          onClick={launch}
          loading={running}
          disabled={!canLaunch}
          title={!canLaunch ? "Quota du mois atteint" : undefined}
          icon={current ? <RefreshCw size={18} aria-hidden /> : <Sparkles size={18} aria-hidden />}
        >
          {running ? "Analyse en cours…" : current ? "Actualiser l'analyse" : "Lancer l'analyse"}
        </Button>
        {current ? <p className="text-ds-body text-ds-ink-600">Dernière analyse le {formatDayFr(current.createdAt, "day")}.</p> : null}
      </div>

      {/* Région vivante permanente : l'attente y est annoncée une fois ; le bloc d'étapes, hors région, annonce ensuite chaque changement */}
      <div aria-live="polite">
        {pending ? (
          <p className="sr-only">
            Analyse en cours, jusqu&apos;à deux minutes : veille du marché, diagnostic, annonces, plan vidéo puis plan de campagne…
          </p>
        ) : null}
      </div>

      {pending ? (
        <div className="mt-5 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200">
          <AnalysisProgress startedAt={startedAt} where="Vous pouvez changer d'onglet : les résultats s'afficheront ici dès la fin de l'analyse." />
        </div>
      ) : (
        // `mt-auto` : à côté du verdict, la carte s'étire à sa hauteur et le quota reste au pied
        <div className="mt-auto pt-5">
          <ProgressBar
            size="sm"
            value={usage.analysesRemaining}
            max={META_ADS_ANALYSES_PER_MONTH}
            label={
              <>
                Analyses restantes ce mois-ci :{" "}
                <strong className="font-semibold text-ds-ink-900">
                  {usage.analysesRemaining} sur {META_ADS_ANALYSES_PER_MONTH}
                </strong>
              </>
            }
            valueText={`${usage.analysesRemaining} sur ${META_ADS_ANALYSES_PER_MONTH}`}
            hideValueText
          />
          <MetaLine className="mt-2.5">Comprises dans votre formule, sans frais de données.</MetaLine>
          {!canLaunch ? (
            <Notice tone="section" icon={Info} className="mt-3">
              Quota du mois atteint : vous pourrez relancer l&apos;analyse le mois prochain.
            </Notice>
          ) : null}
        </div>
      )}

      {generationNotice ? (
        <Notice tone="warning" icon={Wrench} className="mt-4">
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
        <InlineSuccess className="mt-4" detail={messageDetail ? `${messageDetail.charAt(0).toUpperCase()}${messageDetail.slice(1)}` : undefined}>
          {messageDetail ? messageHead : message}
        </InlineSuccess>
      ) : null}
    </Card>
  );
}

/** Avant la première analyse : ce qu'elle apporte, en trois questions. */
function Pitch({ subject }: { subject: string }) {
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
    <Card variant="tinted" padding="lg">
      <h2 className="font-ds-display text-xl/7 font-bold text-ds-section-ink text-balance sm:text-2xl/8">Meta Ads est-il pertinent pour {subject} ?</h2>
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
        Vous obtenez aussi vos annonces prêtes à publier (visuels en trois formats et textes), un plan vidéo à tourner vous-même et un plan de
        campagne complet. Rien n&apos;est publié à votre place : vous diffusez depuis votre compte Meta en suivant le tuto de l&apos;onglet
        Paramétrage et suivi.
      </p>
    </Card>
  );
}

/** Le verdict, à lire d'un coup d'œil : le score dans un anneau à la couleur de la section, un mot, puis la phrase en clair. */
function VerdictCard({ diagnostic, hasCreatives, onSelectTab }: { diagnostic: MetaAdsDiagnostic; hasCreatives: boolean; onSelectTab: (tab: MetaTab) => void }) {
  const verdict = VERDICT[diagnostic.verdict];
  return (
    <Card variant="tinted" className="flex flex-col">
      <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">Verdict</h2>
      <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-5">
        <ScoreRing score={diagnostic.score} />
        <div className="min-w-0 flex-[1_1_17rem]">
          <Badge tone={verdict.tone} icon={verdict.icon}>
            {verdict.label}
          </Badge>
          <p className="mt-3 font-ds-display text-2xl/8 font-bold text-ds-section-ink text-balance sm:text-[1.75rem]/9">{diagnostic.headline}</p>
        </div>
      </div>
      <p className="mt-5 text-base text-ds-ink-700 text-pretty">{diagnostic.summary}</p>
      {diagnostic.prerequisites.length > 0 || hasCreatives ? (
        // Pied de carte : ce qu'il reste à régler (le détail est dans la check-list), puis la suite — les annonces
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          {diagnostic.prerequisites.length > 0 ? (
            // Longue liste : elle prend toute la largeur, le bouton passe dessous
            <div
              className={clsx(
                "flex min-w-0 items-start gap-3 rounded-ds-md bg-white px-4 py-3 text-ds-body text-ds-ink-700 ring-1 ring-ds-section-line/70",
                diagnostic.prerequisites.length > 3 ? "basis-full" : "flex-[1_1_18rem]",
              )}
            >
              <Wrench size={18} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
              <p className="min-w-0">
                <span className="font-semibold text-ds-ink-900">À régler :</span> {diagnostic.prerequisites.join(" · ")}
              </p>
            </div>
          ) : null}
          {hasCreatives ? (
            <Button type="button" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />} onClick={() => onSelectTab("annonces")}>
              Voir vos annonces
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Score de préparation (0..100) dans l'anneau du design system, à la couleur
 * de la section, sur piste blanche : il se découvre à l'arrivée et le chiffre
 * roule jusqu'à sa valeur. Le verdict, lui, est dit par la pastille voisine.
 */
export function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <ProgressRing value={clamped} max={100} label={`Préparation ${clamped} sur 100`} size={152} thickness={14} className="[--ds-ring-track:white]">
      <span className="block font-ds-display text-5xl/none font-extrabold text-ds-section-ink">
        <AnimatedNumber value={clamped} />
      </span>
      <span className="mt-1.5 block text-ds-meta font-semibold text-ds-ink-600">sur 100</span>
    </ProgressRing>
  );
}

/**
 * Les quatre chiffres qui résument le budget : ce qu'il faut prévoir, ce qu'on
 * peut en attendre. Sur mobile, les deux budgets tiennent côte à côte ; les
 * deux fourchettes (« 150 – 600 »), plus longues, prennent toute la largeur.
 */
function KeyFigures({ budget }: { budget: MetaAdsBudgetEstimate }) {
  return (
    <section aria-labelledby="meta-key-figures">
      <h2 id="meta-key-figures" className="sr-only">
        Les chiffres clés de votre analyse
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile icon={Wallet} label="Budget conseillé par mois" caption={`${eur(budget.monthlyMinEur)} au minimum`} value={budget.monthlyRecommendedEur} suffix={`${NBSP}€`} />
        <KpiTile icon={CalendarDays} label="Budget par jour" caption="budget quotidien" value={budget.dailyRecommendedEur} suffix={`${NBSP}€`} />
        <KpiTile
          className="max-sm:col-span-2"
          icon={MousePointerClick}
          label="Visites attendues par mois"
          caption="sur le site"
          prefix={`${num(budget.clicksMin)}${NBSP}–${NBSP}`}
          value={budget.clicksMax}
        />
        <KpiTile
          className="max-sm:col-span-2"
          icon={PhoneCall}
          label="Contacts attendus par mois"
          caption="rendez-vous, appels, e-mails"
          prefix={`${num(budget.contactsMin)}${NBSP}–${NBSP}`}
          value={budget.contactsMax}
        />
      </div>
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
      {/* Trois crans : faible, moyenne, forte — le mot est dans la pastille, les crans ne font que le montrer */}
      <div aria-hidden className="mt-3 grid max-w-48 grid-cols-3 gap-1.5">
        {[1, 2, 3].map((rank) => (
          <span key={rank} className={clsx("h-2 rounded-full", rank <= level.rank ? "bg-ds-section-gradient" : "bg-ds-section-tint-2 inset-ring inset-ring-ds-section-line")} />
        ))}
      </div>
      <p className="mt-3 text-base text-ds-ink-700">{affinity.reason}</p>
    </Card>
  );
}

/** Le détail du budget : chaque chiffre avec sa précision, puis d'où viennent les repères. */
function BudgetCard({ budget }: { budget: MetaAdsBudgetEstimate }) {
  return (
    <Card>
      <CardHeader icon={Wallet} title="Budget" description="Ce qu'il faut prévoir pour que la campagne ait un sens." />
      <dl className="mt-4 divide-y divide-ds-ink-200">
        <Figure label="Minimum" value={eur(budget.monthlyMinEur)} hint={`par mois (${eur(budget.dailyMinEur)} / jour)`} />
        <Figure label="Conseillé" value={eur(budget.monthlyRecommendedEur)} hint="par mois" highlight />
        <Figure label="Par jour" value={eur(budget.dailyRecommendedEur)} hint="budget quotidien" />
        <Figure label="Visites attendues" value={`${num(budget.clicksMin)} – ${num(budget.clicksMax)}`} hint="par mois, sur le site" />
        <Figure label="Prises de contact" value={`${num(budget.contactsMin)} – ${num(budget.contactsMax)}`} hint="rendez-vous, appels, e-mails" />
      </dl>
      <MetaLine className="mt-4">
        D&apos;après les repères de coût d&apos;un cabinet local sur Meta ({budgetBenchmarksLabel()}). Visites et prises de contact sont{" "}
        <strong className="font-semibold text-ds-ink-800">mesurées par le Pixel</strong> : sans lui, aucun chiffre réel.
      </MetaLine>
    </Card>
  );
}

/** Un chiffre détaillé : libellé et précision à gauche, valeur à droite. */
function Figure({ label, value, hint, highlight = false }: { label: string; value: ReactNode; hint?: string; highlight?: boolean }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5", highlight && "-mx-3 rounded-ds-sm bg-ds-section-tint px-3")}>
      <dt className="min-w-0 text-ds-body text-ds-ink-700">
        <span className={clsx("block", highlight && "font-semibold text-ds-section-ink")}>{label}</span>
        {hint ? <span className="block text-ds-meta text-ds-ink-600">{hint}</span> : null}
      </dt>
      <dd className={clsx("shrink-0 text-right text-base font-semibold ds-tnum", highlight ? "text-ds-section-ink" : "text-ds-ink-900")}>{value}</dd>
    </div>
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
      <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => onSelectTab("marche")} iconRight={<ArrowRight size={16} aria-hidden />}>
        Voir les annonces du marché
      </Button>
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

function CheckRow({ check, externalSite, onSelectTab }: { check: MetaAdsReadinessCheck; externalSite: boolean; onSelectTab: (tab: MetaTab) => void }) {
  const status = STATUS[check.status];
  const StatusIcon = status.icon;
  const link = check.status === "ok" ? null : metaCheckLink(check.id, externalSite);
  const arrow = <ArrowRight size={16} aria-hidden />;
  return (
    <li className={clsx("flex items-start gap-3.5 rounded-ds-md px-3.5 py-3", status.row)}>
      {/* Repère décoratif : le mot du statut est porté par la pastille de droite */}
      <span aria-hidden className={clsx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", status.mark)}>
        <StatusIcon size={16} strokeWidth={check.status === "ok" ? 3 : 2.5} />
      </span>
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
            <Badge tone={status.tone} icon={status.icon}>
              {status.label}
            </Badge>
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
                Ouvrir Paramétrage et suivi
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
