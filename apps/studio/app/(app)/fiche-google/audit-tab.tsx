"use client";

import { clsx } from "clsx";
import {
  Camera,
  Check,
  ChevronUp,
  ChevronsUp,
  CircleAlert,
  CircleCheckBig,
  ClipboardCheck,
  Clock,
  ExternalLink,
  ListChecks,
  MessageSquareText,
  Minus,
  Repeat,
  Search,
  Star,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { GoogleActionItem, GoogleAudit, GoogleAuditCheck, GoogleCheckStatus } from "@theralys/shared";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  ProgressBar,
  ProgressRing,
  Sparkline,
  type BadgeTone,
} from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import type { GoogleAuditView, GoogleScoreHistoryPoint } from "@/lib/google/data";
import { GOOGLE_BUSINESS_URL } from "./shared";

/** Mention du score : en mots, avec une icône — la couleur de l'anneau reste celle de la section. */
const GRADE: Record<GoogleAudit["grade"], { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  A: { label: "Excellente fiche", tone: "success", icon: Trophy },
  B: { label: "Bonne fiche", tone: "brand", icon: ThumbsUp },
  C: { label: "Fiche à renforcer", tone: "warning", icon: CircleAlert },
  D: { label: "Fiche à compléter", tone: "danger", icon: TriangleAlert },
};

const STATUS: Record<GoogleCheckStatus, { label: string; tone: BadgeTone; icon: LucideIcon; dot: string }> = {
  ok: { label: "OK", tone: "success", icon: Check, dot: "bg-ds-success-600 text-white" },
  warn: { label: "À améliorer", tone: "warning", icon: TriangleAlert, dot: "bg-ds-warning-100 text-ds-warning-700" },
  missing: { label: "Manquant", tone: "danger", icon: X, dot: "bg-ds-danger-100 text-ds-danger-700" },
  unknown: { label: "Non disponible", tone: "neutral", icon: Minus, dot: "bg-ds-ink-100 text-ds-ink-600" },
};

const IMPACT: Record<GoogleActionItem["impact"], { tone: BadgeTone; icon: LucideIcon }> = {
  fort: { tone: "warning", icon: ChevronsUp },
  moyen: { tone: "brand", icon: ChevronUp },
  faible: { tone: "neutral", icon: Minus },
};

/** Ordre des contrôles à reprendre : ce qui manque d'abord, puis ce qui se joue sur le plus de points. */
const SEVERITY: Record<GoogleCheckStatus, number> = { missing: 0, warn: 1, unknown: 2, ok: 3 };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

