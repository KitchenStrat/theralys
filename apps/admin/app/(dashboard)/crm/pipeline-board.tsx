"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import { clsx } from "clsx";
import { Button, Input, Label, Modal } from "@theralys/ui";
import type { ContactListRow, PipelineColumn, StageSummary } from "@/lib/crm/data";
import { PIPELINE_COLUMN_LIMIT, filtersHref, type CrmFilters } from "@/lib/crm/filters";
import { dueLabel, euros } from "@/lib/crm/format";
import { CRM_STAGES, STAGE_META, contactMonthlyValue, displayName, type CrmStage } from "@/lib/crm/model";
import { setStage } from "./actions";

/** En-têtes en chevrons : la suite des étapes se lit comme un seul parcours, de gauche à droite. */
const CHEVRON_FIRST = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";
const CHEVRON = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

/**
 * Colonnes telles qu'elles seront une fois les déplacements en cours enregistrés :
 * une carte change de colonne dès qu'on la lâche, sans attendre la réponse du serveur.
 */
export function projectMoves(columns: PipelineColumn[], moves: Record<string, CrmStage>): PipelineColumn[] {
  let board = columns;
  for (const [id, stage] of Object.entries(moves)) {
    const card = board.flatMap((column) => column.cards).find((entry) => entry.id === id);
    if (!card || card.stage === stage) continue;
    const value = contactMonthlyValue(card);
    board = board.map((column) => {
      if (column.stage === card.stage) return { ...column, count: column.count - 1, monthlyValue: column.monthlyValue - value, cards: column.cards.filter((entry) => entry.id !== id) };
      if (column.stage === stage) return { ...column, count: column.count + 1, monthlyValue: column.monthlyValue + value, cards: [{ ...card, stage }, ...column.cards] };
      return column;
    });
  }
  return board;
}

/**
 * Pipeline : une colonne par étape en cours du cycle de vente. Une affaire
 * avance en glissant sa carte d'une colonne à l'autre ; pendant le geste, deux
 * zones apparaissent en bas de l'écran pour la marquer gagnée ou perdue. Le
 * menu de la carte fait la même chose au clavier et sur écran tactile.
 */
