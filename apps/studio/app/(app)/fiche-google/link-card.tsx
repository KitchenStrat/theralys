"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import { searchGoogle } from "../actions";
import { linkGoogleProfile } from "./actions";

type Place = { placeId: string; name: string; address: string; rating: number; reviewCount: number };

/**
 * « Reliez votre fiche Google » : recherche de la fiche (nom + ville), choix
 * dans les résultats, liaison puis première synchronisation (audit, avis).
 */
export function LinkCard({ siteName, onLinked }: { siteName: string; onLinked?: (message: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const lastRequest = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setQuery(value);
    setError(null);
    clearTimeout(timer.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      // Une réponse lente d'une saisie précédente ne doit pas écraser les résultats courants
      const requestId = ++lastRequest.current;
      setSearching(true);
      searchGoogle(value)
        .then((found) => {
          if (requestId === lastRequest.current) setResults(found);
        })
        .finally(() => {
          if (requestId === lastRequest.current) setSearching(false);
        });
    }, 350);
  }

  function choose(place: Place) {
    setError(null);
    setMessage(null);
    setChosen(place.placeId);
    startTransition(async () => {
      const result = await linkGoogleProfile(place);
      if (result.error) {
        setError(result.error);
        setChosen(null);
        return;
      }
      const notice = result.message ?? "Fiche reliée.";
      setMessage(notice);
      onLinked?.(notice);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <GoogleGlyph />
        <h2 className="text-xl font-semibold">Reliez votre fiche Google</h2>
      </div>
      <p className="mt-2 text-sm text-ink-700">
        Retrouvez la fiche d&apos;établissement de <strong>{siteName}</strong> sur Google : Harmony
        l&apos;auditera, suivra votre visibilité sur Google Maps et préparera vos réponses aux
        avis. Rien n&apos;est publié sans vous.
      </p>

      <div className="mt-4 max-w-xl">
        <Label htmlFor="google-link-query">Nom de votre cabinet et ville</Label>
        <Input
          id="google-link-query"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Ex. : Claire Dupont sophrologue Albi"
          autoComplete="off"
          disabled={pending}
          aria-describedby="google-link-hint"
        />
        <FieldHint>
          <span id="google-link-hint">Tapez au moins 3 caractères — les résultats viennent de Google.</span>
        </FieldHint>
      </div>

      {searching ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-500" aria-live="polite">
          <Spinner /> Recherche…
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 max-w-xl divide-y divide-cream-200 rounded-2xl border border-cream-200" aria-label="Fiches trouvées">
          {results.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(place)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cream-50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink-900">{place.name}</span>
                  <span className="block truncate text-xs text-ink-500">{place.address}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-700">
                  {pending && chosen === place.placeId ? (
                    <Spinner />
                  ) : (
                    <>
                      ★ {place.rating.toFixed(1)} · {place.reviewCount} avis
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pending ? (
        <p className="mt-3 text-sm text-ink-700" aria-live="polite">
          Liaison et première synchronisation en cours… Ne fermez pas la page.
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-success-500" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger-500" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

export function GoogleGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-200 text-base font-bold text-info-500"
    >
      G
    </span>
  );
}
