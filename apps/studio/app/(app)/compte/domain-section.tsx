"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import { purchaseDomain, requestExternalDomain, searchDomain } from "./actions";

type Availability = { domain: string; available: boolean; pricePerYear: number | null };

export function DomainSection({
  currentDomain,
  domainStatus,
  externalRequest,
  fallbackUrl,
}: {
  currentDomain: string | null;
  domainStatus: "pending" | "registered" | "configured" | "error" | null;
  /** Domaine que le client possède déjà, en attente de rattachement par l'équipe. */
  externalRequest: string | null;
  fallbackUrl: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownDomain, setOwnDomain] = useState("");
  const [ownError, setOwnError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (currentDomain) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold">Mon domaine</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-lg font-bold">{currentDomain}</span>
          {domainStatus === "configured" ? (
            <Badge tone="success">Actif · DNS + SSL configurés</Badge>
          ) : domainStatus === "error" ? (
            <Badge tone="danger">Erreur de configuration</Badge>
          ) : (
            <Badge tone="info">Configuration en cours…</Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-500">
          Votre site est servi sur{" "}
          <a href={`https://${currentDomain}`} className="underline" target="_blank" rel="noopener noreferrer">
            https://{currentDomain}
          </a>
          . Le renouvellement est géré par Harmony.
        </p>
      </Card>
    );
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await searchDomain(query);
      if ("error" in outcome) setError(outcome.error);
      else setResult(outcome);
    });
  }

  function onBuy() {
    if (!result) return;
    setError(null);
    startTransition(async () => {
      const outcome = await purchaseDomain(result.domain);
      if (outcome.error) setError(outcome.error);
      else router.refresh();
    });
  }

  function onRequestAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOwnError(null);
    startTransition(async () => {
      const outcome = await requestExternalDomain(ownDomain);
      if (outcome.error) setOwnError(outcome.error);
      else router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Mon domaine</h2>
      <p className="mt-2 text-sm text-ink-500">
        Votre site est actuellement accessible sur{" "}
        <a href={fallbackUrl} className="underline" target="_blank" rel="noopener noreferrer">
          {fallbackUrl}
        </a>
        . Donnez-lui sa propre adresse : cherchez un domaine, nous nous occupons de tout
        (achat, DNS, certificat).
      </p>

      <form onSubmit={onSearch} className="mt-4">
        <Label htmlFor="domain">Nom de domaine souhaité</Label>
        <div className="flex gap-2">
          <Input
            id="domain"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="mon-cabinet.fr"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={busy || query.trim().length < 4}>
            {busy ? <Spinner /> : "Vérifier"}
          </Button>
        </div>
        <FieldHint>Extensions conseillées : .fr, .com, .eu</FieldHint>
      </form>

      {result ? (
        result.available ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success-500/40 bg-success-100/40 px-4 py-3">
            <p className="text-sm">
              <strong>{result.domain}</strong> est disponible ✓
            </p>
            <Button size="sm" disabled={busy} onClick={onBuy}>
              {busy ? <Spinner className="text-white" /> : null} Acheter ce domaine
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-warning-100 px-4 py-3 text-sm">
            <strong>{result.domain}</strong> n&apos;est pas disponible. Essayez une variante
            (ville, prénom…).
          </p>
        )
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger-500">{error}</p> : null}

      <div className="mt-6 border-t border-cream-200 pt-5">
        <h3 className="font-semibold">Rattacher mon nom de domaine</h3>
        {externalRequest ? (
          <div className="mt-3 rounded-2xl border border-primary-500/30 bg-primary-100/40 px-4 py-3 text-sm">
            <p>
              <strong>{externalRequest}</strong> — demande enregistrée ✓
            </p>
            <p className="mt-1 text-ink-700">
              Notre équipe s&apos;occupe du rattachement à votre site (transfert ou
              configuration DNS, puis certificat) et revient vers vous rapidement. Rien à
              faire de votre côté.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-500">
              Vous possédez déjà un nom de domaine (chez OVH, Ionos, Gandi…) ? Indiquez-le
              ci-dessous : notre équipe s&apos;occupe de le rattacher à votre site.
            </p>
            <form onSubmit={onRequestAttachment} className="mt-3">
              <Label htmlFor="own-domain">Votre domaine actuel</Label>
              <div className="flex gap-2">
                <Input
                  id="own-domain"
                  value={ownDomain}
                  onChange={(e) => setOwnDomain(e.target.value)}
                  placeholder="mon-cabinet.fr"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || ownDomain.trim().length < 4}
                >
                  {busy ? <Spinner /> : "Demander le rattachement"}
                </Button>
              </div>
            </form>
            {ownError ? <p className="mt-3 text-sm text-danger-500">{ownError}</p> : null}
          </>
        )}
      </div>
    </Card>
  );
}
