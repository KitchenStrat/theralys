"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type DragEvent } from "react";
import { clsx } from "clsx";
import { ChevronRight, CircleX, EllipsisVertical, Plus, Trash2, TriangleAlert, Trophy, X } from "lucide-react";
import { Button, Input, Label, Modal } from "@theralys/ui";
import type { ContactListRow, PipelineColumn, StageSummary } from "@/lib/crm/data";
import { PIPELINE_COLUMN_LIMIT, filtersHref, type CrmFilters } from "@/lib/crm/filters";
import { dueLabel, euros } from "@/lib/crm/format";
import { CRM_STAGES, STAGE_META, contactMonthlyValue, displayName, type CrmStage } from "@/lib/crm/model";
import { STAGE_COLOR } from "@/lib/crm/stage-style";
import { deleteContact, restoreFromTrash, setStage } from "./actions";
import { Avatar, StageIcon } from "./ui";

/** Où une carte peut être lâchée : une étape, ou la corbeille. */
type Target = CrmStage | "trash";

/** Message flottant après une action : une suppression s'annule, une affaire gagnée se fête. */
type Notice = { kind: "trash"; id: string; name: string } | { kind: "won"; name: string };

/** En-têtes en chevrons : la suite des étapes se lit comme un seul parcours, de gauche à droite. */
const CHEVRON_FIRST = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";
const CHEVRON = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

const stageVar = (stage: CrmStage) => ({ "--stage": STAGE_COLOR[stage] }) as CSSProperties;

/**
 * Colonnes telles qu'elles seront une fois les déplacements en cours enregistrés :
 * une carte change de colonne dès qu'on la lâche, sans attendre la réponse du serveur.
 */
export function projectMoves(columns: PipelineColumn[], moves: Record<string, Target>): PipelineColumn[] {
  let board = columns;
  for (const [id, stage] of Object.entries(moves)) {
    const card = board.flatMap((column) => column.cards).find((entry) => entry.id === id);
    if (!card || card.stage === stage) continue;
    const value = contactMonthlyValue(card);
    board = board.map((column) => {
      if (column.stage === card.stage) return { ...column, count: column.count - 1, monthlyValue: column.monthlyValue - value, cards: column.cards.filter((entry) => entry.id !== id) };
      if (column.stage === stage) return { ...column, count: column.count + 1, monthlyValue: column.monthlyValue + value, cards: [{ ...card, stage: column.stage }, ...column.cards] };
      return column;
    });
  }
  return board;
}

/**
 * Pipeline : une colonne par étape en cours du cycle de vente. Une affaire
 * avance en glissant sa carte d'une colonne à l'autre ; pendant le geste, trois
 * zones apparaissent en bas de l'écran pour la supprimer, la marquer perdue ou
 * gagnée. Le menu de la carte fait la même chose au clavier et sur écran
 * tactile. Une carte supprimée part à la corbeille, d'où elle se restaure.
 */