export function AuditTab({
  linked,
  latestAudit,
  history,
  onLinkRequest,
}: {
  linked: boolean;
  latestAudit: GoogleAuditView | null;
  history: GoogleScoreHistoryPoint[];
  /** Fiche non reliée : ramène au champ de recherche de l'écran d'accueil */
  onLinkRequest?: () => void;
}) {
  if (!latestAudit) {
    return (
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={ClipboardCheck}
          title={linked ? "Votre fiche n'a pas encore été auditée." : "Reliez votre fiche Google pour obtenir son audit."}
          action={
            !linked && onLinkRequest ? (
              <Button variant="secondary" icon={<Search size={18} aria-hidden />} onClick={onLinkRequest}>
                Retrouver ma fiche
              </Button>
            ) : undefined
          }
        >
          {linked
            ? "Cliquez sur « Actualiser » ci-dessus : Harmony lit votre fiche et calcule un score sur 100 avec un plan d'action."
            : "Score sur 100, contrôles détaillés et plan d'action priorisé, sans rien publier à votre place."}
        </EmptyState>
      </Card>
    );
  }

  const { audit } = latestAudit;
  const known = audit.checks.filter((c) => c.status !== "unknown");
  const okChecks = audit.checks.filter((c) => c.status === "ok");
  const okCount = okChecks.length;
  const toFix = audit.checks
    .filter((c) => c.status === "warn" || c.status === "missing")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.maxPoints - b.points - (a.maxPoints - a.points));
  const unknown = audit.checks.filter((c) => c.status === "unknown");
  const grade = GRADE[audit.grade];
  const score = Math.max(0, Math.min(100, audit.score));
  const hasBenchmark = Boolean(audit.benchmark && audit.benchmark.competitors.length > 0);

  return (
    <div className="space-y-6">
      <div className={clsx("grid grid-cols-1 gap-6", hasBenchmark && "xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]")}>
        <Card variant="tinted" className="flex flex-col gap-5">
          <div className="grid flex-1 grid-cols-1 items-center gap-x-8 gap-y-5 md:grid-cols-[auto_minmax(0,1fr)]">
            <ProgressRing
              value={score}
              label={`Score ${score} sur 100, grade ${audit.grade}`}
              valueText={`${score} sur 100`}
              size={164}
              thickness={14}
              className="mx-auto [--ds-ring-track:white] md:mx-0"
            >
              <span className="block font-ds-display text-[3.25rem]/none font-extrabold tracking-tight text-ds-section-ink">
                <AnimatedNumber value={score} />
              </span>
              <span className="mt-1 block text-ds-meta font-medium text-ds-ink-600">sur 100</span>
            </ProgressRing>
            <div className="min-w-0 max-md:text-center">
              <h2 className="text-ds-body font-semibold text-ds-section-accent">
                Score de votre fiche
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 max-md:justify-center">
                <span className="font-ds-display text-2xl/8 font-bold text-ds-section-ink sm:text-[1.75rem]/9">{grade.label}</span>
                <Badge tone={grade.tone} icon={grade.icon}>
                  Grade {audit.grade}
                </Badge>
              </p>
              <p className="mt-2 text-base text-ds-ink-700">
                {okCount} contrôle{okCount > 1 ? "s" : ""} sur {known.length} au vert ·{" "}
                {audit.actions.length} action{audit.actions.length > 1 ? "s" : ""} proposée{audit.actions.length > 1 ? "s" : ""}
              </p>
              <ProgressBar
                className="mt-3 max-w-sm [--ds-progress-track:white] max-md:mx-auto"
                size="sm"
                value={okCount}
                max={Math.max(1, known.length)}
                ariaLabel="Contrôles au vert"
                valueText={`${okCount} sur ${known.length}`}
                hideValueText
              />
              <p className="mt-3 text-ds-meta text-ds-ink-600">Calculé le {formatDayFr(latestAudit.createdAt, "day")}.</p>
            </div>
          </div>
          <ScoreHistory history={history} />
        </Card>

        {hasBenchmark ? <BenchmarkCard audit={audit} snapshot={latestAudit.snapshot} /> : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            icon={ListChecks}
            title="Plan d'action"
            description={
              audit.actions.length === 0
                ? undefined
                : "Dans l'ordre d'impact : commencez par le haut, chaque action se fait depuis votre fiche Google."
            }
          />
          {audit.actions.length > 0 ? (
            // L'action de l'onglet : aller appliquer le plan, là où il s'applique
            <div className="mt-4">
              <LinkButton href={GOOGLE_BUSINESS_URL} external iconRight={<ExternalLink size={18} aria-hidden />}>
                Ouvrir ma fiche Google
              </LinkButton>
            </div>
          ) : null}
          {audit.actions.length === 0 ? (
            <p className="mt-5 flex items-start gap-3 rounded-ds-md bg-ds-success-100 p-4 text-base font-medium text-ds-success-900">
              <CircleCheckBig size={22} aria-hidden className="mt-0.5 shrink-0" />
              Rien à signaler : votre fiche est complète. Continuez à collecter des avis.
            </p>
          ) : (
            <ol className="mt-5 space-y-3.5" aria-label="Actions à mener">
              {audit.actions.map((action, index) => (
                <ActionItem key={action.id} action={action} index={index} />
              ))}
            </ol>
          )}
        </Card>

        <ul className="space-y-6" aria-label="Contrôles de la fiche">
          {okChecks.length > 0 ? (
            <Card as="li">
              <CardHeader
                icon={ThumbsUp}
                title="Ce qui va bien"
                description={`${plural(okChecks.length, "contrôle", "contrôles")} au vert : rien à faire ici.`}
              />
              <ul className="mt-4 divide-y divide-ds-ink-200" aria-label="Ce qui va bien">
                {okChecks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            </Card>
          ) : null}
          {toFix.length > 0 ? (
            <Card as="li">
              <CardHeader
                icon={Wrench}
                title="À reprendre"
                description={`${plural(toFix.length, "contrôle", "contrôles")} où votre fiche perd des points.`}
              />
              <ul className="mt-4 divide-y divide-ds-ink-200" aria-label="À reprendre">
                {toFix.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            </Card>
          ) : null}
          {unknown.length > 0 ? (
            <Card as="li">
              <CardHeader
                icon={Minus}
                title="Non mesuré pour l'instant"
                description="Ces contrôles ne comptent pas dans votre score tant que l'information manque."
              />
              <ul className="mt-4 divide-y divide-ds-ink-200" aria-label="Non mesuré pour l'instant">
                {unknown.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            </Card>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function ActionItem({ action, index }: { action: GoogleActionItem; index: number }) {
  const impact = IMPACT[action.impact];
  return (
    <li className="rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-3.5 gap-y-2.5">
        <span
          aria-hidden
          className={clsx(
            "grid size-9 shrink-0 place-items-center rounded-full text-ds-body font-bold ds-tnum",
            // La première action est le point de départ : pastille en dégradé profond (blanc lisible dessus)
            index === 0
              ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow"
              : "bg-ds-section-tint-2 text-ds-section-ink",
          )}
        >
          {index + 1}
        </span>
        <h3 className="min-w-0 flex-[1_1_12rem] pt-1.5 text-base/6 font-semibold text-ds-ink-900">{action.title}</h3>
        <span className="flex shrink-0 flex-wrap gap-1.5 sm:pt-1">
          <Badge tone={impact.tone} icon={impact.icon}>
            Impact {action.impact}
          </Badge>
          <Badge tone="neutral" icon={action.effort === "continu" ? Repeat : Clock}>
            {action.effort === "continu" ? "En continu" : action.effort}
          </Badge>
        </span>
      </div>
      {/* Sous le titre ; à partir de 640 px, aligné sur lui (largeur de la pastille + espace) */}
      <div className="mt-2.5 sm:pl-[3.125rem]">
        <p className="text-ds-body text-ds-ink-700">{action.why}</p>
        <p className="mt-3 rounded-ds-sm bg-white px-3.5 py-2.5 text-ds-body text-ds-ink-900 ring-1 ring-ds-ink-200 [overflow-wrap:anywhere]">
          <span className="font-semibold">Comment faire : </span>
          {action.how}
        </p>
      </div>
    </li>
  );
}

function CheckRow({ check }: { check: GoogleAuditCheck }) {
  const status = STATUS[check.status];
  const Icon = status.icon;
  const points = check.status === "unknown" ? "hors score" : `${check.points}/${check.maxPoints} pts`;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span aria-hidden className={clsx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", status.dot)}>
        <Icon size={15} strokeWidth={2.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-base font-semibold text-ds-ink-900">{check.label}</p>
          <span className="text-ds-meta text-ds-ink-600 ds-tnum">
            <span className="sr-only">{status.label} — </span>
            {points}
          </span>
        </div>
        <p className="text-ds-body text-ds-ink-600 [overflow-wrap:anywhere]">{check.detail}</p>
        {check.status === "warn" || check.status === "missing" ? (
          // Le mot est déjà lu avec les points : la pastille le montre à l'œil
          <Badge tone={status.tone} icon={status.icon} className="mt-2" aria-hidden>
            {status.label}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/** Votre fiche face à la médiane des cabinets du podium : le chiffre, un mot, une jauge. */
function BenchmarkCard({ audit, snapshot }: { audit: GoogleAudit; snapshot: GoogleAuditView["snapshot"] }) {
  const b = audit.benchmark!;
  const rows = [
    { id: "votes", icon: MessageSquareText, label: "Avis", own: snapshot.votes, median: b.medianVotes },
    { id: "rating", icon: Star, label: "Note", own: snapshot.rating, median: b.medianRating },
    { id: "photos", icon: Camera, label: "Photos", own: snapshot.totalPhotos, median: b.medianPhotos },
  ].filter((row): row is typeof row & { median: number } => row.median !== null);
  if (rows.length === 0) return null;
  const fr = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <Card>
      <CardHeader
        icon={Users}
        title={`Comparé aux ${b.competitors.length} cabinets du podium local`}
        description="Les cabinets que Google Maps affiche le plus souvent dans ses 3 premiers résultats autour de vous."
      />
      <ul className="mt-5 space-y-4">
        {rows.map((row) => {
          const Icon = row.icon;
          const position =
            row.own === null
              ? null
              : row.own > row.median
                ? { label: "Au-dessus", tone: "success" as const, icon: TrendingUp }
                : row.own < row.median
                  ? { label: "En dessous", tone: "warning" as const, icon: TrendingDown }
                  : { label: "Au niveau", tone: "neutral" as const, icon: Minus };
          return (
            <li key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 text-ds-body font-semibold text-ds-ink-800">
                  <Icon size={16} aria-hidden className="text-ds-section-accent" />
                  {row.label}
                </p>
                {position ? (
                  <Badge tone={position.tone} icon={position.icon}>
                    {position.label}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-ds-meta text-ds-ink-600">
                <span className="font-ds-display text-2xl/8 font-bold text-ds-ink-900">{row.own === null ? "—" : fr(row.own)}</span>
                <span>(médiane des concurrents : {fr(row.median)})</span>
              </p>
              <ProgressBar
                className="mt-1.5"
                size="sm"
                value={row.own ?? 0}
                max={Math.max(row.own ?? 0, row.median, 1)}
                ariaLabel={`${row.label} : votre fiche par rapport à la médiane des concurrents`}
                valueText={`${row.own === null ? "inconnu" : fr(row.own)}, médiane des concurrents : ${fr(row.median)}`}
                hideValueText
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Historique des scores : mini-courbe (derniers audits) + liste compacte. */
function ScoreHistory({ history }: { history: GoogleScoreHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="rounded-ds-md bg-white px-4 py-3 text-ds-meta text-ds-ink-600 ring-1 ring-ds-section-line/70 max-md:text-center">
        L&apos;historique du score se construit au fil des synchronisations.
      </p>
    );
  }
  const last = history[history.length - 1]!;
  const first = history[0]!;
  const delta = last.score - first.score;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="rounded-ds-md bg-white p-4 ring-1 ring-ds-section-line/70">
      <div className="grid grid-cols-1 items-center gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0">
          <h3 className="text-ds-body font-semibold text-ds-ink-900">Historique du score</h3>
          <Sparkline
            className="mt-2"
            height={52}
            data={history.map((p) => p.score)}
            label={`Score de ${first.score} le ${formatDayFr(first.createdAt)} à ${last.score} le ${formatDayFr(last.createdAt)}`}
          />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ds-meta text-ds-ink-600" aria-label="Derniers audits">
          {history.slice(-6).map((p) => (
            <li key={p.id}>
              {formatDayFr(p.createdAt)} · <strong className="font-semibold text-ds-ink-900 ds-tnum">{p.score}</strong>
            </li>
          ))}
          <li
            className={clsx(
              "inline-flex w-full items-center gap-1.5 font-semibold",
              delta > 0 ? "text-ds-success-700" : delta < 0 ? "text-ds-danger-700" : "text-ds-ink-700",
            )}
          >
            <DeltaIcon size={15} aria-hidden />
            {delta >= 0 ? "+" : ""}
            {delta} depuis le premier audit
          </li>
        </ul>
      </div>
    </div>
  );
}
