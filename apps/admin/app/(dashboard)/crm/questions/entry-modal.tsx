"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button, Label, Modal, Select } from "@theralys/ui";
import { KIND_LABELS, KNOWLEDGE_CATEGORIES, KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, type KnowledgeKind } from "@/lib/crm/knowledge/model";
import type { KnowledgeRow } from "@/lib/crm/knowledge/store";
import { saveKnowledge } from "./actions";

type Values = { question: string; kind: KnowledgeKind; category: string; reply: string; details: string };

const EMPTY: Values = { question: "", kind: "question", category: KNOWLEDGE_CATEGORIES[0].id, reply: "", details: "" };

const AREA =
  "w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100";

/**
 * L'admin écrit une fiche, ou corrige celle de l'assistant. Enregistrer la
 * valide : c'est sa réponse qui fait foi, pour l'équipe comme pour
 * l'assistant, qui s'appuie sur les fiches validées.
 */
export function EntryModal({ open, onClose, entry }: { open: boolean; onClose: () => void; entry?: KnowledgeRow | null }) {
  const router = useRouter();
  const ids = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(entry ? { question: entry.question, kind: entry.kind, category: entry.category, reply: entry.reply, details: entry.details } : EMPTY);
    setError(null);
  }, [open, entry]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await saveKnowledge({ ...(entry ? { id: entry.id } : {}), ...values });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? "Corriger et valider la fiche" : "Nouvelle fiche"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer et valider"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor={`${ids}-question`}>La question, comme un praticien la pose</Label>
          <input
            id={`${ids}-question`}
            value={values.question}
            maxLength={KNOWLEDGE_LIMITS.title}
            onChange={(event) => set("question", event.target.value)}
            placeholder="Ex. : Puis-je garder mon nom de domaine ?"
            className={AREA}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${ids}-type`}>Type</Label>
            <Select id={`${ids}-type`} value={values.kind} onChange={(event) => set("kind", event.target.value as KnowledgeKind)}>
              {KNOWLEDGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${ids}-rubrique`}>Rubrique</Label>
            <Select id={`${ids}-rubrique`} value={values.category} onChange={(event) => set("category", event.target.value)}>
              {KNOWLEDGE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor={`${ids}-reponse`}>À dire au téléphone</Label>
          <textarea
            id={`${ids}-reponse`}
            rows={4}
            value={values.reply}
            maxLength={KNOWLEDGE_LIMITS.reply}
            onChange={(event) => set("reply", event.target.value)}
            placeholder="Deux à quatre phrases, telles que vous voulez les entendre de votre équipe."
            className={AREA}
          />
        </div>
        <div>
          <Label htmlFor={`${ids}-faits`}>Les faits à l&apos;appui (un par ligne)</Label>
          <textarea
            id={`${ids}-faits`}
            rows={5}
            value={values.details}
            maxLength={KNOWLEDGE_LIMITS.details}
            onChange={(event) => set("details", event.target.value)}
            placeholder={"- Un chiffre, une règle, une limite\n- Ce qu'il faut savoir pour aller plus loin"}
            className={AREA}
          />
        </div>
        <p className="text-xs text-ink-500">Une fiche validée fait foi : l&apos;assistant s&apos;en sert pour ses réponses suivantes.</p>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-100 px-3 py-2 text-sm text-[#991b1b]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
