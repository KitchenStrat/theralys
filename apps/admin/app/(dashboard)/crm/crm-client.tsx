"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, Input, Segmented, Select } from "@theralys/ui";
import type { ContactListRow, CrmFacets, CrmKpis, PipelineColumn, StageSummary } from "@/lib/crm/data";
import {
  ACTION_OPTIONS,
  CREATED_OPTIONS,
  DNC_OPTIONS,
  EMPTY_FILTERS,
  PLAN_OPTIONS,
  REACH_OPTIONS,
  SORT_OPTIONS,
  TOUCHED_OPTIONS,
  activeCriteria,
  criterionLabel,
  filtersHref,
  filtersToParams,
  withoutCriterion,
  type CrmFilters,
  type CrmView,
} from "@/lib/crm/filters";
import { dueLabel, euros, shortDate } from "@/lib/crm/format";
import { CRM_STAGES, STAGE_META, displayName, isCrmStage, sourceLabel, type CrmStage } from "@/lib/crm/model";
import { formatPhone } from "@/lib/crm/normalize";
import { bulkUpdate, setStage } from "./actions";
import { ContactModal } from "./contact-modal";
import { ImportModal } from "./import-modal";
import { ListsModal } from "./lists-modal";
import { PipelineBoard } from "./pipeline-board";

type ListResult = { rows: ContactListRow[]; total: number; page: number; pageCount: number };

export type CrmClientProps = {
  filters: CrmFilters;
  kpis: CrmKpis;
  facets: CrmFacets;
  summary: StageSummary[];
  list: ListResult | null;
  columns: PipelineColumn[] | null;
  nowIso: string;
};

