"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type MarketRefresh = {
  /** Rattrapage en cours : la veille affichée va être remplacée */
  pending: boolean;
  /** Annonces de la nouvelle veille, une fois le rattrapage abouti ; null sinon */
  refreshedAds: number | null;
};

/**
 * Rattrapage d'office de la veille (« veille seule ») : quand le serveur dit
 * que la veille affichée a été enregistrée avec d'anciennes règles et montre
 * trop peu d'annonces (`needed`), la route de rattrapage est appelée une
 * fois, puis la page est relue. Aucune boucle : le service n'accepte qu'une
 * tentative par jour — réussie ou non, `needed` revient à faux à la relecture
 * — et ce composant n'en lance jamais deux.
 *
 * `pending` vaut vrai dès le premier rendu (et non après un effet) : ce qui
 * dépend de la veille affichée — le chargement des visuels — attend la
 * nouvelle au lieu de travailler sur l'ancienne.
 */
export function useMarketRefresh(needed: boolean): MarketRefresh {
  const router = useRouter();
  const started = useRef(false);
  const [settled, setSettled] = useState(false);
  const [refreshedAds, setRefreshedAds] = useState<number | null>(null);
  const [rereading, startReread] = useTransition();

  useEffect(() => {
    if (!needed || started.current) return;
    started.current = true;
    void (async () => {
      let ads: number | null = null;
      try {
        const response = await fetch("/api/meta-ads/market/refresh", { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" });
        const result = (await response.json().catch(() => null)) as { refreshed?: boolean; ads?: number } | null;
        if (response.ok && result?.refreshed === true && typeof result.ads === "number") ads = result.ads;
      } catch {
        // Réseau coupé : la veille affichée reste en place, la tentative est déjà enregistrée côté serveur
      }
      setRefreshedAds(ads);
      setSettled(true);
      startReread(() => router.refresh());
    })();
  }, [needed, router]);

  return { pending: needed && (!settled || rereading), refreshedAds };
}
