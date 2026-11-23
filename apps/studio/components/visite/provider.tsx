"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dismissTours, markTourSeen } from "@/app/(app)/visite/actions";
import {
  TOUR_IDS,
  isTourId,
  playableSteps,
  shouldAutoStart,
  snoozeOutcome,
  stepAfter,
  stepBefore,
  worthPlaying,
  type ResolvedStep,
  type TourId,
} from "@/lib/visite/engine";
import { TOURS } from "@/lib/visite/tours";
import { findTarget, isFramed, isSnoozed, modalIsOpen, readLocalSeen, readSnoozes, writeLocalSeen, writeSnooze } from "./dom";
import { TourOverlay } from "./overlay";

export type TourContextValue = {
  /** Lance une visite à la demande ; si elle se joue sur une autre page, y conduit d'abord. */
  launch: (tour: TourId) => void;
  /** Propose une visite d'elle-même, si elle n'a jamais été vue (première ouverture de sa page). */
  offer: (tour: TourId) => void;
  /** Visite en cours */
  active: TourId | null;
};

const TourContext = createContext<TourContextValue | null>(null);

/** Les commandes de la visite guidée ; `null` hors du studio connecté (pages d'aperçu du design system). */
export function useTour(): TourContextValue | null {
  return useContext(TourContext);
}

type Run = {
  tour: TourId;
  steps: ResolvedStep[];
  index: number;
  /** La fenêtre de bienvenue est affichée (visite proposée d'elle-même) */
  intro: boolean;
};

/** Délai avant une visite demandée par l'adresse (`?visite=`) : la page a fini d'entrer à l'écran. */
const URL_START_DELAY = 700;

export type TourProviderProps = {
  /** Identifiant du site : sépare les replis locaux de deux comptes ouverts dans le même navigateur */
  siteKey: string;
  /** Visites déjà vues d'après la base ; `null` : état illisible, aucune visite ne se propose d'elle-même */
  seen: readonly TourId[] | null;
  /** Session ouverte par l'équipe : rien ne se propose de soi-même, rien n'est noté comme vu */
  support: boolean;
  /** Prénom du praticien, pour la fenêtre de bienvenue */
  firstName?: string;
  children: ReactNode;
};

/**
 * Chef d'orchestre des visites guidées : il sait lesquelles ont été vues
 * (base, puis repli du navigateur), en joue une à la fois, et note la fin de
 * chacune. Monté une fois par mise en page (studio, éditeur).
 */
