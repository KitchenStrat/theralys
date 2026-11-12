"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight, ClipboardCheck, MapPinned, Megaphone, Search, ShieldCheck, Star, Store, type LucideIcon } from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { Card, IconBadge, InlineSuccess, NextStepCard, Spinner } from "@/components/ds";
import { searchGoogle } from "../actions";
import { linkGoogleProfile } from "./actions";
import { ErrorNote, LINK_QUERY_ID, WaitNote } from "./shared";

type Place = { placeId: string; name: string; address: string; rating: number; reviewCount: number };

/** Ce que la section apporte une fois la fiche reliée — une ligne par onglet. */
const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ClipboardCheck, title: "Un audit de votre fiche", text: "Une note sur 100 et la liste de ce qu'il faut améliorer, dans l'ordre." },
  { icon: MapPinned, title: "Votre visibilité sur la carte", text: "Où votre fiche apparaît sur Google Maps autour de votre cabinet, recherche par recherche." },
  { icon: Star, title: "Vos avis, avec une réponse proposée", text: "Tous vos avis au même endroit, et pour chacun une réponse prête à copier." },
  { icon: Megaphone, title: "Un post par semaine", text: "Préparé à partir de votre site : il ne vous reste qu'à le publier sur votre fiche." },
];

/** Le déroulé de la liaison, annoncé avant de commencer. */
const STEPS = ["Tapez le nom de votre cabinet et sa ville", "Choisissez votre fiche dans la liste", "Harmony lit votre fiche et prépare son audit"];

/**
 * Écran d'accueil de la section tant que la fiche n'est pas reliée : à quoi
 * sert la section, et la seule chose à faire — retrouver sa fiche (nom +
 * ville) et la choisir dans les résultats. La liaison lance la première
 * synchronisation (audit, avis).
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
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <NextStepCard
        className="min-w-0"
        eyebrow="Votre première étape"
        title="Reliez votre fiche Google"
        duration="2 min"
        action={
          <div className="w-full min-w-0">
            <div className="max-w-xl">
              <Label htmlFor={LINK_QUERY_ID}>Nom de votre cabinet et ville</Label>
              <div className="relative">
                <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ds-ink-500" />
                <Input
                  id={LINK_QUERY_ID}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Ex. : Claire Dupont sophrologue Albi"
                  autoComplete="off"
                  disabled={pending}
                  aria-describedby="google-link-hint"
                  className="min-h-12 pl-10 text-base!"
                />
              </div>
              <FieldHint>
                <span id="google-link-hint">Tapez au moins 3 caractères — les résultats viennent de Google.</span>
              </FieldHint>
            </div>

            {searching ? (
              <p className="mt-3 flex items-center gap-2 text-ds-body text-ds-ink-600" aria-live="polite">
                <Spinner className="size-4 text-ds-section-accent" /> Recherche…
              </p>
            ) : null}

            {results.length > 0 ? (
              <>
                <p className="mt-4 text-ds-body font-medium text-ds-ink-800">Choisissez votre fiche dans la liste :</p>
                <ul
                  className="mt-2 max-w-xl divide-y divide-ds-ink-200 overflow-hidden rounded-ds-md bg-white ring-1 ring-ds-ink-300"
                  aria-label="Fiches trouvées"
                >
                  {results.map((place) => (
                    <li key={place.placeId}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => choose(place)}
                        className="group/place flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left ds-focus-inset hover:bg-ds-section-tint disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <IconBadge icon={Store} tone="soft" size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-ds-ink-900">{place.name}</span>
                          <span className="block truncate text-ds-meta text-ds-ink-600">{place.address}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-ds-meta text-ds-ink-700">
                          {pending && chosen === place.placeId ? (
                            <Spinner className="size-5 text-ds-section-accent" />
                          ) : (
                            <>
                              <Star size={14} aria-hidden className="fill-ds-warning-500 text-ds-warning-700" />
                              <span>
                                {place.rating.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ·{" "}
                                {place.reviewCount} avis
                              </span>
                              <ChevronRight size={18} aria-hidden className="text-ds-ink-400 max-sm:hidden" />
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {results.length === 0 && !pending && !message ? (
              <ol className="mt-5 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-3" aria-label="Comment relier votre fiche">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex items-start gap-2.5 text-ds-body text-ds-ink-700">
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-ds-section-tint-2 text-ds-meta font-bold text-ds-section-ink ds-tnum"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            {pending ? <WaitNote className="mt-4">Liaison et première synchronisation en cours… Ne fermez pas la page.</WaitNote> : null}
            {message ? <InlineSuccess className="mt-4">{message}</InlineSuccess> : null}
            {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
          </div>
        }
      >
        <p className="text-base text-ds-ink-700">
          Retrouvez la fiche d&apos;établissement de <strong className="font-semibold text-ds-ink-900">{siteName}</strong> sur
          Google : Harmony l&apos;auditera, suivra votre visibilité sur Google Maps et préparera vos réponses aux avis.
        </p>
        <p className="mt-2 flex items-start gap-2 text-ds-body font-medium text-ds-section-ink">
          <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
          Rien n&apos;est publié sans vous.
        </p>
      </NextStepCard>

      <Card variant="tinted" className="min-w-0">
        <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">
          Ce que vous y gagnez
        </h2>
        <ul className="mt-4 space-y-4">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="flex items-start gap-3.5">
              <IconBadge icon={benefit.icon} size="md" />
              <div className="min-w-0">
                <p className="text-base font-semibold text-ds-ink-900">{benefit.title}</p>
                <p className="text-ds-body text-ds-ink-700">{benefit.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