export function CrmClient({ filters, kpis, facets, summary, list, columns, nowIso }: CrmClientProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [modal, setModal] = useState<"import" | "contact" | "lists" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);

  const go = (next: CrmFilters) => startNavigation(() => router.push(filtersHref(next), { scroll: false }));
  const update = (patch: Partial<CrmFilters>) => go({ ...filters, ...patch, page: 1 });
  const criteria = activeCriteria(filters);
  const listNames = Object.fromEntries(facets.imports.map((entry) => [entry.id, entry.filename]));
  const matching = summary.filter((entry) => filters.stages.length === 0 || filters.stages.includes(entry.stage)).reduce((total, entry) => total + entry.count, 0);
  const exportHref = `/crm/export?${filtersToParams({ ...filters, page: 1 }).toString()}`;
  const empty = kpis.total === 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="mt-1 text-sm text-ink-500">Vos prospects, de la première liste à la signature.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setModal("import")}>
            Importer une liste
          </Button>
          <Button onClick={() => setModal("contact")}>+ Nouveau prospect</Button>
        </div>
      </div>

      {/* Indicateurs : chacun ouvre la liste correspondante */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Prospects" value={kpis.total.toLocaleString("fr-FR")} hint={kpis.addedThisWeek > 0 ? `+${kpis.addedThisWeek.toLocaleString("fr-FR")} en 7 jours` : "dans le CRM"} href={filtersHref({ ...EMPTY_FILTERS })} />
        <Kpi label="En cours" value={kpis.open.toLocaleString("fr-FR")} hint="ni gagnés ni perdus" href={filtersHref({ ...EMPTY_FILTERS, stages: ["new", "contacted", "qualified", "demo", "meeting", "proposal"] })} />
        <Kpi
          label="À faire"
          value={(kpis.overdue + kpis.dueToday).toLocaleString("fr-FR")}
          hint={kpis.overdue > 0 ? `dont ${kpis.overdue.toLocaleString("fr-FR")} en retard` : "tâches du jour"}
          tone={kpis.overdue > 0 ? "danger" : kpis.dueToday > 0 ? "warning" : undefined}
          href={filtersHref({ ...EMPTY_FILTERS, action: kpis.overdue > 0 ? "overdue" : "today", sort: "action" })}
        />
        <Kpi label="Gagnés ce mois" value={kpis.wonThisMonth.toLocaleString("fr-FR")} hint={kpis.winRate === null ? "aucune affaire close" : `${Math.round(kpis.winRate * 100)} % des affaires closes`} href={filtersHref({ ...EMPTY_FILTERS, stages: ["won"] })} />
        <Kpi label="Valeur en cours" value={`${euros(kpis.openMonthlyValue)}`} hint="par mois, formules envisagées" className="col-span-2 lg:col-span-1" />
      </div>

      {empty ? (
        <Card className="mt-6 p-10 text-center">
          <p className="text-lg font-semibold text-ink-900">Aucun prospect pour l&apos;instant</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700">
            Importez une liste (CSV, Excel, JSON, carnet d&apos;adresses vCard, ou un simple copier-coller) ou ajoutez un prospect à la main. Les demandes de démo de la vitrine et les démos que vous créez arrivent ici d&apos;elles-mêmes.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={() => setModal("import")}>Importer une liste</Button>
            <Button variant="secondary" onClick={() => setModal("contact")}>
              Ajouter un prospect
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Recherche, vue, filtres */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form
              role="search"
              className="flex min-w-0 flex-1 basis-64 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                update({ q: search.trim() });
              }}
            >
              <label htmlFor="crm-search" className="sr-only">
                Rechercher un prospect
              </label>
              <Input id="crm-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, cabinet, e-mail, téléphone, ville…" />
              <Button type="submit" variant="secondary">
                Rechercher
              </Button>
            </form>
            <Segmented<CrmView>
              aria-label="Affichage"
              value={filters.view}
              onChange={(view) => go({ ...filters, view, page: 1 })}
              options={[
                { value: "liste", label: "Liste" },
                { value: "pipeline", label: "Pipeline" },
              ]}
            />
            <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="crm-filters" onClick={() => setFiltersOpen((open) => !open)}>
              Filtres{criteria.filter((criterion) => criterion !== "q" && criterion !== "stages").length > 0 ? ` (${criteria.filter((criterion) => criterion !== "q" && criterion !== "stages").length})` : ""}
            </Button>
          </div>

          {filtersOpen ? (
            <Card id="crm-filters" className="mt-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterSelect id="crm-filter-source" label="Provenance" value={filters.source} onChange={(source) => update({ source })} options={facets.sources.map((facet) => ({ value: facet.value, label: `${sourceLabel(facet.value)} (${facet.count})` }))} />
                <FilterSelect id="crm-filter-metier" label="Métier" value={filters.profession} onChange={(profession) => update({ profession })} options={facets.professions.map((facet) => ({ value: facet.value, label: `${facet.value} (${facet.count})` }))} />
                <FilterSelect id="crm-filter-ville" label="Ville" value={filters.city} onChange={(city) => update({ city })} options={facets.cities.map((facet) => ({ value: facet.value, label: `${facet.value} (${facet.count})` }))} />
                <FilterSelect id="crm-filter-dept" label="Département" value={filters.department} onChange={(department) => update({ department })} options={facets.departments.map((facet) => ({ value: facet.value, label: `${facet.value} (${facet.count})` }))} />
                <FilterSelect id="crm-filter-tag" label="Étiquette" value={filters.tag} onChange={(tag) => update({ tag })} options={facets.tags.map((facet) => ({ value: facet.value, label: `${facet.value} (${facet.count})` }))} />
                <FilterSelect id="crm-filter-liste" label="Liste importée" value={filters.importId} onChange={(importId) => update({ importId })} options={facets.imports.map((entry) => ({ value: entry.id, label: `${entry.filename} (${entry.contacts})` }))} />
                <FilterSelect id="crm-filter-joindre" label="Moyen de contact" value={filters.reach} onChange={(reach) => update({ reach: reach as CrmFilters["reach"] })} options={entries(REACH_OPTIONS)} />
                <FilterSelect id="crm-filter-action" label="Tâches" value={filters.action} onChange={(action) => update({ action: action as CrmFilters["action"] })} options={entries(ACTION_OPTIONS)} />
                <FilterSelect id="crm-filter-cree" label="Date d'ajout" value={filters.created} onChange={(created) => update({ created: created as CrmFilters["created"] })} options={entries(CREATED_OPTIONS)} />
                <FilterSelect id="crm-filter-relance" label="Dernier contact" value={filters.touched} onChange={(touched) => update({ touched: touched as CrmFilters["touched"] })} options={entries(TOUCHED_OPTIONS)} />
                <FilterSelect id="crm-filter-formule" label="Formule envisagée" value={filters.plan} onChange={(plan) => update({ plan: plan as CrmFilters["plan"] })} options={entries(PLAN_OPTIONS)} />
                <FilterSelect id="crm-filter-opposition" label="Ne pas contacter" value={filters.dnc} onChange={(dnc) => update({ dnc: dnc as CrmFilters["dnc"] })} options={entries(DNC_OPTIONS)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-3">
                <button type="button" onClick={() => setModal("lists")} className="rounded text-sm font-medium text-primary-700 underline underline-offset-4 hover:text-primary-900">
                  Gérer les listes importées ({facets.imports.length})
                </button>
                {criteria.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => go({ ...EMPTY_FILTERS, view: filters.view, sort: filters.sort })}>
                    Tout effacer
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {/* Étapes du cycle de vente : un clic filtre, plusieurs se cumulent */}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par étape">
            {summary.map((entry) => {
              const active = filters.stages.includes(entry.stage);
              return (
                <button
                  key={entry.stage}
                  type="button"
                  aria-pressed={active}
                  title={STAGE_META[entry.stage].hint}
                  onClick={() => update({ stages: active ? filters.stages.filter((stage) => stage !== entry.stage) : [...filters.stages, entry.stage] })}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "border-primary-500 bg-primary-500 text-white" : "border-cream-300 bg-white text-ink-700 hover:border-primary-300 hover:text-primary-700",
                  )}
                >
                  {STAGE_META[entry.stage].label} <span className={clsx("tabular-nums", active ? "text-white/85" : "text-ink-500")}>· {entry.count.toLocaleString("fr-FR")}</span>
                </button>
              );
            })}
          </div>

          {criteria.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {criteria
                .filter((criterion) => criterion !== "stages")
                .map((criterion) => (
                  <span key={criterion} className="inline-flex items-center gap-1 rounded-full bg-primary-50 py-1 pr-1 pl-3 text-sm text-primary-900">
                    {criterionLabel(filters, criterion, listNames)}
                    <button type="button" onClick={() => go(withoutCriterion(filters, criterion))} aria-label={`Retirer le filtre « ${criterionLabel(filters, criterion, listNames)} »`} className="grid h-6 w-6 place-items-center rounded-full text-primary-700 hover:bg-primary-100">
                      ×
                    </button>
                  </span>
                ))}
              <span className="text-sm text-ink-500">
                {matching.toLocaleString("fr-FR")} prospect{matching > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}

          <div className={clsx("mt-4 transition-opacity", navigating && "opacity-60")} aria-busy={navigating}>
            {list ? (
              <ContactTable list={list} filters={filters} now={now} total={list.total} exportHref={exportHref} onNavigate={go} tags={facets.tags.map((facet) => facet.value)} />
            ) : columns ? (
              <PipelineBoard columns={columns} now={now} filters={filters} />
            ) : null}
          </div>
        </>
      )}

      <ImportModal open={modal === "import"} onClose={() => setModal(null)} />
      <ContactModal open={modal === "contact"} onClose={() => setModal(null)} />
      <ListsModal open={modal === "lists"} onClose={() => setModal(null)} imports={facets.imports} now={now} />
    </div>
  );
}