export function PipelineBoard({ columns, summary, now, filters, onAdd }: { columns: PipelineColumn[]; summary: StageSummary[]; now: Date; filters: CrmFilters; onAdd: (stage: CrmStage) => void }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Target | null>(null);
  const [, startMove] = useTransition();
  const [moves, setMoves] = useState<Record<string, Target>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [party, setParty] = useState(0);
  const [lost, setLost] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{ notice?: ReturnType<typeof setTimeout>; landed?: ReturnType<typeof setTimeout>; party?: ReturnType<typeof setTimeout> }>({});

  // Un déplacement confirmé par le serveur (la carte y est à sa nouvelle étape, ou a quitté le tableau) n'a plus à être simulé
  useEffect(() => {
    setMoves((current) => {
      const stages = new Map(columns.flatMap((column) => column.cards).map((card) => [card.id, card.stage]));
      const pending = Object.entries(current).filter(([id, stage]) => stages.has(id) && stages.get(id) !== stage);
      return pending.length === Object.keys(current).length ? current : Object.fromEntries(pending);
    });
  }, [columns]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.notice);
      clearTimeout(pending.landed);
      clearTimeout(pending.party);
    };
  }, []);

  const board = useMemo(() => projectMoves(columns, moves), [columns, moves]);
  const cards = useMemo(() => columns.flatMap((column) => column.cards), [columns]);
  const leaving = (stage: CrmStage) => Object.entries(moves).filter(([id, target]) => target === stage && cards.some((card) => card.id === id)).length;
  const closed = (stage: CrmStage) => (summary.find((entry) => entry.stage === stage)?.count ?? 0) + leaving(stage);
  const openCount = board.reduce((total, column) => total + column.count, 0);
  const openValue = board.reduce((total, column) => total + column.monthlyValue, 0);

  /** Affiche un message flottant, qui s'efface de lui-même. */
  const announce = (next: Notice) => {
    clearTimeout(timers.current.notice);
    setNotice(next);
    timers.current.notice = setTimeout(() => setNotice(null), next.kind === "won" ? 4500 : 10_000);
  };
  const forget = (id: string) => setMoves((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));

  const move = (card: ContactListRow, stage: CrmStage, lostReason?: string) => {
    setMoves((current) => ({ ...current, [card.id]: stage }));
    if (stage === "won") {
      // Une affaire gagnée se fête : confettis et message, sans attendre le serveur
      announce({ kind: "won", name: displayName(card) });
      clearTimeout(timers.current.party);
      setParty((count) => count + 1);
      timers.current.party = setTimeout(() => setParty(0), 1600);
    } else if (stage !== "lost") {
      clearTimeout(timers.current.landed);
      setLanded(card.id);
      timers.current.landed = setTimeout(() => setLanded(null), 800);
    }
    startMove(async () => {
      const result = await setStage({ id: card.id, stage, lostReason });
      if (!result.ok) {
        setError(result.error);
        forget(card.id);
      } else setError(null);
      router.refresh();
    });
  };
  const remove = (card: ContactListRow) => {
    setMoves((current) => ({ ...current, [card.id]: "trash" }));
    startMove(async () => {
      const result = await deleteContact(card.id);
      if (result.ok) {
        setError(null);
        announce({ kind: "trash", id: card.id, name: displayName(card) });
      } else {
        setError(result.error);
        forget(card.id);
      }
      router.refresh();
    });
  };
  const restore = (id: string) => {
    setNotice(null);
    forget(id);
    startMove(async () => {
      const result = await restoreFromTrash({ ids: [id] });
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  };
  const request = (card: ContactListRow, stage: Target) => {
    if (card.stage === stage) return;
    if (stage === "trash") remove(card);
    else if (stage === "lost") {
      setReason("");
      setLost({ id: card.id, name: displayName(card) });
    } else move(card, stage);
  };

  /** Gestes communs aux colonnes et aux zones « Supprimer », « Perdu » et « Gagné ». */
  const target = (stage: Target) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Seules nos cartes se déposent ici (elles portent leur identifiant en texte)
      if (!dragging && !event.dataTransfer.types.includes("text/plain")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOver(stage);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      // Passer d'un enfant à l'autre de la même zone n'est pas en sortir
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setOver((current) => (current === stage ? null : current));
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain") || dragging;
      const card = board.flatMap((column) => column.cards).find((entry) => entry.id === id);
      setOver(null);
      setDragging(null);
      if (card) request(card, stage);
    },
  });
  const held = dragging ? board.flatMap((column) => column.cards).find((card) => card.id === dragging) : undefined;

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
          <Link href={filtersHref({ ...filters, view: "liste", stages: ["won"], page: 1 })} className="inline-flex items-center gap-1.5 font-medium text-ink-700 underline-offset-4 hover:text-primary-700 hover:underline">
            <StageIcon stage="won" size="xs" />
            Gagnées · <span key={closed("won")} className="crm-count tabular-nums">{closed("won").toLocaleString("fr-FR")}</span>
          </Link>
          <Link href={filtersHref({ ...filters, view: "liste", stages: ["lost"], page: 1 })} className="inline-flex items-center gap-1.5 font-medium text-ink-700 underline-offset-4 hover:text-primary-700 hover:underline">
            <StageIcon stage="lost" size="xs" />
            Perdues · <span key={closed("lost")} className="crm-count tabular-nums">{closed("lost").toLocaleString("fr-FR")}</span>
          </Link>
        </p>
      </div>

      {/* Répartition des affaires en cours entre les étapes : les colonnes, juste dessous, en sont la légende */}
      {openCount > 0 ? (
        <div className="crm-funnel mt-2.5" role="img" aria-label={`Répartition des affaires en cours : ${board.filter((column) => column.count > 0).map((column) => `${STAGE_META[column.stage].label} ${column.count}`).join(", ")}`}>
          {board
            .filter((column) => column.count > 0)
            .map((column, index) => (
              <span key={column.stage} title={`${STAGE_META[column.stage].label} : ${column.count.toLocaleString("fr-FR")} affaire${column.count > 1 ? "s" : ""} (${Math.round((column.count / openCount) * 100)} %)`} style={{ ...stageVar(column.stage), flexGrow: column.count, "--i": index } as CSSProperties} />
            ))}
        </div>
      ) : null}

      {/* Le tableau sort de la colonne centrale et prend la largeur de l'écran : ses six étapes tiennent côte à côte
          sur un écran d'ordinateur, et une carte se glisse de la première à la dernière sans faire défiler */}
      <div className="mx-[calc((100%-100vw)/2+1.5rem)] mt-3 overflow-x-auto pb-4">
        <div className="flex gap-1.5">
          {board.map((column, index) => {
            const meta = STAGE_META[column.stage];
            const isOver = over === column.stage && held !== undefined && held.stage !== column.stage;
            return (
              <section key={column.stage} aria-label={`${meta.label} : ${column.count} affaire${column.count > 1 ? "s" : ""}`} {...target(column.stage)} style={stageVar(column.stage)} className="flex min-w-56 flex-1 basis-0 flex-col">
                <header className={clsx("relative bg-white pt-2.5 pr-6 pb-3", index === 0 ? "pl-4" : "pl-7")} style={{ clipPath: index === 0 ? CHEVRON_FIRST : CHEVRON }}>
                  <div className="flex items-center gap-2">
                    <StageIcon stage={column.stage} />
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900" title={meta.hint}>
                      {meta.label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => onAdd(column.stage)}
                      aria-label={`Ajouter une affaire à l'étape ${meta.label}`}
                      title="Ajouter une affaire ici"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-500 transition hover:rotate-90 hover:bg-primary-50 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:outline-none"
                    >
                      <Plus size={15} strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500 tabular-nums">
                    {euros(column.monthlyValue)} ·{" "}
                    <span key={column.count} className="crm-count">
                      {column.count.toLocaleString("fr-FR")}
                    </span>{" "}
                    affaire{column.count > 1 ? "s" : ""}
                  </p>
                  <span aria-hidden className="crm-col-bar" />
                </header>
                <ul data-over={isOver ? "" : undefined} className="crm-col-body mt-1.5 flex min-h-[26rem] flex-1 flex-col gap-2 rounded-xl p-2">
                  {isOver ? (
                    <li aria-hidden className="crm-slot rounded-lg px-3 py-3 text-center text-xs font-medium">
                      Déposer ici
                    </li>
                  ) : null}
                  {column.cards.map((card, row) => (
                    <PipelineCard
                      key={card.id}
                      card={card}
                      now={now}
                      column={index}
                      row={row}
                      dragging={dragging === card.id}
                      landed={landed === card.id}
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

      {/* Pendant qu'une carte est tenue : la lâcher ici la supprime ou clôt l'affaire */}
      {dragging ? (
        <div className="crm-dropbar fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-cream-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.1)] backdrop-blur">
          <div
            {...target("trash")}
            data-drop="trash"
            data-over={over === "trash" ? "" : undefined}
            className={clsx("crm-dropzone flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-semibold", over === "trash" ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-cream-100 text-ink-700")}
          >
            <Trash2 size={17} aria-hidden />
            Supprimer
          </div>
          <div
            {...target("lost")}
            data-drop="lost"
            data-over={over === "lost" ? "" : undefined}
            className={clsx("crm-dropzone flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-semibold", over === "lost" ? "border-danger-500 bg-danger-500 text-white" : "border-danger-500/60 bg-danger-100 text-danger-500")}
          >
            <CircleX size={17} aria-hidden />
            Perdu
          </div>
          <div
            {...target("won")}
            data-drop="won"
            data-over={over === "won" ? "" : undefined}
            className={clsx("crm-dropzone flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm font-semibold", over === "won" ? "border-success-500 bg-success-500 text-white" : "border-success-500/60 bg-success-100 text-success-500")}
          >
            <Trophy size={17} aria-hidden />
            Gagné
          </div>
        </div>
      ) : null}

      {party > 0 ? <Confetti key={party} /> : null}

      {/* Message flottant : il ne décale pas le tableau, et s'efface de lui-même */}
      {notice ? (
        <div className={clsx("pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4", dragging ? "bottom-28" : "bottom-6")}>
          <div
            role="status"
            style={stageVar(notice.kind === "won" ? "won" : "new")}
            className="crm-toast pointer-events-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-cream-200 bg-white py-2.5 pr-2.5 pl-3 text-sm text-ink-900 shadow-pop"
          >
            {notice.kind === "won" ? (
              <>
                <span className="crm-pop crm-ring rounded-full">
                  <StageIcon stage="won" size="md" />
                </span>
                <span>
                  <span className="block font-semibold">Affaire gagnée</span>
                  <span className="block text-ink-700">{notice.name} passe en client.</span>
                </span>
              </>
            ) : (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream-100 text-ink-700">
                  <Trash2 size={17} aria-hidden />
                </span>
                <span>{notice.name} est à la corbeille.</span>
                <button type="button" onClick={() => restore(notice.id)} className="rounded font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-900">
                  Annuler
                </button>
                <Link href="/crm/corbeille" className="text-ink-700 underline underline-offset-4 hover:text-primary-700">
                  Voir la corbeille
                </Link>
              </>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="Fermer ce message" className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-cream-100">
              <X size={15} aria-hidden />
            </button>
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
                const card = lost ? board.flatMap((column) => column.cards).find((entry) => entry.id === lost.id) : undefined;
                if (card) move(card, "lost", reason.trim() || undefined);
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

function PipelineCard({
  card,
  now,
  column,
  row,
  dragging,
  landed,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: ContactListRow;
  now: Date;
  column: number;
  row: number;
  dragging: boolean;
  landed: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (target: Target) => void;
}) {
  const name = displayName(card);
  const due = card.nextActionAt ? dueLabel(new Date(card.nextActionAt), now) : null;
  const value = contactMonthlyValue(card);
  const context = [card.company && card.company !== name ? card.company : "", card.profession, card.city].filter(Boolean).join(" · ");
  return (
    <li
      draggable
      data-dragging={dragging ? "" : undefined}
      data-landed={landed ? "" : undefined}
      // La cascade d'arrivée ne concerne que le haut de chaque colonne : au-delà, les cartes sont là d'emblée
      style={{ "--col": column, "--row": Math.min(row, 8) } as CSSProperties}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.effectAllowed = "move";
        // L'état change à l'image suivante : modifier la carte pendant « dragstart » ferait avorter le glisser dans Chrome
        requestAnimationFrame(onDragStart);
      }}
      onDragEnd={onDragEnd}
      className="crm-card group relative cursor-grab rounded-lg border border-cream-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start gap-2.5">
        <Avatar contact={card} />
        <div className="min-w-0 flex-1 pr-5">
          {/* Toute la carte ouvre la fiche */}
          <Link
            href={`/crm/${card.id}`}
            prefetch={false}
            draggable={false}
            className="block text-sm leading-snug font-semibold text-ink-900 after:absolute after:inset-0 after:rounded-lg group-hover:text-primary-700 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary-400"
          >
            {name}
          </Link>
          {context ? <p className="mt-0.5 truncate text-xs text-ink-500">{context}</p> : null}
        </div>
      </div>
      {card.doNotContact ? <p className="mt-1.5 text-xs font-medium text-danger-500">Ne pas contacter</p> : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-cream-100 pt-2">
        <span className="text-xs font-semibold text-ink-900 tabular-nums">{value > 0 ? `${euros(value)}/mois` : ""}</span>
        <TaskStatus due={due} task={card.nextAction} />
      </div>

      <label className="absolute top-1.5 right-1.5 z-10 grid h-7 w-7 place-items-center rounded-md text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 hover:bg-cream-100 [@media(hover:none)]:opacity-100">
        <span className="sr-only">Déplacer {name} vers une autre étape</span>
        <EllipsisVertical size={16} aria-hidden />
        {/* La colonne dit déjà l'étape : le menu ne propose que les autres */}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onMove(event.target.value as Target);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">Déplacer vers…</option>
          {CRM_STAGES.filter((stage) => stage !== card.stage).map((stage) => (
            <option key={stage} value={stage}>
              {stage === "won" ? "Gagné" : STAGE_META[stage].label}
            </option>
          ))}
          <option value="trash">Supprimer</option>
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
        <TriangleAlert size={15} strokeWidth={2.4} aria-hidden />
        <span className="sr-only">Aucune tâche prévue</span>
      </span>
    );
  }
  const label = [task, due.text].filter(Boolean).join(" · ");
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5 text-xs", due.tone === "danger" ? "font-medium text-danger-500" : due.tone === "warning" ? "font-medium text-success-500" : "text-ink-500")} title={label}>
      <span className="truncate">{due.text}</span>
      <span aria-hidden className={clsx("grid h-4 w-4 shrink-0 place-items-center rounded-full text-white", due.tone === "danger" ? "bg-danger-500" : due.tone === "warning" ? "bg-success-500" : "bg-ink-300")}>
        <ChevronRight size={11} strokeWidth={3.2} />
      </span>
    </span>
  );
}

const CONFETTI_COLORS = ["#16a34a", "#0e97dd", "#6a5fd6", "#d2559f", "#b98300", "#d9641c"];

/** Gerbe de confettis depuis la zone « Gagné » : une seconde, puis plus rien. Absente en mouvement réduit. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => {
        const angle = Math.PI * (0.15 + 0.7 * Math.random());
        const reach = 140 + Math.random() * 220;
        return {
          color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
          dx: `${Math.round(Math.cos(angle) * reach)}px`,
          dy: `${Math.round(-Math.sin(angle) * reach)}px`,
          rot: `${Math.round(Math.random() * 720 - 360)}deg`,
          delay: `${Math.round(Math.random() * 120)}ms`,
        };
      }),
    [],
  );
  return (
    <div aria-hidden className="crm-confetti right-[18%] bottom-16">
      {pieces.map((piece, index) => (
        <i key={index} style={{ "--stage": piece.color, "--dx": piece.dx, "--dy": piece.dy, "--rot": piece.rot, "--delay": piece.delay } as CSSProperties} />
      ))}
    </div>
  );
}
