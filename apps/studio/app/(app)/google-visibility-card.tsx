"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Spinner } from "@theralys/ui";
import type { GoogleVisibility } from "@/lib/data";
import { connectGoogle } from "./actions";

export function GoogleVisibilityCard({
  gscAccess,
  connected,
  visibility,
}: {
  gscAccess: boolean;
  connected: boolean;
  visibility: GoogleVisibility | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!gscAccess) {
    return (
      <Card id="visibilite" className="p-6">
        <CardTitle />
        <p className="mt-3 text-sm text-ink-500">
          Le suivi de vos mots-clés Google est disponible avec les formules{" "}
          <strong>Boost</strong> et <strong>Scale</strong>.
        </p>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card id="visibilite" className="p-6">
        <CardTitle />
        <p className="mt-3 text-sm text-ink-700">
          Connectez votre compte Google pour suivre les recherches qui mènent à votre cabinet
          (Search Console + fiche d&apos;établissement).
        </p>
        <div className="mt-4">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await connectGoogle();
                if (result?.error) setError(result.error);
              })
            }
          >
            {pending ? <Spinner className="text-white" /> : null} Connecter votre compte Google
          </Button>
          {error ? <p className="mt-2 text-sm text-danger-500">{error}</p> : null}
        </div>
      </Card>
    );
  }

  if (!visibility) {
    return (
      <Card id="visibilite" className="p-6">
        <CardTitle />
        <p className="mt-3 text-sm text-ink-500">
          Compte connecté — les premières données arrivent d&apos;ici 2 à 3 jours.
        </p>
      </Card>
    );
  }

  return (
    <Card id="visibilite" className="p-6">
      <CardTitle />
      <p className="mt-4 text-lg">
        Ce mois-ci, <strong>{visibility.monthImpressions} personnes</strong> ont vu votre cabinet
        sur Google
        {visibility.changePct !== null ? (
          <>
            {" — "}
            <span className={visibility.changePct >= 0 ? "font-semibold text-success-500" : "font-semibold text-danger-500"}>
              {visibility.changePct >= 0 ? "+" : ""}
              {visibility.changePct} % de {visibility.changePct >= 0 ? "plus" : "moins"}
            </span>{" "}
            que le mois dernier.
          </>
        ) : (
          "."
        )}
      </p>

      <p className="mt-6 text-center text-[11px] uppercase tracking-widest text-ink-500">
        Ils cherchaient…
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {visibility.topQueries.map((q, i) => (
          <Badge key={q.query} tone={i === 0 ? "primary" : "neutral"} className="px-3 py-1.5 text-sm">
            🔍 {q.query} <strong className="ml-1">{q.impressions}</strong>
          </Badge>
        ))}
        {visibility.otherQueriesCount > 0 ? (
          <Badge tone="neutral" className="px-3 py-1.5 text-sm">
            + {visibility.otherQueriesCount} non détaillées
          </Badge>
        ) : null}
      </div>

      <p className="mt-8 border-t border-cream-200 pt-3 text-xs text-ink-500">
        ⓘ Données décalées de 2 à 3 jours · Google Search Console
      </p>
    </Card>
  );
}

function CardTitle() {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded-full bg-cream-200 text-sm font-bold text-info-500"
      >
        G
      </span>
      Visibilité Google
    </h2>
  );
}
