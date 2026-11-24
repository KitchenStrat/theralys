"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { ArrowLeft, BadgeCheck, ChevronDown, Flag, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button, Card, Input } from "@theralys/ui";
import { shortDate } from "@/lib/crm/format";
import {
  EMPTY_KNOWLEDGE_FILTERS,
  KNOWLEDGE_CATEGORIES,
  categoryLabel,
  hasKnowledgeFilters,
  knowledgeHref,
  type KnowledgeFilters,
} from "@/lib/crm/knowledge/model";
import type { KnowledgeCounts, KnowledgeRow } from "@/lib/crm/knowledge/store";
import { deleteKnowledge, flagKnowledge, validateKnowledge } from "./actions";
import { AskBox } from "./ask-box";
import { EntryBody, KindChip, StatusChip } from "./entry-view";
import { EntryModal } from "./entry-modal";

type Activity = { userId: string | null; name: string; count: number; last: string }[];

const PILL = "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11";
const pill = (active: boolean) => clsx(PILL, active ? "border-primary-500 bg-primary-500 text-white" : "border-cream-300 bg-white text-ink-700 hover:border-primary-300 hover:text-primary-700");

/**
 * La base commune de l'équipe : on y pose une question, on y cherche, on la
 * parcourt rubrique par rubrique. Tout le monde lit tout ; l'admin corrige,
 * valide, supprime et écrit des fiches à la main.
 */
