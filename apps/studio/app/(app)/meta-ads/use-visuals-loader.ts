"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import type { MetaGalleryAd } from "@theralys/shared";
import type { MetaVisualsView } from "@/lib/meta-ads/data";
import { META_VISUALS_MAX_ROUNDS, VISUALS_LOAD_FAILED, visualStateOf, visualsLoadedMessage, type VisualState } from "@/lib/meta-ads/market-view";
import type { VisualsBatch } from "@/lib/meta-ads/visuals";

/** Ce que les cartes ont besoin de savoir des visuels : lesquels restent à chercher, et si le chargement tourne. */
type VisualsContextValue = { pendingIds: ReadonlySet<string>; loading: boolean };

const NO_PENDING: ReadonlySet<string> = new Set();

export const MarketVisualsContext = createContext<VisualsContextValue>({ pendingIds: NO_PENDING, loading: false });

/** État du visuel d'une annonce (affichable, en chargement, pas encore cherché, indisponible). */
export function useVisualState(ad: Pick<MetaGalleryAd, "id" | "media">): VisualState {
  const { pendingIds, loading } = useContext(MarketVisualsContext);
  return visualStateOf(ad, pendingIds, loading);
}

export type VisualsLoader = {
  loading: boolean;
  error: string | null;
  message: string | null;
  /** Lance (ou relance) le chargement des visuels manquants */
  start: () => void;
};

/**
 * Chargement des visuels manquants de la veille, par lots enchaînés (la
 * galerie se rafraîchit entre deux lots) : lancé de lui-même à l'ouverture
 * de l'onglet — une fois par veille et par session de navigation, pour qu'un
 * fournisseur en panne ne soit pas sollicité à chaque visite —, relançable à
 * la main. Une annonce déjà tentée pendant ce chargement n'est pas reprise.
 */
export function useVisualsLoader({ visuals, available, watchKey }: { visuals: MetaVisualsView; /** Bibliothèque activée (les visuels en dépendent) */ available: boolean; /** Identifie la veille affichée */ watchKey: string }): VisualsLoader {
  const router = useRouter();
  const [state, setState] = useState<{ loading: boolean; error: string | null; message: string | null }>({ loading: false, error: null, message: null });
  // Rafraîchissement de la galerie en cours : le bilan n'est annoncé qu'une fois les visuels à l'écran
  const [refreshing, startRefresh] = useTransition();
  const running = useRef(false);
  const autoStarted = useRef<string | null>(null);
  const canLoad = available && visuals.provider && visuals.missing > 0 && visuals.remaining > 0;

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setState({ loading: true, error: null, message: null });
    void (async () => {
      const attempted: string[] = [];
      let found = 0;
      let error: string | null = null;
      try {
        for (let round = 0; round < META_VISUALS_MAX_ROUNDS; round++) {
          const response = await fetch("/api/meta-ads/visuals", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ exclude: attempted }),
            cache: "no-store",
          });
          const batch = (await response.json().catch(() => null)) as Partial<VisualsBatch> | null;
          if (!response.ok || !batch) {
            error = batch?.error ?? VISUALS_LOAD_FAILED;
            break;
          }
          const tried = batch.attempted ?? [];
          attempted.push(...tried);
          found += batch.found ?? 0;
          // La galerie se met à jour au fil des lots
          if (tried.length > 0) startRefresh(() => router.refresh());
          if (batch.error) {
            error = batch.error;
            break;
          }
          if (batch.stop !== false || tried.length === 0) break;
        }
      } catch {
        error = VISUALS_LOAD_FAILED;
      }
      running.current = false;
      setState({ loading: false, error, message: error ? null : visualsLoadedMessage(found) });
    })();
  }, [router]);

  useEffect(() => {
    if (!canLoad || autoStarted.current === watchKey) return;
    autoStarted.current = watchKey;
    const key = `meta-visuals:${watchKey}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Stockage indisponible (navigation privée stricte) : le chargement part quand même, une fois par affichage
    }
    start();
  }, [canLoad, watchKey, start]);

  return { ...state, loading: state.loading || refreshing, start };
}
