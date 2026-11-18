"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Modal } from "@theralys/ui";
import type { ImportSummary } from "@/lib/crm/data";
import { EMPTY_FILTERS, filtersHref } from "@/lib/crm/filters";
import { shortDate } from "@/lib/crm/format";
import { sourceLabel } from "@/lib/crm/model";
import { FORMAT_LABELS, type ImportFormat } from "@/lib/crm/parse";
import { deleteImport } from "./actions";

/** Listes importées : ce que chacune a créé, et de quoi défaire un import raté. */
export function ListsModal({ open, onClose, imports, now }: { open: boolean; onClose: () => void; imports: ImportSummary[]; now: Date }) {
  const router = useRouter();
  const [working, startWork] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const remove = (entry: ImportSummary, withContacts: boolean) => {
    const question = withContacts
      ? `Supprimer la liste « ${entry.filename} » et ses ${entry.contacts.toLocaleString("fr-FR")} prospects, avec leur historique ?`
      : `Retirer la liste « ${entry.filename} » ? Ses prospects restent dans le CRM.`;
    if (!window.confirm(question)) return;
    startWork(async () => {
      const result = await deleteImport({ importId: entry.id, withContacts });
      setMessage(result.ok ? (withContacts ? `Liste supprimée, ${result.removed.toLocaleString("fr-FR")} prospects retirés.` : "Liste retirée, ses prospects sont conservés.") : result.error);
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Listes importées" size="lg">
      {imports.length === 0 ? (
        <p className="text-sm text-ink-700">Aucune liste importée pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {imports.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{entry.filename}</p>
                  <p className="text-xs text-ink-500">
                    {FORMAT_LABELS[entry.format as ImportFormat] ?? entry.format} · {shortDate(new Date(entry.createdAt), now)} · provenance « {sourceLabel(entry.source)} »
                  </p>
                  <p className="mt-0.5 text-xs text-ink-700">
                    {entry.createdCount.toLocaleString("fr-FR")} créés · {entry.updatedCount.toLocaleString("fr-FR")} complétés · {entry.skippedCount.toLocaleString("fr-FR")} ignorés · {entry.contacts.toLocaleString("fr-FR")} encore dans le CRM
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={filtersHref({ ...EMPTY_FILTERS, importId: entry.id })} onClick={onClose} className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-cream-100">
                    Voir
                  </Link>
                  <Button size="sm" variant="ghost" disabled={working} onClick={() => remove(entry, false)}>
                    Retirer la liste
                  </Button>
                  {entry.contacts > 0 ? (
                    <Button size="sm" variant="danger" disabled={working} onClick={() => remove(entry, true)}>
                      Supprimer avec ses prospects
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message ? (
        <p role="status" className="mt-3 text-sm text-ink-700">
          {message}
        </p>
      ) : null}
    </Modal>
  );
}
