"use client";

import { Compass } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ds/button";
import type { TourId } from "@/lib/visite/engine";
import { useTour } from "./provider";

/** Délai avant de proposer une visite : la page a fini d'entrer à l'écran (cascade de 480 ms au plus). */
const OFFER_DELAY = 900;

/**
 * Propose la visite d'une page à sa première ouverture. Sans effet si la visite
 * a déjà été vue, en mode support, sous une fenêtre ouverte ou pendant une
 * autre visite (voir `shouldAutoStart`).
 */
export function TourAutoStart({ tour }: { tour: TourId }) {
  const offer = useTour()?.offer;
  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => offer(tour), OFFER_DELAY);
    return () => window.clearTimeout(timer);
  }, [offer, tour]);
  return null;
}

/**
 * Le bouton « Visite guidée » d'un en-tête de page : il relance la visite de
 * la page, et la propose de lui-même à la première ouverture. Rien n'est
 * affiché hors du studio connecté (pages d'aperçu).
 *
 * `compact` (barre de l'éditeur, où la place manque) : le bouton se réduit à son icône sous 1 024 px et
 * disparaît sous 640 px — la visite s'y propose toujours d'elle-même, elle n'y est simplement pas relançable.
 */
export function TourLauncher({ tour, compact = false }: { tour: TourId; compact?: boolean }) {
  const context = useTour();
  if (!context) return null;
  return (
    <>
      <TourAutoStart tour={tour} />
      <Button
        type="button"
        variant="quiet"
        size="sm"
        icon={<Compass size={16} aria-hidden />}
        onClick={() => context.launch(tour)}
        className={compact ? "max-lg:px-3! max-sm:hidden" : undefined}
        data-testid="tour-launch"
      >
        {compact ? <span className="max-lg:sr-only">Visite guidée</span> : "Visite guidée"}
      </Button>
    </>
  );
}
