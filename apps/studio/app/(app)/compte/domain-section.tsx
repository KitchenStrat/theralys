"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import { purchaseDomain, searchDomain } from "./actions";

type Availability = { domain: string; available: boolean; pricePerYear: number | null };

export function DomainSection({
  currentDomain,
  domainStatus,
  fallbackUrl,
}: {
  currentDomain: string | null;
  domainStatus: "pending" | "registered" | "configured" | "error" | null;
  fallbackUrl: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
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
              <strong>{result.domain}</strong> est disponible —{" "}
              <strong>{result.pricePerYear?.toFixed(2)} €/an</strong>
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
    </Card>
  );
}