export function KnowledgeClient({
  admin,
  filters,
  entries,
  counts,
  truncated,
  activity,
  nowIso,
}: {
  admin: boolean;
  filters: KnowledgeFilters;
  entries: KnowledgeRow[];
  counts: KnowledgeCounts;
  /** La liste est coupée : il y a plus de fiches que la page n'en montre */
  truncated: boolean;
  /** Questions posées par personne sur 30 jours (admin seulement) */
  activity: Activity | null;
  nowIso: string;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [navigating, navigate] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [editing, setEditing] = useState<KnowledgeRow | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = (next: KnowledgeFilters) => navigate(() => router.push(knowledgeHref(next), { scroll: false }));
  const update = (patch: Partial<KnowledgeFilters>) => go({ ...filters, ...patch });
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update({ q: search.trim() });
  };

  const act = async (id: string, run: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    const result = await run();
    setBusy(null);
    if (!result.ok) setError(result.error);
    else router.refresh();
  };

  // Rubrique par rubrique, dans l'ordre de la base ; une rubrique choisie se montre seule, sans titre répété
  const grouped = KNOWLEDGE_CATEGORIES.map((category) => ({ category, rows: entries.filter((entry) => (entry.category === category.id ? true : category.id === "autre" && !KNOWLEDGE_CATEGORIES.some((known) => known.id === entry.category))) })).filter((group) => group.rows.length > 0);
  const filtered = hasKnowledgeFilters(filters);

  return (
    <div data-touch>
      <Link href="/crm" className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 text-sm font-medium text-ink-700 transition-colors hover:text-primary-700 pointer-coarse:min-h-11">
        <ArrowLeft size={15} aria-hidden />
        Retour au CRM
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Questions et objections</h1>
          <p className="mt-1 text-sm text-ink-500">La base commune de l&apos;équipe : chaque question posée l&apos;enrichit.</p>
        </div>
        {admin ? (
          <Button
            onClick={() => {
              setEditing(null);
              setModal(true);
            }}
          >
            <Plus size={16} strokeWidth={2.6} aria-hidden />
            Nouvelle fiche
          </Button>
        ) : null}
      </div>

      <div className="mt-5">
        <AskBox total={counts.total} />
      </div>

      {admin && activity && activity.length > 0 ? (
        <Card className="mt-5 p-4">
          <p className="text-sm font-semibold text-ink-900">Questions posées sur 30 jours</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-700">
            {activity.map((line) => (
              <li key={line.userId ?? line.name}>
                <span className="font-medium text-ink-900">{line.name}</span> · {line.count.toLocaleString("fr-FR")} question{line.count > 1 ? "s" : ""} <span className="text-ink-500">(dernière le {shortDate(new Date(line.last), now)})</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {counts.total === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <p className="text-lg font-semibold text-ink-900">La base est encore vide</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700">
            Posez votre première question ci-dessus : sa réponse devient la première fiche. {admin ? "Vous pouvez aussi écrire vos propres fiches avec « Nouvelle fiche »." : "Les questions de toute l'équipe arrivent ici."}
          </p>
        </Card>
      ) : (
        <>
          {/* Recherche, puis filtres : type, état, mes questions, tri */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <form onSubmit={submitSearch} role="search" className="relative min-w-0 flex-1 basis-64">
              <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500" />
              <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chercher dans la base : prix, engagement, domaine…" aria-label="Chercher dans la base" className="min-h-11 rounded-full pl-10" />
            </form>
            <button type="button" aria-pressed={filters.kind === "objection"} onClick={() => update({ kind: filters.kind === "objection" ? "" : "objection" })} className={pill(filters.kind === "objection")}>
              Objections <span className={clsx("tabular-nums", filters.kind === "objection" ? "text-white/85" : "text-ink-500")}>· {counts.objections.toLocaleString("fr-FR")}</span>
            </button>
            {admin || counts.review > 0 ? (
              <button type="button" aria-pressed={filters.status === "review"} onClick={() => update({ status: filters.status === "review" ? "" : "review" })} className={pill(filters.status === "review")}>
                À vérifier <span className={clsx("tabular-nums", filters.status === "review" ? "text-white/85" : "text-ink-500")}>· {counts.review.toLocaleString("fr-FR")}</span>
              </button>
            ) : null}
            <button type="button" aria-pressed={filters.mine} onClick={() => update({ mine: !filters.mine })} className={pill(filters.mine)}>
              Mes questions
            </button>
            <button type="button" onClick={() => update({ sort: filters.sort === "asked" ? "recent" : "asked" })} className={clsx(PILL, "border-transparent text-ink-700 hover:text-primary-700")}>
              Tri : {filters.sort === "asked" ? "les plus posées" : "les plus récentes"}
            </button>
          </div>

          {/* Rubriques */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-pressed={!filters.category} onClick={() => update({ category: "" })} className={pill(!filters.category)}>
              Toutes <span className={clsx("tabular-nums", !filters.category ? "text-white/85" : "text-ink-500")}>· {counts.total.toLocaleString("fr-FR")}</span>
            </button>
            {KNOWLEDGE_CATEGORIES.filter((category) => counts.categories[category.id] > 0 || filters.category === category.id).map((category) => (
              <button key={category.id} type="button" aria-pressed={filters.category === category.id} onClick={() => update({ category: filters.category === category.id ? "" : category.id })} className={pill(filters.category === category.id)}>
                {category.label} <span className={clsx("tabular-nums", filters.category === category.id ? "text-white/85" : "text-ink-500")}>· {counts.categories[category.id].toLocaleString("fr-FR")}</span>
              </button>
            ))}
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-danger-100 px-3 py-2 text-sm text-[#991b1b]">
              {error}
            </p>
          ) : null}

          <div className={clsx("mt-5 space-y-7 transition-opacity", navigating && "opacity-60")} aria-busy={navigating}>
            {entries.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-base font-semibold text-ink-900">Aucune fiche ne correspond</p>
                <p className="mt-1 text-sm text-ink-700">Posez la question ci-dessus : sa réponse viendra s&apos;ajouter à la base.</p>
                {filtered ? (
                  <Button variant="secondary" className="mt-4" onClick={() => { setSearch(""); go(EMPTY_KNOWLEDGE_FILTERS); }}>
                    Effacer les filtres
                  </Button>
                ) : null}
              </Card>
            ) : (
              grouped.map((group) => (
                <section key={group.category.id} aria-labelledby={`rubrique-${group.category.id}`}>
                  <h2 id={`rubrique-${group.category.id}`} className="flex items-baseline gap-2 text-base font-semibold text-ink-900">
                    {group.category.label}
                    <span className="text-sm font-normal text-ink-500">
                      {group.rows.length.toLocaleString("fr-FR")} fiche{group.rows.length > 1 ? "s" : ""}
                    </span>
                  </h2>
                  <ul className="mt-2.5 space-y-2">
                    {group.rows.map((entry) => (
                      <li key={entry.id}>
                        <details data-testid="fiche" data-status={entry.status} className="group overflow-hidden rounded-2xl border border-cream-200 bg-white open:border-primary-200 open:shadow-card">
                          <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 select-none sm:items-center [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-semibold text-ink-900">{entry.question}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                <KindChip kind={entry.kind} />
                                <StatusChip status={entry.status} />
                                {entry.askedCount > 1 ? <span className="text-xs text-ink-500">Posée {entry.askedCount.toLocaleString("fr-FR")} fois</span> : null}
                              </div>
                            </div>
                            <ChevronDown size={18} aria-hidden className="mt-1 shrink-0 text-ink-500 transition-transform group-open:rotate-180 sm:mt-0" />
                          </summary>
                          <div className="border-t border-cream-200 px-4 py-4">
                            <EntryBody entry={entry} />
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                              <p className="text-xs text-ink-500">
                                {entry.askedCount === 0 ? "Fiche écrite" : "Posée"} {entry.authorName ? `par ${entry.mine && !admin ? "vous" : entry.authorName} ` : ""}le {shortDate(new Date(entry.createdAt), now)}
                                {filters.category ? "" : ` · ${categoryLabel(entry.category)}`}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {admin ? (
                                  <>
                                    {entry.status !== "validated" ? (
                                      <Button size="sm" variant="secondary" disabled={busy === entry.id} onClick={() => act(entry.id, () => validateKnowledge(entry.id))}>
                                        <BadgeCheck size={15} aria-hidden />
                                        Valider
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => {
                                        setEditing(entry);
                                        setModal(true);
                                      }}
                                    >
                                      <Pencil size={14} aria-hidden />
                                      Corriger
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy === entry.id}
                                      onClick={() => {
                                        if (window.confirm("Supprimer cette fiche de la base ? Elle disparaît pour toute l'équipe.")) void act(entry.id, () => deleteKnowledge(entry.id));
                                      }}
                                    >
                                      <Trash2 size={14} aria-hidden />
                                      Supprimer
                                    </Button>
                                  </>
                                ) : entry.status === "ai" ? (
                                  <Button size="sm" variant="ghost" disabled={busy === entry.id} onClick={() => act(entry.id, () => flagKnowledge(entry.id))}>
                                    <Flag size={14} aria-hidden />
                                    Demander une vérification
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            {truncated ? <p className="text-center text-sm text-ink-500">Seules les premières fiches sont affichées : resserrez par rubrique ou par recherche.</p> : null}
          </div>
        </>
      )}

      {admin ? <EntryModal open={modal} onClose={() => setModal(false)} entry={editing} /> : null}
    </div>
  );
}
