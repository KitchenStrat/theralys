"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Badge, Button, Input, Label, Modal } from "@theralys/ui";
import type { ContactListRow, PipelineColumn } from "@/lib/crm/data";
import { PIPELINE_COLUMN_LIMIT, filtersHref, type CrmFilters } from "@/lib/crm/filters";
import { dueLabel, euros } from "@/lib/crm/format";
import { CRM_STAGES, STAGE_META, contactMonthlyValue, displayName, type CrmStage } from "@/lib/crm/model";
import { setStage } from "./actions";

const TOP: Record<string, string> = {
  neutral: "border-t-ink-300",
  info: "border-t-info-500",
  primary: "border-t-primary-500",
  warning: "border-t-warning-500",
  success: "border-t-success-500",
  danger: "border-t-danger-500",
};

/**
 * Pipeline : une colonne par étape du cycle de vente. Une carte se déplace en
 * la glissant d'une colonne à l'autre, ou avec son menu « Déplacer » (clavier,
 * écran tactile).
 */
export function PipelineBoard({ columns, now, filters }: { columns: PipelineColumn[]; now: Date; filters: CrmFilters }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<CrmStage | null>(null);
  const [moving, startMove] = useTransition();
  const [lost, setLost] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const move = (id: string, stage: CrmStage, lostReason?: string) =>
    startMove(async () => {
      const result = await setStage({ id, stage, lostReason });
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  const request = (card: ContactListRow, stage: CrmStage) => {
    if (card.stage === stage) return;
    if (stage === "lost") {
      setReason("");
      setLost({ id: card.id, name: displayName(card) });
    } else move(card.id, stage);
  };

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger-500">
          {error}
        </p>
      ) : null}
      {/* Le pipeline sort de la colonne centrale et prend la largeur de l'écran : ses huit étapes tiennent côte à côte
          sur un écran d'ordinateur, et une carte se glisse de la première à la dernière sans faire défiler */}
      <div className={clsx("mx-[calc((100%-100vw)/2+1.5rem)] overflow-x-auto pb-4", moving && "opacity-70")}>
        <div className="flex gap-3">
          {columns.map((column) => (
            <section
              key={column.stage}
              aria-label={`${STAGE_META[column.stage].label} : ${column.count} prospect${column.count > 1 ? "s" : ""}`}
              onDragOver={(event) => {
                // Seules nos cartes se déposent ici (elles portent leur identifiant en texte)
                if (!dragging && !event.dataTransfer.types.includes("text/plain")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(column.stage);
              }}
              onDragLeave={() => setOver((current) => (current === column.stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || dragging;
                const card = columns.flatMap((entry) => entry.cards).find((entry) => entry.id === id);
                setOver(null);
                setDragging(null);
                if (card) request(card, column.stage);
              }}
              className={clsx("flex min-w-40 flex-1 basis-0 flex-col rounded-2xl border border-t-4 bg-cream-100/70 transition-colors", TOP[STAGE_META[column.stage].tone], over === column.stage ? "border-primary-400 bg-primary-50" : "border-cream-200")}
            >
              <header className="px-3 pt-3 pb-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink-900">{STAGE_META[column.stage].label}</h2>
                  <span className="text-sm text-ink-500 tabular-nums">{column.count.toLocaleString("fr-FR")}</span>
                </div>
                <p className="truncate text-xs text-ink-500" title={STAGE_META[column.stage].hint}>{column.monthlyValue > 0 ? `${euros(column.monthlyValue)} par mois` : STAGE_META[column.stage].hint}</p>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {column.cards.map((card) => (
                  <PipelineCard key={card.id} card={card} now={now} dragging={dragging === card.id} onDragStart={() => setDragging(card.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onMove={(stage) => request(card, stage)} />
                ))}
                {column.cards.length === 0 ? <li className="rounded-xl border border-dashed border-cream-300 px-3 py-6 text-center text-xs text-ink-500">Glissez un prospect ici</li> : null}
              </ul>
              {column.count > column.cards.length ? (
                <Link href={filtersHref({ ...filters, view: "liste", stages: [column.stage], page: 1 })} className="mx-2 mb-2 rounded-xl px-3 py-2 text-center text-xs font-medium text-primary-700 hover:bg-white">
                  Voir les {column.count.toLocaleString("fr-FR")} prospects (les {PIPELINE_COLUMN_LIMIT} premiers sont affichés)
                </Link>
              ) : null}
            </section>
          ))}
        </div>
      </div>

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
        <p className="text-sm text-ink-700">{lost?.name} sort du pipeline. Vous pourrez le remettre en jeu depuis sa fiche.</p>
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
  const place = [card.profession, card.city].filter(Boolean).join(" · ");
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
      className={clsx("cursor-grab rounded-xl border border-cream-200 bg-white p-3 shadow-sm active:cursor-grabbing", dragging && "opacity-40")}
    >
      <Link href={`/crm/${card.id}`} prefetch={false} draggable={false} className="block text-sm font-medium text-ink-900 underline-offset-4 hover:text-primary-700 hover:underline">
        {name}
      </Link>
      {place ? <p className="mt-0.5 truncate text-xs text-ink-500">{place}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {due ? <Badge tone={due.tone === "danger" ? "danger" : due.tone === "warning" ? "warning" : "neutral"}>{due.text}</Badge> : null}
        {value > 0 ? <Badge tone="primary">{euros(value)}/mois</Badge> : null}
        {card.doNotContact ? <Badge tone="danger">Ne pas contacter</Badge> : null}
      </div>
      {due && card.nextAction ? <p className="mt-1.5 truncate text-xs text-ink-700">{card.nextAction}</p> : null}
      <label className="mt-2 block">
        <span className="sr-only">Déplacer {name} vers une autre étape</span>
        {/* La colonne dit déjà l'étape : le menu ne propose que les autres */}
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onMove(event.target.value as CrmStage);
          }}
          className="w-full rounded-lg border border-cream-300 bg-cream-50 px-2 py-1 text-xs text-ink-700 focus:border-primary-400 focus:outline-none"
        >
          <option value="">Déplacer vers…</option>
          {CRM_STAGES.filter((stage) => stage !== card.stage).map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_META[stage].label}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
