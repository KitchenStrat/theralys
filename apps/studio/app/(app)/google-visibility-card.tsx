"use client";

import { useState, useTransition } from "react";
import { Eye, Info, Minus, Plug, Search, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatedNumber, Badge, Button, Card, CardHeader, StatusPill, formatDelta } from "@/components/ds";
import type { GoogleVisibility } from "@/lib/data";
import { connectGoogle } from "./actions";
import { ErrorNote } from "./fiche-google/shared";

const TITLE = "Visibilité Google";

/**
 * Carte « Visibilité Google » (Search Console) : combien de personnes ont vu
 * le cabinet dans les résultats de Google ce mois-ci, et ce qu'elles
 * cherchaient. Quatre états : formule sans suivi, compte à connecter, données
 * en attente, données.
 */
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
      <Card id="visibilite">
        <CardHeader
          icon={Eye}
          title={TITLE}
          description={
            <>
              Le suivi de vos mots-clés Google est disponible avec la formule{" "}
              <strong className="font-semibold text-ds-ink-900">Scale</strong>.
            </>
          }
        />
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card id="visibilite" variant="tinted">
        <CardHeader
          icon={Eye}
          title={TITLE}
          description="Connectez votre compte Google pour suivre les recherches qui mènent à votre cabinet (Search Console + fiche d'établissement)."
        />
        <div className="mt-4">
          <Button
            variant="secondary"
            loading={pending}
            icon={<Plug size={18} aria-hidden />}
            onClick={() =>
              startTransition(async () => {
                const result = await connectGoogle();
                if (result?.error) setError(result.error);
              })
            }
          >
            Connecter votre compte Google
          </Button>
          {error ? <ErrorNote className="mt-3">{error}</ErrorNote> : null}
        </div>
      </Card>
    );
  }

  if (!visibility) {
    return (
      <Card id="visibilite">
        <CardHeader
          icon={Eye}
          title={TITLE}
          description="Compte connecté — les premières données arrivent d'ici 2 à 3 jours."
          action={<StatusPill status="en-cours">En attente des données</StatusPill>}
        />
      </Card>
    );
  }

  const change = visibility.changePct;
  return (
    <Card id="visibilite">
      <CardHeader icon={Eye} title={TITLE} description="Combien de personnes ont vu votre cabinet dans les résultats de Google." />
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
        <div className="min-w-0">
          <p className="text-base text-ds-ink-700">
            Ce mois-ci,{" "}
            <strong className="block font-ds-display text-ds-kpi font-bold text-ds-section-ink">
              <AnimatedNumber value={visibility.monthImpressions} /> personnes
            </strong>{" "}
            ont vu votre cabinet sur Google
            {change === null ? "." : null}
          </p>
          {change !== null ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-body text-ds-ink-700">
              <Badge
                tone={change > 0 ? "success" : change < 0 ? "danger" : "neutral"}
                icon={change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus}
              >
                {formatDelta(change)}
              </Badge>
              <span>{change > 0 ? "de plus que le mois dernier." : change < 0 ? "de moins que le mois dernier." : "autant que le mois dernier."}</span>
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <h3 className="text-ds-body font-semibold text-ds-ink-900">Ils cherchaient…</h3>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {visibility.topQueries.map((q, i) => (
              <li key={q.query} className="max-w-full min-w-0">
                {/* Requête longue : le texte se coupe, la loupe garde sa taille */}
                <Badge tone={i === 0 ? "section" : "neutral"} icon={Search} className="max-w-full px-3 py-1.5 [&>svg]:shrink-0">
                  <span className="min-w-0 truncate">{q.query}</span>
                  <strong className="font-bold ds-tnum">{q.impressions}</strong>
                </Badge>
              </li>
            ))}
            {visibility.otherQueriesCount > 0 ? (
              <li>
                <Badge tone="neutral" className="px-3 py-1.5">
                  + {visibility.otherQueriesCount} non détaillées
                </Badge>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <p className="mt-5 flex items-start gap-2 border-t border-ds-ink-200 pt-3 text-ds-meta text-ds-ink-600">
        <Info size={15} aria-hidden className="mt-0.5 shrink-0" />
        Données décalées de 2 à 3 jours · Google Search Console
      </p>
    </Card>
  );
}