function entries<T extends string>(options: Record<T, string>): { value: string; label: string }[] {
  return (Object.entries(options) as [T, string][]).map(([value, label]) => ({ value, label }));
}

function Kpi({ label, value, hint, href, tone, className }: { label: string; value: string; hint: string; href?: string; tone?: "danger" | "warning"; className?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={clsx("mt-1 text-2xl font-bold tabular-nums", tone === "danger" ? "text-danger-500" : "text-ink-900")}>{value}</p>
      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
    </>
  );
  const classes = clsx("rounded-card border border-cream-200 bg-white p-4 shadow-card", className);
  return href ? (
    <Link href={href} className={clsx(classes, "block transition hover:border-primary-300 hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

function FilterSelect({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  // Une valeur filtrée qui n'est plus proposée (liste longue, coupée) reste sélectionnable
  const all = value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-700">
        {label}
      </label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Tous</option>
        {all.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

// ─── Liste ───────────────────────────────────────────────────────────────────

function ContactTable({ list, filters, now, total, exportHref, onNavigate, tags }: { list: ListResult; filters: CrmFilters; now: Date; total: number; exportHref: string; onNavigate: (filters: CrmFilters) => void; tags: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [everything, setEverything] = useState(false);
  const [working, startWork] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const pageIds = list.rows.map((row) => row.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  // Une nouvelle page ou un nouveau filtre repart d'une sélection vide
  const resetKey = `${filtersHref(filters)}|${list.total}`;
  useEffect(() => {
    setSelected(new Set());
    setEverything(false);
  }, [resetKey]);

  const count = everything ? total : selected.size;
  const run = (action: string, value = "", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startWork(async () => {
      const target = everything ? { query: filtersToParams({ ...filters, page: 1 }).toString() } : { ids: [...selected] };
      const result = await bulkUpdate({ ...target, action, value });
      setMessage(result.ok ? `${result.count.toLocaleString("fr-FR")} prospect${result.count > 1 ? "s" : ""} mis à jour.` : result.error);
      if (result.ok) {
        setSelected(new Set());
        setEverything(false);
        setTag("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700" aria-live="polite">
          {total.toLocaleString("fr-FR")} prospect{total > 1 ? "s" : ""}
          {list.pageCount > 1 ? ` · page ${list.page} sur ${list.pageCount}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="crm-sort" className="text-sm text-ink-500">
            Trier par
          </label>
          <div className="w-52">
            <Select id="crm-sort" value={filters.sort} onChange={(event) => onNavigate({ ...filters, sort: event.target.value as CrmFilters["sort"], page: 1 })}>
              {entries(SORT_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <a href={exportHref} className="rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-cream-100">
            Exporter en CSV
          </a>
        </div>
      </div>

      {count > 0 ? (
        <div className="sticky top-[4.5rem] z-30 mb-3 rounded-2xl border border-primary-300 bg-primary-50 p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-primary-900">
              {count.toLocaleString("fr-FR")} sélectionné{count > 1 ? "s" : ""}
            </p>
            {!everything && allOnPage && total > list.rows.length ? (
              <button type="button" onClick={() => setEverything(true)} className="rounded text-sm font-medium text-primary-700 underline underline-offset-4">
                Sélectionner les {total.toLocaleString("fr-FR")} prospects de cette recherche
              </button>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label htmlFor="crm-bulk-stage" className="sr-only">
                Changer l&apos;étape de la sélection
              </label>
              <div className="w-48">
                <Select
                  id="crm-bulk-stage"
                  value=""
                  disabled={working}
                  onChange={(event) => {
                    if (event.target.value) run("stage", event.target.value);
                  }}
                >
                  <option value="">Passer à l&apos;étape…</option>
                  {CRM_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_META[stage].label}
                    </option>
                  ))}
                </Select>
              </div>
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (tag.trim()) run("tag", tag.trim());
                }}
              >
                <label htmlFor="crm-bulk-tag" className="sr-only">
                  Étiquette à ajouter à la sélection
                </label>
                <Input id="crm-bulk-tag" list="crm-tags" className="!w-36" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Étiquette" maxLength={40} />
                <datalist id="crm-tags">
                  {tags.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
                <Button type="submit" variant="secondary" size="sm" disabled={working || !tag.trim()}>
                  Étiqueter
                </Button>
              </form>
              <Button variant="secondary" size="sm" disabled={working} onClick={() => run("dnc")}>
                Ne pas contacter
              </Button>
              <Button variant="danger" size="sm" disabled={working} onClick={() => run("delete", "", `Supprimer définitivement ${count.toLocaleString("fr-FR")} prospect${count > 1 ? "s" : ""} et leur historique ?`)}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mb-3 text-sm text-ink-700">
          {message}
        </p>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-cream-200 text-left text-xs tracking-wide text-ink-500 uppercase">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Sélectionner tous les prospects de la page"
                  checked={allOnPage}
                  onChange={(event) => {
                    setEverything(false);
                    setSelected(event.target.checked ? new Set(pageIds) : new Set());
                  }}
                  className="h-4 w-4 accent-primary-600"
                />
              </th>
              <th className="px-3 py-3 font-medium">Prospect</th>
              <th className="px-3 py-3 font-medium">Contact</th>
              <th className="px-3 py-3 font-medium">Étape</th>
              <th className="px-3 py-3 font-medium">Prochaine tâche</th>
              <th className="px-3 py-3 font-medium">Provenance</th>
              <th className="px-3 py-3 font-medium">Ajouté</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-500">
                  Aucun prospect ne répond à ces critères.
                </td>
              </tr>
            ) : (
              list.rows.map((row) => <ContactRow key={row.id} row={row} now={now} checked={everything || selected.has(row.id)} onCheck={(checked) => {
                setEverything(false);
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(row.id);
                  else next.delete(row.id);
                  return next;
                });
              }} />)
            )}
          </tbody>
        </table>
      </Card>

      {list.pageCount > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pages de la liste">
          <PageLink href={filtersHref({ ...filters, page: list.page - 1 })} disabled={list.page <= 1}>
            ← Précédents
          </PageLink>
          <p className="text-sm text-ink-500">
            Page {list.page} sur {list.pageCount}
          </p>
          <PageLink href={filtersHref({ ...filters, page: list.page + 1 })} disabled={list.page >= list.pageCount}>
            Suivants →
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) return <span className="rounded-full px-4 py-2 text-sm text-ink-300">{children}</span>;
  return (
    <Link href={href} scroll={false} className="rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-cream-100">
      {children}
    </Link>
  );
}

function ContactRow({ row, now, checked, onCheck }: { row: ContactListRow; now: Date; checked: boolean; onCheck: (checked: boolean) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const name = displayName(row);
  const due = row.nextActionAt ? dueLabel(new Date(row.nextActionAt), now) : null;
  const place = [row.profession, [row.postalCode, row.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return (
    <tr className={clsx("border-b border-cream-200 align-top last:border-0", checked ? "bg-primary-50/60" : "hover:bg-cream-50")}>
      <td className="px-3 py-3">
        <input type="checkbox" aria-label={`Sélectionner ${name}`} checked={checked} onChange={(event) => onCheck(event.target.checked)} className="h-4 w-4 accent-primary-600" />
      </td>
      <td className="max-w-[18rem] px-3 py-3">
        <Link href={`/crm/${row.id}`} prefetch={false} className="font-medium text-ink-900 underline-offset-4 hover:text-primary-700 hover:underline">
          {name}
        </Link>
        {row.company && row.company !== name ? <p className="truncate text-xs text-ink-700">{row.company}</p> : null}
        {place ? <p className="truncate text-xs text-ink-500">{place}</p> : null}
        {row.tags.length > 0 || row.doNotContact ? (
          <p className="mt-1 flex flex-wrap gap-1">
            {row.doNotContact ? <Badge tone="danger">Ne pas contacter</Badge> : null}
            {row.tags.slice(0, 4).map((entry) => (
              <Badge key={entry}>{entry}</Badge>
            ))}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-ink-700">
        {row.email ? (
          <a href={`mailto:${row.email}`} className="block max-w-[14rem] truncate underline-offset-4 hover:text-primary-700 hover:underline">
            {row.email}
          </a>
        ) : null}
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="block whitespace-nowrap underline-offset-4 hover:text-primary-700 hover:underline">
            {formatPhone(row.phone)}
          </a>
        ) : null}
        {!row.email && !row.phone ? <span className="text-ink-500">—</span> : null}
      </td>
      <td className="px-3 py-3">
        <select
          value={isCrmStage(row.stage) ? row.stage : "new"}
          aria-label={`Étape de ${name}`}
          onChange={(event) =>
            startTransition(async () => {
              await setStage({ id: row.id, stage: event.target.value as CrmStage });
              router.refresh();
            })
          }
          className="rounded-full border border-ink-300 bg-white px-2.5 py-1 text-xs font-medium focus:border-primary-400 focus:outline-none"
        >
          {CRM_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_META[stage].label}
            </option>
          ))}
        </select>
      </td>
      <td className="max-w-[14rem] px-3 py-3">
        {due ? (
          <>
            <p className="truncate text-ink-900">{row.nextAction}</p>
            <p className={clsx("text-xs", due.tone === "danger" ? "font-semibold text-danger-500" : due.tone === "warning" ? "font-semibold text-ink-900" : "text-ink-500")}>{due.text}</p>
          </>
        ) : (
          <span className="text-ink-500">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-ink-700">{sourceLabel(row.source)}</td>
      <td className="px-3 py-3 whitespace-nowrap text-ink-500">{shortDate(new Date(row.createdAt), now)}</td>
    </tr>
  );
}
