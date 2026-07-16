"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, FieldHint, Input, Label, Modal, Select } from "@theralys/ui";
import { relativeTimeFr } from "@theralys/shared";
import { createLead, updateLeadNotes, updateLeadStatus } from "./actions";

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: "new" | "demo_sent" | "meeting" | "won" | "lost";
  notes: string | null;
  createdAt: string;
  context: string | null;
};

const STATUS_META: Record<LeadRow["status"], { label: string; tone: "info" | "primary" | "warning" | "success" | "danger" }> = {
  new: { label: "Nouveau", tone: "info" },
  demo_sent: { label: "Démo envoyée", tone: "primary" },
  meeting: { label: "Rendez-vous", tone: "warning" },
  won: { label: "Gagné", tone: "success" },
  lost: { label: "Perdu", tone: "danger" },
};

const SOURCE_LABELS: Record<string, string> = {
  demo: "Démo",
  landing: "Landing",
  referral: "Parrainage",
};

const PIPELINE_ORDER: LeadRow["status"][] = ["new", "demo_sent", "meeting", "won", "lost"];

export function LeadsClient({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const countsByStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return counts;
  }, [rows]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="mt-1 text-sm text-ink-500">
            {rows.length} prospect{rows.length > 1 ? "s" : ""} dans le pipeline
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Ajouter un lead</Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PIPELINE_ORDER.map((status) => (
          <Badge key={status} tone={STATUS_META[status].tone}>
            {STATUS_META[status].label} · {countsByStatus.get(status) ?? 0}
          </Badge>
        ))}
      </div>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium">Créé</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-500">
                  Aucun lead — ils se créent automatiquement à chaque démo, ou manuellement ici.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-cream-200 align-top last:border-0 hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-900">{row.name}</p>
                    <p className="text-xs text-ink-500">
                      {row.context ?? [row.email, row.phone].filter(Boolean).join(" · ") ?? ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{SOURCE_LABELS[row.source] ?? row.source}</td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={row.status}
                      aria-label={`Statut de ${row.name}`}
                      onChange={(e) =>
                        startTransition(async () => {
                          await updateLeadStatus(row.id, e.target.value);
                          router.refresh();
                        })
                      }
                      className="rounded-full border border-ink-300 bg-white px-2.5 py-1 text-xs font-medium focus:border-primary-400 focus:outline-none"
                    >
                      {PIPELINE_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={row.notes ?? ""}
                      placeholder="Ajouter une note…"
                      aria-label={`Notes pour ${row.name}`}
                      onBlur={(e) => {
                        if (e.target.value !== (row.notes ?? "")) {
                          startTransition(async () => {
                            await updateLeadNotes(row.id, e.target.value);
                            router.refresh();
                          });
                        }
                      }}
                      className="w-56 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs hover:border-ink-300 focus:border-primary-400 focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-ink-500">{relativeTimeFr(new Date(row.createdAt))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <NewLeadModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const result = await createLead({
      name: form.get("name"),
      email: form.get("email") ?? "",
      phone: form.get("phone") ?? "",
      source: form.get("source"),
      notes: form.get("notes") ?? "",
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un lead">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="lead-name">Nom *</Label>
          <Input id="lead-name" name="name" required placeholder="Prénom Nom" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" name="email" type="email" />
          </div>
          <div>
            <Label htmlFor="lead-phone">Téléphone</Label>
            <Input id="lead-phone" name="phone" />
          </div>
        </div>
        <div>
          <Label htmlFor="lead-source">Source</Label>
          <Select id="lead-source" name="source" defaultValue="landing">
            <option value="landing">Landing theralys-web.fr</option>
            <option value="referral">Parrainage</option>
            <option value="demo">Démo</option>
          </Select>
          <FieldHint>Les leads « Démo » se créent automatiquement à la création d&apos;une démo.</FieldHint>
        </div>
        <div>
          <Label htmlFor="lead-notes">Notes</Label>
          <Input id="lead-notes" name="notes" placeholder="Contexte, besoin, échéance…" />
        </div>
        {error ? <p className="text-sm text-danger-500">{error}</p> : null}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Ajout…" : "Ajouter"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