export function TourProvider({ siteKey, seen, support, firstName, children }: TourProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  // Visites vues pendant la vie de la page : la mise en page (donc `seen`) n'est pas relue à chaque navigation
  const memory = useRef<Set<TourId>>(new Set());
  const memorySnoozed = useRef<Set<TourId>>(new Set());

  const begin = useCallback((tour: TourId, auto: boolean): boolean => {
    const definition = TOURS[tour];
    const steps = playableSteps(definition.steps, (selector) => findTarget(selector) !== null);
    if (!worthPlaying(steps)) return false;
    setRun({ tour, steps, index: 0, intro: auto && definition.intro !== undefined });
    return true;
  }, []);

  const localSeen = useCallback((): TourId[] => [...new Set([...readLocalSeen(siteKey), ...memory.current])], [siteKey]);

  const mark = useCallback(
    (tour: TourId) => {
      if (support) return;
      const known = memory.current.has(tour) || (seen?.includes(tour) ?? false);
      memory.current.add(tour);
      writeLocalSeen(siteKey, localSeen());
      // Enregistrement en base ; en cas d'échec, le repli local vient d'être écrit
      if (!known) void markTourSeen(tour).catch(() => false);
    },
    [localSeen, seen, siteKey, support],
  );

  const offer = useCallback(
    (tour: TourId) => {
      const ok = shouldAutoStart({
        tour,
        seenServer: seen,
        seenLocal: localSeen(),
        support,
        modalOpen: modalIsOpen(),
        activeTour: runRef.current?.tour ?? null,
        framed: isFramed(),
        snoozed: memorySnoozed.current.has(tour) || isSnoozed(siteKey, tour),
      });
      if (ok) begin(tour, true);
    },
    [begin, localSeen, seen, siteKey, support],
  );

  const launch = useCallback(
    (tour: TourId) => {
      if (runRef.current) return;
      const definition = TOURS[tour];
      if (pathname === definition.href) {
        // Un court délai : la feuille ou le menu d'où part la demande a le temps de se refermer
        window.setTimeout(() => {
          if (!runRef.current && !modalIsOpen()) begin(tour, false);
        }, 80);
      } else {
        router.push(`${definition.href}?visite=${tour}`);
      }
    },
    [begin, pathname, router],
  );

  const close = useCallback(
    (reason: "done" | "skipped" | "later") => {
      const current = runRef.current;
      if (!current) return;
      setRun(null);
      if (support) return;
      if (reason === "later") {
        const outcome = snoozeOutcome(readSnoozes(siteKey, current.tour));
        memorySnoozed.current.add(current.tour);
        writeSnooze(siteKey, current.tour, outcome.snoozes);
        if (outcome.dismissAll) {
          // Deuxième refus : plus aucune visite ne se propose d'elle-même, ici comme dans chaque espace
          for (const tour of TOUR_IDS) memory.current.add(tour);
          writeLocalSeen(siteKey, localSeen());
          void dismissTours().catch(() => false);
        }
        return;
      }
      mark(current.tour);
    },
    [localSeen, mark, siteKey, support],
  );

  const next = useCallback(() => {
    const current = runRef.current;
    if (!current) return;
    if (current.intro) {
      setRun({ ...current, intro: false });
      return;
    }
    const index = stepAfter(current.index, current.steps.length);
    if (index === null) close("done");
    else setRun({ ...current, index });
  }, [close]);

  const previous = useCallback(() => {
    const current = runRef.current;
    if (!current || current.intro) return;
    const index = stepBefore(current.index);
    if (index !== null) setRun({ ...current, index });
  }, []);

  // Une visite ne survit pas à un changement de page (lien du navigateur, retour arrière)
  useEffect(() => {
    const current = runRef.current;
    if (current && TOURS[current.tour].href !== pathname) setRun(null);
  }, [pathname]);

  const value = useMemo<TourContextValue>(() => ({ launch, offer, active: run?.tour ?? null }), [launch, offer, run?.tour]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {/* `useSearchParams` demande une limite de suspension */}
      <Suspense fallback={null}>
        <UrlStart begin={begin} />
      </Suspense>
      {run ? (
        <TourOverlay
          definition={TOURS[run.tour]}
          steps={run.steps}
          index={run.index}
          intro={run.intro}
          firstName={firstName}
          onNext={next}
          onPrevious={previous}
          onClose={() => close(run.intro ? "later" : run.index === run.steps.length - 1 ? "done" : "skipped")}
        />
      ) : null}
    </TourContext.Provider>
  );
}

/**
 * Lancement par l'adresse : `/?visite=accueil` joue la visite d'accueil. C'est
 * ainsi qu'une visite demandée depuis une autre page (menu) démarre à
 * l'arrivée ; le paramètre est retiré de l'adresse aussitôt lu.
 */
function UrlStart({ begin }: { begin: (tour: TourId, auto: boolean) => boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("visite");

  useEffect(() => {
    if (!isTourId(requested) || TOURS[requested].href !== pathname) return;
    const tour = requested;
    // Pas d'annulation au nettoyage : retirer le paramètre relance cet effet, la visite doit tout de même partir
    window.setTimeout(() => {
      if (!modalIsOpen()) begin(tour, false);
    }, URL_START_DELAY);
    const rest = new URLSearchParams(params.toString());
    rest.delete("visite");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [begin, params, pathname, requested, router]);

  return null;
}
