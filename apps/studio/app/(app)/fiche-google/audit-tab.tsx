"use client";

import { clsx } from "clsx";
import { Badge, Card } from "@theralys/ui";
import type { GoogleActionItem, GoogleAudit, GoogleAuditCheck, GoogleCheckStatus } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { GoogleAuditView, GoogleScoreHistoryPoint } from "@/lib/google/data";

const GRADE_LABEL: Record<GoogleAudit["grade"], string> = {
  A: "Excellente fiche",
  B: "Bonne fiche",
  C: "Fiche à renforcer",
  D: "Fiche à compléter",
};

/** Couleurs du score (anneau, mention) par grade — jetons du thème (`packages/ui/src/styles.css`). */
const GRADE_COLOR: Record<GoogleAudit["grade"], string> = {
  A: "var(--color-success-500)",
  B: "var(--color-primary-500)",
  C: "var(--color-warning-500)",
  D: "var(--color-danger-500)",
};

const STATUS: Record<GoogleCheckStatus, { glyph: string; label: string; className: string }> = {
  ok: { glyph: "✓", label: "OK", className: "bg-success-100 text-success-500" },
  warn: { glyph: "!", label: "À améliorer", className: "bg-warning-100 text-warning-500" },
  missing: { glyph: "✕", label: "Manquant", className: "bg-danger-100 text-danger-500" },
  unknown: { glyph: "–", label: "Non disponible", className: "bg-cream-200 text-ink-500" },
};

const IMPACT_TONE: Record<GoogleActionItem["impact"], "primary" | "info" | "neutral"> = {
  fort: "primary",
  moyen: "info",
  faible: "neutral",
};

