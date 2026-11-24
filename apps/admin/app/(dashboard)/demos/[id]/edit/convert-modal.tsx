"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  FORMULAS,
  FORMULA_DEFINITIONS,
  MIN_COMMITMENT_MONTHS,
  PLANS,
  periodTotal,
  planFromFormulas,
  planPeriods,
  planPrice,
  type BillingPeriod,
  type FormulaId,
  type PlanId,
} from "@theralys/db/plans";
import { Badge, Button, FieldHint, Input, Label, Modal, Select } from "@theralys/ui";
import { convertDemoToClient, type ConversionResult } from "../../convert-actions";

const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;

/** Ce qu'ouvre chaque formule, en une ligne */
const FORMULA_HINTS: Record<FormulaId, string> = {
  site: "Le site hébergé, 6 pages de spécialités et le blog (208 articles par an).",
  scale: "Fiche Google, réseaux sociaux, Google Ads et Meta Ads. Sans le site.",
};

/** « Annuel — 98 € TTC/mois, soit 1 176 € tous les ans » */
function periodLabel(plan: PlanId, period: BillingPeriod): string {
  const price = planPrice(plan, period) ?? 0;
  const label = `${BILLING_PERIOD_LABELS[period]} — ${euros(price)} TTC/mois`;
  return period === "monthly" ? label : `${label}, soit ${euros(periodTotal(plan, period) ?? 0)} ${BILLING_PERIOD_CADENCE[period]}`;
}

export function ConvertModal({
  siteId,
  defaultEmail,
  open,
  onClose,
}: {
  siteId: string;
  defaultEmail?: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // Une démo présente l'offre complète : les deux formules sont cochées au départ
  const [formulas, setFormulas] = useState<FormulaId[]>([...FORMULAS]);
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const plan = planFromFormulas(formulas);
  const periods = plan ? planPeriods(plan) : [];

  function toggleFormula(formula: FormulaId) {
    setFormulas((current) => (current.includes(formula) ? current.filter((entry) => entry !== formula) : FORMULAS.filter((entry) => entry === formula || current.includes(entry))));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const outcome = await convertDemoToClient({
      siteId,
      formulas,
      period: form.get("period"),
      clientEmail: form.get("clientEmail"),
    });
    setSubmitting(false);
    setResult(outcome);
  }

  const success = result && !("error" in result) ? result : null;

  function close() {
    if (success) {
      // La démo est devenue un site client : direction l'onglet Clients
      router.push("/clients");
    } else {
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={close} title="Convertir en site client" wide>
      {success ? (
        <div>
          <Badge tone="success">Site client activé</Badge>
          {success.emailSent ? (
            <p className="mt-3 text-sm text-ink-700">
              ✉️ Un e-mail d&apos;invitation a été envoyé à <strong>{success.email}</strong> : le
              client choisit son mot de passe via le lien (valable 7 jours).
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink-700">
              Envoyez ce lien d&apos;invitation à <strong>{success.email}</strong> : il lui permet
              de choisir son mot de passe et d&apos;entrer dans son espace (valable 7 jours).
            </p>
          )}
          <div className="mt-4 rounded-2xl bg-cream-100 p-4">
            <p className="break-all font-mono text-xs text-ink-700">{success.setupUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(success.setupUrl).then(() => {
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  });
                }}
              >
                {linkCopied ? "Copié !" : "Copier le lien"}
              </Button>
              {!success.emailSent ? (
                <a
                  href={`mailto:${success.email}?subject=${encodeURIComponent("Votre espace praticien Harmony")}&body=${encodeURIComponent(`Bonjour,\n\nVotre site est activé ! Choisissez votre mot de passe pour accéder à votre espace praticien (lien valable 7 jours) :\n\n${success.setupUrl}\n\nVotre identifiant : ${success.email}\n\nÀ très vite,\nHarmony`)}`}
                  className="inline-flex items-center rounded-full border border-ink-300 px-4 py-1.5 text-sm font-medium text-ink-700 hover:bg-cream-200"
                >
                  ✉️ Ouvrir un e-mail pré-rempli
                </a>
              ) : null}
            </div>
          </div>
          {success.billingMode === "stripe" && success.checkoutUrl ? (
            <p className="mt-3 text-sm">
              Lien de paiement Stripe à envoyer au client :{" "}
              <a href={success.checkoutUrl} className="break-all text-primary-600 underline">
                {success.checkoutUrl}
              </a>
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-500">
              Facturation en mode mock (aucune clé Stripe) : abonnement actif immédiatement.
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <Button onClick={close}>Fermer</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-ink-500">
            Crée le compte client et démarre l&apos;abonnement Stripe. Avec la formule Site, le site est publié et l&apos;expiration du lien de
            démo est levée.
          </p>
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-ink-900">Formules</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMULAS.map((formula) => {
                const checked = formulas.includes(formula);
                return (
                  <label key={formula} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary-400 bg-primary-50" : "border-cream-300 bg-white hover:border-primary-300"}`}>
                    <input type="checkbox" name="formulas" value={formula} checked={checked} onChange={() => toggleFormula(formula)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900">
                        {FORMULA_DEFINITIONS[formula].label} <span className="font-normal text-ink-700">· {euros(FORMULA_DEFINITIONS[formula].prices.monthly)}/mois</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">{FORMULA_HINTS[formula]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <FieldHint>{plan ? `Le client aura : ${PLANS[plan].label}. Les deux formules s'additionnent.` : "Cochez au moins une formule."}</FieldHint>
          </fieldset>
          <div>
            <Label htmlFor="period">Facturation</Label>
            <Select id="period" name="period" value={period} onChange={(event) => setPeriod(event.target.value as BillingPeriod)}>
              {plan
                ? periods.map((id) => (
                    <option key={id} value={id}>
                      {periodLabel(plan, id)}
                    </option>
                  ))
                : null}
            </Select>
            <FieldHint>
              La somme est réglée d&apos;avance à chaque échéance. Engagement de {MIN_COMMITMENT_MONTHS} mois minimum, frais de création et
              formation offerts.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="clientEmail">Email du client *</Label>
            <Input
              id="clientEmail"
              name="clientEmail"
              type="email"
              defaultValue={defaultEmail}
              placeholder="prenom@exemple.fr"
              required
            />
            <FieldHint>Servira d&apos;identifiant de connexion au studio.</FieldHint>
          </div>
          {result && "error" in result ? (
            <p className="text-sm text-danger-500">{result.error}</p>
          ) : null}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !plan}>
              {submitting ? "Activation…" : "Activer le site client"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
