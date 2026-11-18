"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input } from "@theralys/ui";
import { dateTime } from "@/lib/crm/format";
import { STAGE_META, displayName, sourceLabel, type CrmStage } from "@/lib/crm/model";
import { fold, formatPhone } from "@/lib/crm/normalize";
import { purgeFromTrash, restoreFromTrash } from "../actions";

export type TrashItem = {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  profession: string;
  city: string;
  email: string | null;
  phone: string | null;
  source: string;
  /** Étape où la fiche reviendra si on la restaure */
  stage: CrmStage;
  deletedAt: string;
};

/** Tout ce qui a été supprimé du CRM : chaque fiche se restaure à son étape d'origine, ou s'efface pour de bon. */
export function TrashClient({ rows, total, limit }: { rows: TrashItem[]; total: number; limit: number }) {
  const router = useRouter();
  const [working, startWork] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((row) => {
      const haystack = fold([row.firstName, row.lastName, row.company, row.profession, row.city, row.email ?? "", row.phone ?? "", sourceLabel(row.source)].join(" "));
      return words.every((word) => haystack.includes(word));
    });
  }, [rows, query]);
  // Une fiche restaurée ou effacée quitte la sélection
  useEffect(() => {
    setSelected((current) => {
      const present = new Set(rows.map((row) => row.id));
      const kept = [...current].filter((id) => present.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [rows]);

  const shownIds = shown.map((row) => row.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const plural = (count: number) => `${count.toLocaleString("fr-FR")} fiche${count > 1 ? "s" : ""}`;

  const restore = (ids: string[]) =>
    startWork(async () => {
      const result = await restoreFromTrash({ ids });
      setError(result.ok ? null : result.error);
      setMessage(result.ok ? `${plural(result.count)} ${result.count > 1 ? "restaurées" : "restaurée"} dans le pipeline.` : null);
      router.refresh();
    });
  const purge = (ids: string[] | undefined, question: string) => {
    if (!window.confirm(question)) return;
    startWork(async () => {
      const result = await purgeFromTrash(ids ? { ids } : {});
      setError(result.ok ? null : result.error);
      setMessage(result.ok ? `${plural(result.count)} ${result.count > 1 ? "effacées" : "effacée"} définitivement.` : null);
      router.refresh();
    });
  };

  return (
    <div>
      <Link href="/crm" className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline">
        ← Retour au CRM
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Corbeille</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">Tout ce que vous supprimez du CRM arrive ici, avec son historique. Une fiche restaurée retrouve son étape d&apos;origine. Rien n&apos;est effacé tant que vous ne le demandez pas.</p>
        </div>
        {total > 0 ? (
          <Button variant="danger" disabled={working} onClick={() => purge(undefined, `Vider la corbeille ? ${plural(total)} et leur historique seront effacés définitivement. Cette action ne s'annule pas.`)}>
            Vider la corbeille
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger-500">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 text-sm text-ink-700">
          {message}
        </p>
      ) : null}

      {total === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <p className="text-lg font-semibold text-ink-900">La corbeille est vide</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700">Les prospects que vous supprimez depuis le pipeline, la liste ou leur fiche apparaîtront ici.</p>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <label htmlFor="crm-trash-search" className="sr-only">
                Chercher dans la corbeille
              </label>
              <Input id="crm-trash-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher dans la corbeille : nom, cabinet, e-mail, ville…" />
            </div>
            <p className="text-sm text-ink-500">
              {query.trim() ? `${plural(shown.length)} sur ${total.toLocaleString("fr-FR")}` : plural(total)}
              {total > rows.length ? ` (les ${limit} plus récentes sont affichées)` : ""}
            </p>
          </div>

          {selected.size > 0 ? (
            <div className="sticky top-2 z-30 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm text-primary-900 shadow-sm">
              <span className="font-medium">
                {plural(selected.size)} {selected.size > 1 ? "sélectionnées" : "sélectionnée"}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" disabled={working} onClick={() => restore([...selected])}>
                  Restaurer
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={working}
                  onClick={() => purge([...selected], `Effacer définitivement ${plural(selected.size)} et leur historique ? Cette action ne s'annule pas.`)}
                >
                  Effacer définitivement
                </Button>
              </div>
            </div>
          ) : null}

          <Card className="mt-3 overflow-x-auto p-0" aria-busy={working}>
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b border-cream-200 text-left text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="w-10 py-3 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Sélectionner toutes les fiches affichées"
                      checked={allShown}
                      onChange={() => setSelected((current) => (allShown ? new Set([...current].filter((id) => !shownIds.includes(id))) : new Set([...current, ...shownIds])))}
                      className="h-4 w-4 rounded border-ink-300"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Prospect</th>
                  <th className="px-3 py-3 font-medium">Contact</th>
                  <th className="px-3 py-3 font-medium">Étape d&apos;origine</th>
                  <th className="px-3 py-3 font-medium">Supprimé le</th>
                  <th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const name = displayName(row);
                  const context = [row.company && row.company !== name ? row.company : "", row.profession, row.city].filter(Boolean).join(" · ");
                  return (
                    <tr key={row.id} className="border-b border-cream-200 align-top last:border-b-0">
                      <td className="py-3 pl-4">
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${name}`}
                          checked={selected.has(row.id)}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                          className="h-4 w-4 rounded border-ink-300"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/crm/${row.id}`} prefetch={false} className="font-medium text-ink-900 underline-offset-4 hover:text-primary-700 hover:underline">
                          {name}
                        </Link>
                        {context ? <p className="text-xs text-ink-500">{context}</p> : null}
                        <p className="text-xs text-ink-500">{sourceLabel(row.source)}</p>
                      </td>
                      <td className="px-3 py-3 text-ink-700">
                        {row.email ? <p className="break-all">{row.email}</p> : null}
                        {row.phone ? <p className="tabular-nums">{formatPhone(row.phone)}</p> : null}
                        {!row.email && !row.phone ? <span className="text-ink-500">—</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STAGE_META[row.stage].tone}>{STAGE_META[row.stage].label}</Badge>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-700">{dateTime(new Date(row.deletedAt))}</td>
                      <td className="px-3 py-3 pr-4">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" disabled={working} onClick={() => restore([row.id])} aria-label={`Restaurer ${name}`}>
                            Restaurer
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={working}
                            onClick={() => purge([row.id], `Effacer définitivement la fiche de ${name} et tout son historique ? Cette action ne s'annule pas.`)}
                            aria-label={`Effacer définitivement ${name}`}
                          >
                            Effacer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-500">
                      Aucune fiche supprimée ne correspond à « {query.trim()} ».
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