export function PipelineBoard({ columns, summary, now, filters, onAdd }: { columns: PipelineColumn[]; summary: StageSummary[]; now: Date; filters: CrmFilters; onAdd: (stage: CrmStage) => void }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<CrmStage | null>(null);
  const [, startMove] = useTransition();
  const [moves, setMoves] = useState<Record<string, CrmStage>>({});
  const [lost, setLost] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Un déplacement confirmé par le serveur (la carte y est à sa nouvelle étape, ou a quitté le tableau) n'a plus à être simulé
  useEffect(() => {
    setMoves((current) => {
      const stages = new Map(columns.flatMap((column) => column.cards).map((card) => [card.id, card.stage]));
      const pending = Object.entries(current).filter(([id, stage]) => stages.has(id) && stages.get(id) !== stage);
      return pending.length === Object.keys(current).length ? current : Object.fromEntries(pending);
    });
  }, [columns]);

  const board = useMemo(() => projectMoves(columns, moves), [columns, moves]);
  const cards = useMemo(() => columns.flatMap((column) => column.cards), [columns]);
  const leaving = (stage: CrmStage) => Object.entries(moves).filter(([id, target]) => target === stage && cards.some((card) => card.id === id)).length;
  const closed = (stage: CrmStage) => (summary.find((entry) => entry.stage === stage)?.count ?? 0) + leaving(stage);
  const openCount = board.reduce((total, column) => total + column.count, 0);
  const openValue = board.reduce((total, column) => total + column.monthlyValue, 0);

  const move = (id: string, stage: CrmStage, lostReason?: string) => {
    setMoves((current) => ({ ...current, [id]: stage }));
    startMove(async () => {
      const result = await setStage({ id, stage, lostReason });
      if (!result.ok) {
        setError(result.error);
        setMoves((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
      } else setError(null);
      router.refresh();
    });
  };
  const request = (card: ContactListRow, stage: CrmStage) => {
    if (card.stage === stage) return;
    if (stage === "lost") {
      setReason("");
      setLost({ id: card.id, name: displayName(card) });
    } else move(card.id, stage);
  };

  /** Gestes communs aux colonnes et aux zones « Gagné » / « Perdu ». */
  const target = (stage: CrmStage) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Seules nos cartes se déposent ici (elles portent leur identifiant en texte)
      if (!dragging && !event.dataTransfer.types.includes("text/plain")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOver(stage);
    },
    onDragLeave: () => setOver((current) => (current === stage ? null : current)),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain") || dragging;
      const card = board.flatMap((column) => column.cards).find((entry) => entry.id === id);
      setOver(null);
      setDragging(null);
      if (card) request(card, stage);
    },
  });

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-sm text-ink-700">
          <span className="font-semibold text-ink-900">
            {openCount.toLocaleString("fr-FR")} affaire{openCount > 1 ? "s" : ""} en cours
          </span>
          {openValue > 0 ? <span className="tabular-nums"> · {euros(openValue)} par mois</span> : null}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={filtersHref({ ...filters, view: "liste", stages: ["won"], page: 1 })} className="font-medium text-ink-700 underline-offset-4 hover:text-primary-700 hover:underline">
            <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success-500" />
            Gagnées · {closed("won").toLocaleString("fr-FR")}
          </Link>
          <Link href={filtersHref({ ...filters, view: "liste", stages: ["lost"], page: 1 })} className="font-medium text-ink-700 underline-offset-4 hover:text-primary-700 hover:underline">
            <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-danger-500" />
            Perdues · {closed("lost").toLocaleString("fr-FR")}
          </Link>
        </p>
      </div>

      {/* Le tableau sort de la colonne centrale et prend la largeur de l'écran : ses six étapes tiennent côte à côte
          sur un écran d'ordinateur, et une carte se glisse de la première à la dernière sans faire défiler */}
      <div className="mx-[calc((100%-100vw)/2+1.5rem)] mt-3 overflow-x-auto pb-4">
        <div className="flex gap-1.5">
          {board.map((column, index) => {
            const meta = STAGE_META[column.stage];
            return (
              <section key={column.stage} aria-label={`${meta.label} : ${column.count} affaire${column.count > 1 ? "s" : ""}`} {...target(column.stage)} className="flex min-w-56 flex-1 basis-0 flex-col">
                <header className={clsx("bg-white py-2.5 pr-6", index === 0 ? "pl-4" : "pl-7")} style={{ clipPath: index === 0 ? CHEVRON_FIRST : CHEVRON }}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-sm font-semibold text-ink-900" title={meta.hint}>
                      {meta.label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => onAdd(column.stage)}
                      aria-label={`Ajouter une affaire à l'étape ${meta.label}`}
                      title="Ajouter une affaire ici"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base leading-none text-ink-500 hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:outline-none"
                    >
                      +
                    </button>
                  </div>
                  <p className="truncate text-xs text-ink-500 tabular-nums">
                    {euros(column.monthlyValue)} · {column.count.toLocaleString("fr-FR")} affaire{column.count > 1 ? "s" : ""}
                  </p>
                </header>
                <ul className={clsx("mt-1.5 flex min-h-[26rem] flex-1 flex-col gap-2 rounded-xl p-2 transition-colors", over === column.stage ? "bg-primary-100 ring-2 ring-primary-300 ring-inset" : "bg-cream-200/60")}>
                  {column.cards.map((card) => (
                    <PipelineCard
                      key={card.id}
                      card={card}
                      now={now}
                      dragging={dragging === card.id}
                      onDragStart={() => setDragging(card.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onMove={(stage) => request(card, stage)}
                    />
                  ))}
                  {column.count > column.cards.length ? (
                    <li>
                      <Link href={filtersHref({ ...filters, view: "liste", stages: [column.stage], page: 1 })} className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-primary-700 hover:bg-white">
                        Voir les {column.count.toLocaleString("fr-FR")} affaires (les {PIPELINE_COLUMN_LIMIT} premières sont affichées)
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {/* Pendant qu'une carte est tenue : la lâcher ici clôt l'affaire */}
      {dragging ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-cream-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.1)]">
          <div {...target("lost")} data-drop="lost" className={clsx("flex-1 rounded-xl border-2 border-dashed py-4 text-center text-sm font-semibold transition-colors", over === "lost" ? "border-danger-500 bg-danger-500 text-white" : "border-danger-500/60 bg-danger-100 text-danger-500")}>
            Perdu
          </div>
          <div {...target("won")} data-drop="won" className={clsx("flex-1 rounded-xl border-2 border-dashed py-4 text-center text-sm font-semibold transition-colors", over === "won" ? "border-success-500 bg-success-500 text-white" : "border-success-500/60 bg-success-100 text-success-500")}>
            Gagné
          </div>
        </div>
      ) : null}

      <Modal
        open={lost !== null}
        onClose={() => setLost(null)}
        title="Marquer comme perdu"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLost(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (lost) move(lost.id, "lost", reason.trim() || undefined);
                setLost(null);
              }}
            >
              Marquer comme perdu
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">{lost?.name} sort du pipeline. Vous pourrez remettre l&apos;affaire en jeu depuis sa fiche.</p>
        <div className="mt-4">
          <Label htmlFor="crm-lost-reason">Motif (facultatif)</Label>
          <Input id="crm-lost-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Trop cher, pas le moment, a choisi un concurrent…" maxLength={200} />
        </div>
      </Modal>
    </div>
  );
}

function PipelineCard({ card, now, dragging, onDragStart, onDragEnd, onMove }: { card: ContactListRow; now: Date; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (stage: CrmStage) => void }) {
  const name = displayName(card);
  const due = card.nextActionAt ? dueLabel(new Date(card.nextActionAt), now) : null;
  const value = contactMonthlyValue(card);
  const context = [card.company && card.company !== name ? card.company : "", card.profession, card.city].filter(Boolean).join(" · ");
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.effectAllowed = "move";
        // L'état change à l'image suivante : modifier la carte pendant « dragstart » ferait avorter le glisser dans Chrome
        requestAnimationFrame(onDragStart);
      }}
      onDragEnd={onDragEnd}
      className={clsx("group relative cursor-grab rounded-lg border border-cream-200 bg-white p-3 shadow-sm transition-shadow hover:border-primary-300 hover:shadow-md active:cursor-grabbing", dragging && "opacity-40")}
    >
      {/* Toute la carte ouvre la fiche */}
      <Link
        href={`/crm/${card.id}`}
        prefetch={false}
        draggable={false}
        className="block pr-6 text-sm font-semibold text-ink-900 after:absolute after:inset-0 after:rounded-lg group-hover:text-primary-700 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary-400"
      >
        {name}
      </Link>
      {context ? <p className="mt-0.5 truncate text-xs text-ink-500">{context}</p> : null}
      {card.doNotContact ? <p className="mt-1 text-xs font-medium text-danger-500">Ne pas contacter</p> : null}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-700 tabular-nums">{value > 0 ? `${euros(value)}/mois` : ""}</span>
        <TaskStatus due={due} task={card.nextAction} />
      </div>

      <label className="absolute top-1.5 right-1.5 z-10 grid h-7 w-7 place-items-center rounded-md text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 hover:bg-cream-100 [@media(hover:none)]:opacity-100">
        <span className="sr-only">Déplacer {name} vers une autre étape</span>
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
        {/* La colonne dit déjà l'étape : le menu ne propose que les autres */}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onMove(event.target.value as CrmStage);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">Déplacer vers…</option>
          {CRM_STAGES.filter((stage) => stage !== card.stage).map((stage) => (
            <option key={stage} value={stage}>
              {stage === "won" ? "Gagné" : STAGE_META[stage].label}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

/** Prochaine tâche de l'affaire, d'un coup d'œil : en retard, pour aujourd'hui, prévue, ou aucune. */
function TaskStatus({ due, task }: { due: { text: string; tone: "danger" | "warning" | "neutral" } | null; task: string | null }) {
  if (!due) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-500" title="Aucune tâche prévue">
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M8 1.6 15 14H1L8 1.6Zm-.75 4.9v3.6h1.5V6.5h-1.5Zm0 4.6v1.5h1.5v-1.5h-1.5Z" />
        </svg>
        <span className="sr-only">Aucune tâche prévue</span>
      </span>
    );
  }
  const label = [task, due.text].filter(Boolean).join(" · ");
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5 text-xs", due.tone === "danger" ? "font-medium text-danger-500" : due.tone === "warning" ? "font-medium text-success-500" : "text-ink-500")} title={label}>
      <span className="truncate">{due.text}</span>
      <span aria-hidden className={clsx("grid h-4 w-4 shrink-0 place-items-center rounded-full text-white", due.tone === "danger" ? "bg-danger-500" : due.tone === "warning" ? "bg-success-500" : "bg-ink-300")}>
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 3.5 4.5 4.5L6 12.5" />
        </svg>
      </span>
    </span>
  );
}
