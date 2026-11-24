"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { BadgeCheck, Check, Copy, PhoneCall, Sparkles, TriangleAlert } from "lucide-react";
import { KIND_LABELS, STATUS_LABELS, type KnowledgeKind, type KnowledgeStatus } from "@/lib/crm/knowledge/model";
import type { KnowledgeRow } from "@/lib/crm/knowledge/store";

const CHIP = "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

/** Question ou objection : l'objection se repère d'un coup d'œil dans la liste. */
export function KindChip({ kind }: { kind: KnowledgeKind }) {
  return <span className={clsx(CHIP, kind === "objection" ? "bg-[#ffedd5] text-[#9a3412]" : "bg-primary-100 text-primary-800")}>{KIND_LABELS[kind]}</span>;
}

const STATUS_STYLE: Record<KnowledgeStatus, string> = {
  validated: "bg-success-100 text-[#166534]",
  ai: "bg-cream-200 text-ink-700",
  review: "bg-warning-100 text-[#854d0e]",
};

const STATUS_ICON = { validated: BadgeCheck, ai: Sparkles, review: TriangleAlert } as const;

/** D'où vient la réponse, et ce qu'elle vaut : validée par Harmony, rédigée par l'assistant, ou à vérifier. */
export function StatusChip({ status }: { status: KnowledgeStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={clsx(CHIP, STATUS_STYLE[status])}>
      <Icon size={13} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-primary-800 transition-colors hover:bg-primary-100 pointer-coarse:min-h-11 pointer-coarse:px-3"
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      <span aria-live="polite">{copied ? "Copié" : "Copier"}</span>
    </button>
  );
}

/** Les faits, une ligne par fait (le tiret de tête, s'il y en a un, devient la puce). */
function factLines(details: string): string[] {
  return details
    .split("\n")
    .map((line) => line.replace(/^[-•–]\s*/, "").trim())
    .filter(Boolean);
}

const TO_CHECK = /^à faire préciser/i;

/** Le corps d'une fiche : ce qu'on dit au téléphone, puis les faits qui l'appuient. */
export function EntryBody({ entry }: { entry: Pick<KnowledgeRow, "reply" | "details" | "status"> }) {
  const facts = factLines(entry.details);
  return (
    <div>
      {entry.status === "review" ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-warning-100 px-3 py-2 text-sm text-[#713f12]">
          <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span>À vérifier avant de s&apos;en servir : l&apos;assistant n&apos;avait pas toute l&apos;information, ou une relecture a été demandée. Votre responsable complète cette fiche.</span>
        </p>
      ) : null}
      <div className="rounded-2xl bg-primary-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary-800 uppercase">
            <PhoneCall size={13} aria-hidden />À dire au téléphone
          </p>
          <CopyButton text={entry.reply} />
        </div>
        <p data-testid="fiche-reponse" className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line text-ink-900">
          {entry.reply}
        </p>
      </div>
      {facts.length > 0 ? (
        <div className="mt-3 px-1">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Les faits à l&apos;appui</p>
          <ul className="mt-1.5 space-y-1.5">
            {facts.map((fact, index) => (
              <li key={index} className={clsx("flex items-start gap-2 text-sm leading-relaxed", TO_CHECK.test(fact) ? "text-[#854d0e]" : "text-ink-700")}>
                <span aria-hidden className={clsx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", TO_CHECK.test(fact) ? "bg-warning-500" : "bg-primary-400")} />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
