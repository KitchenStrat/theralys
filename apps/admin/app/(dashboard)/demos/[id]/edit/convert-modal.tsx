"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  MIN_COMMITMENT_MONTHS,
  OFFERED_PLANS,
  PLANS,
  periodTotal,
  planPeriods,
  planPrice,
  type BillingPeriod,
  type OfferedPlanId,
} from "@theralys/db/plans";
import { Badge, Button, FieldHint, Input, Label, Modal, Select } from "@theralys/ui";
import { convertDemoToClient, type ConversionResult } from "../../convert-actions";

const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;

/** « Annuel — 86 € TTC/mois, soit 1 032 € tous les ans » */
function periodLabel(plan: OfferedPlanId, period: BillingPeriod): string {
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
  const [plan, setPlan] = useState<OfferedPlanId>("scale");
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const periods = planPeriods(plan);

  // Une durée que la formule choisie ne propose pas retombe sur l'annuel
  function choosePlan(next: OfferedPlanId) {
    setPlan(next);
    if (!planPeriods(next).includes(period)) setPeriod("annual");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const outcome = await convertDemoToClient({
      siteId,
      plan: form.get("plan"),
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
            Crée le compte client, démarre l&apos;abonnement Stripe et publie le site.
            L&apos;expiration du lien de démo est levée.
          </p>
          <div>
            <Label htmlFor="plan">Formule</Label>
            <Select id="plan" name="plan" value={plan} onChange={(event) => choosePlan(event.target.value as OfferedPlanId)}>
              {OFFERED_PLANS.map((id) => (
                <option key={id} value={id}>
                  {PLANS[id].label} — à partir de {euros(Math.min(...planPeriods(id).map((p) => planPrice(id, p) ?? Infinity)))} TTC/mois
                </option>
              ))}
            </Select>
            <FieldHint>
              Starter : 6 spécialités sur l&apos;accueil, sans pages dédiées, blog ni outils SEO.
              Scale : 6 pages de spécialités, blog (208 articles/an), suivi et recherche de
              mots-clés, Académie, contenus réseaux sociaux prêts à poster.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="period">Facturation</Label>
            <Select id="period" name="period" value={period} onChange={(event) => setPeriod(event.target.value as BillingPeriod)}>
              {periods.map((id) => (
                <option key={id} value={id}>
                  {periodLabel(plan, id)}
                </option>
              ))}
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "Activation…" : "Activer le site client"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
