"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BILLING_PERIOD_LABELS, OFFERED_PLANS, PLANS, planPeriods, type BillingPeriod } from "@theralys/db/plans";
import { Button, FieldHint, Input, Label, Modal, Select } from "@theralys/ui";
import { euros } from "@/lib/crm/format";
import { CRM_STAGES, STAGE_META, contactMonthlyValue, isPlanInterest, type CrmStage } from "@/lib/crm/model";
import { formatPhone } from "@/lib/crm/normalize";
import { saveContact } from "./actions";

export type ContactFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  company: string;
  profession: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  tags: string;
  source: string;
  stage: CrmStage;
  plan: string;
  billingPeriod: string;
  doNotContact: boolean;
};

const EMPTY: ContactFormValues = { firstName: "", lastName: "", company: "", profession: "", email: "", phone: "", website: "", address: "", postalCode: "", city: "", notes: "", tags: "", source: "manual", stage: "new", plan: "", billingPeriod: "", doNotContact: false };

/** Création ou modification d'une fiche. À la création, un doublon probable est signalé avant d'enregistrer. */
export function ContactModal({ open, onClose, initial, defaultStage }: { open: boolean; onClose: () => void; initial?: ContactFormValues; defaultStage?: CrmStage }) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [values, setValues] = useState<ContactFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setValues(initial ? { ...initial, phone: formatPhone(initial.phone) } : { ...EMPTY, stage: defaultStage ?? "new" });
      setError(null);
      setDuplicate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const field = (key: "firstName" | "lastName" | "company" | "profession" | "email" | "phone" | "website" | "address" | "postalCode" | "city" | "tags", label: string, props: { type?: string; placeholder?: string; autoComplete?: string } = {}) => (
    <div>
      <Label htmlFor={`crm-contact-${key}`}>{label}</Label>
      <Input id={`crm-contact-${key}`} value={values[key]} onChange={(event) => set(key, event.target.value)} {...props} />
    </div>
  );

  async function submit(force: boolean) {
    setSaving(true);
    setError(null);
    const result = await saveContact({ ...values, force });
    setSaving(false);
    if (result.ok) {
      onClose();
      if (editing) router.refresh();
      else router.push(`/crm/${result.id}`);
      return;
    }
    if ("duplicate" in result) setDuplicate(result.duplicate);
    else setError(result.error);
  }

  const value = contactMonthlyValue({ plan: values.plan || null, billingPeriod: values.billingPeriod || null });
  const periods = isPlanInterest(values.plan) ? planPeriods(values.plan) : [];

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier la fiche" : "Nouveau prospect"} size="lg">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "Prénom", { autoComplete: "off" })}
          {field("lastName", "Nom", { autoComplete: "off" })}
          {field("company", "Cabinet / société")}
          {field("profession", "Métier", { placeholder: "Sophrologue, ostéopathe…" })}
          {field("email", "E-mail", { type: "email", autoComplete: "off" })}
          {field("phone", "Téléphone", { type: "tel", autoComplete: "off" })}
          {field("address", "Adresse")}
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            {field("postalCode", "Code postal")}
            {field("city", "Ville")}
          </div>
          {field("website", "Site internet", { placeholder: "www.exemple.fr" })}
          <div>
            {field("tags", "Étiquettes", { placeholder: "salon bien-être, à rappeler" })}
            <FieldHint>Séparées par des virgules.</FieldHint>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {editing ? null : (
            <div>
              <Label htmlFor="crm-contact-stage">Étape</Label>
              <Select id="crm-contact-stage" value={values.stage} onChange={(event) => set("stage", event.target.value as CrmStage)}>
                {CRM_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_META[stage].label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="crm-contact-plan">Formule envisagée</Label>
            <Select
              id="crm-contact-plan"
              value={values.plan}
              onChange={(event) => {
                set("plan", event.target.value);
                if (!event.target.value) set("billingPeriod", "");
              }}
            >
              <option value="">Non renseignée</option>
              {OFFERED_PLANS.map((plan) => (
                <option key={plan} value={plan}>
                  {PLANS[plan].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="crm-contact-period">Durée</Label>
            <Select id="crm-contact-period" value={values.billingPeriod} disabled={periods.length === 0} onChange={(event) => set("billingPeriod", event.target.value)}>
              <option value="">Annuel (par défaut)</option>
              {periods.map((period: BillingPeriod) => (
                <option key={period} value={period}>
                  {BILLING_PERIOD_LABELS[period]}
                </option>
              ))}
            </Select>
            {value > 0 ? <FieldHint>{euros(value)} par mois dans le pipeline.</FieldHint> : null}
          </div>
        </div>

        <div>
          <Label htmlFor="crm-contact-notes">Notes</Label>
          <textarea
            id="crm-contact-notes"
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            placeholder="Contexte, besoin, échéance…"
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-ink-900">
          <input type="checkbox" checked={values.doNotContact} onChange={(event) => set("doNotContact", event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary-600" />
          <span>
            Ne pas contacter
            <span className="block text-xs text-ink-500">Le prospect a demandé à ne plus être sollicité : sa fiche reste, signalée partout.</span>
          </span>
        </label>

        {duplicate ? (
          <div role="alert" className="rounded-xl border border-warning-500/40 bg-warning-100 p-3 text-sm text-ink-900">
            <p>
              Un prospect semblable existe déjà :{" "}
              <Link href={`/crm/${duplicate.id}`} className="font-semibold underline underline-offset-4">
                {duplicate.name}
              </Link>
              .
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void submit(true)}>
                Créer quand même
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger-500">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter le prospect"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