export function AuditTab({
  linked,
  latestAudit,
  history,
}: {
  linked: boolean;
  latestAudit: GoogleAuditView | null;
  history: GoogleScoreHistoryPoint[];
}) {
  if (!latestAudit) {
    return (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">
          {linked ? "Votre fiche n'a pas encore été auditée." : "Reliez votre fiche Google pour obtenir son audit."}
        </p>
        <p className="mt-1 text-sm">
          {linked
            ? "Cliquez sur « Actualiser » ci-dessus : Harmony lit votre fiche et calcule un score sur 100 avec un plan d'action."
            : "Score sur 100, contrôles détaillés et plan d'action priorisé, sans rien publier à votre place."}
        </p>
      </Card>
    );
  }

  const { audit } = latestAudit;
  const known = audit.checks.filter((c) => c.status !== "unknown");
  const okCount = known.filter((c) => c.status === "ok").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold">Score de votre fiche</h2>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <ScoreRing score={audit.score} grade={audit.grade} />
            <div className="min-w-0">
              <p className="text-lg font-semibold" style={{ color: GRADE_COLOR[audit.grade] }}>
                {GRADE_LABEL[audit.grade]}
              </p>
              <p className="mt-1 text-sm text-ink-700">
                {okCount} contrôle{okCount > 1 ? "s" : ""} sur {known.length} au vert ·{" "}
                {audit.actions.length} action{audit.actions.length > 1 ? "s" : ""} proposée{audit.actions.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs text-ink-500">Calculé le {formatDayFr(latestAudit.createdAt, "day")}.</p>
            </div>
          </div>
          {audit.benchmark && audit.benchmark.competitors.length > 0 ? (
            <BenchmarkNote audit={audit} snapshot={latestAudit.snapshot} />
          ) : null}
          <ScoreHistory history={history} />
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold">Contrôles</h2>
          <ul className="mt-3 divide-y divide-cream-200" aria-label="Contrôles de la fiche">
            {audit.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Plan d&apos;action</h2>
        {audit.actions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Rien à signaler : votre fiche est complète. Continuez à collecter des avis.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-500">
              Dans l&apos;ordre d&apos;impact : commencez par le haut, chaque action se fait depuis votre fiche Google.
            </p>
            <ol className="mt-4 space-y-4" aria-label="Actions à mener">
              {audit.actions.map((action, index) => (
                <li key={action.id} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink-900">
                      <span className="mr-2 text-ink-500">{index + 1}.</span>
                      {action.title}
                    </h3>
                    <span className="flex shrink-0 gap-1.5">
                      <Badge tone={IMPACT_TONE[action.impact]}>Impact {action.impact}</Badge>
                      <Badge tone="neutral">{action.effort}</Badge>
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-700">{action.why}</p>
                  <p className="mt-2 text-sm text-ink-900">
                    <span className="font-medium">Comment : </span>
                    {action.how}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}

/** Anneau SVG du score (0..100), sans bibliothèque : cercle de fond + arc coloré selon le grade. */
export function ScoreRing({ score, grade }: { score: number; grade: GoogleAudit["grade"] }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  return (
    <svg
      width="136"
      height="136"
      viewBox="0 0 136 136"
      role="img"
      aria-label={`Score ${clamped} sur 100, grade ${grade}`}
      className="shrink-0"
    >
      <circle cx="68" cy="68" r={radius} fill="none" stroke="var(--color-cream-200)" strokeWidth="12" />
      <circle
        cx="68"
        cy="68"
        r={radius}
        fill="none"
        stroke={GRADE_COLOR[grade]}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform="rotate(-90 68 68)"
      />
      <text x="68" y="64" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--color-ink-900)">
        {clamped}
      </text>
      <text x="68" y="88" textAnchor="middle" fontSize="14" fontWeight="600" fill={GRADE_COLOR[grade]}>
        Grade {grade}
      </text>
    </svg>
  );
}

function CheckRow({ check }: { check: GoogleAuditCheck }) {
  const status = STATUS[check.status];
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={clsx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", status.className)}
      >
        {status.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-ink-900">{check.label}</p>
          <span className="text-xs text-ink-500">
            <span className="sr-only">{status.label} — </span>
            {check.status === "unknown" ? "hors score" : `${check.points}/${check.maxPoints} pts`}
          </span>
        </div>
        <p className="text-sm text-ink-700">{check.detail}</p>
      </div>
    </li>
  );
}

function BenchmarkNote({ audit, snapshot }: { audit: GoogleAudit; snapshot: GoogleAuditView["snapshot"] }) {
  const b = audit.benchmark!;
  const compare = (own: number | null, median: number | null, unit: string) => {
    if (median === null) return null;
    const ownText = own === null ? "—" : own.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return `${ownText} ${unit} (médiane des concurrents : ${median.toLocaleString("fr-FR", { maximumFractionDigits: 1 })})`;
  };
  const lines = [
    compare(snapshot.votes, b.medianVotes, "avis"),
    compare(snapshot.rating, b.medianRating, "de note"),
    compare(snapshot.totalPhotos, b.medianPhotos, "photos"),
  ].filter((l): l is string => l !== null);
  if (lines.length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl bg-primary-50/60 p-4 text-sm text-ink-700">
      <p className="font-medium text-ink-900">
        Comparé aux {b.competitors.length} cabinets du podium local
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Historique des scores : courbe SVG (derniers audits) + liste compacte. */
function ScoreHistory({ history }: { history: GoogleScoreHistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="mt-4 text-xs text-ink-500">L&apos;historique du score se construit au fil des synchronisations.</p>;
  }
  const width = 280;
  const height = 60;
  const step = width / (history.length - 1);
  const y = (score: number) => height - 4 - (Math.max(0, Math.min(100, score)) / 100) * (height - 8);
  const path = history.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const last = history[history.length - 1]!;
  const first = history[0]!;
  const delta = last.score - first.score;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-ink-900">Historique du score</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-16 w-full max-w-xs"
        role="img"
        aria-label={`Score de ${first.score} le ${formatDayFr(first.createdAt)} à ${last.score} le ${formatDayFr(last.createdAt)}`}
      >
        <path d={path} fill="none" stroke="var(--color-primary-500)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {history.map((p, i) => (
          <circle key={p.id} cx={i * step} cy={y(p.score)} r="3" fill="var(--color-primary-500)" />
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500" aria-label="Derniers audits">
        {history.slice(-6).map((p) => (
          <li key={p.id}>
            {formatDayFr(p.createdAt)} · <strong className="text-ink-700">{p.score}</strong>
          </li>
        ))}
        <li className={clsx("font-medium", delta >= 0 ? "text-success-500" : "text-danger-500")}>
          {delta >= 0 ? "+" : ""}
          {delta} depuis le premier audit
        </li>
      </ul>
    </div>
  );
}
