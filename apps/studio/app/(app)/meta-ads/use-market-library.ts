"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { META_LIBRARY_BULK_MAX, type MetaAdMedia, type MetaAdsMarket, type MetaGalleryAd } from "@theralys/shared";
import type { MetaLibraryView } from "@/lib/meta-ads/data";
import { libraryGalleryAds, watchGalleryAds, type LibraryGalleryAd, type LibraryMark, type LibraryOverride } from "@/lib/meta-ads/market-view";
import { dismissMarketAds, keepMarketAds, restoreMarketAds } from "./actions";

const ACTION_FAILED = "L'action a échoué — réessayez dans un instant.";

export type MarketToast = {
  /** Change à chaque message : relance le minuteur de fermeture */
  key: number;
  message: string;
  tone: "info" | "error";
  /** « Annuler » : absent quand le geste ne peut pas être défait */
  undo: (() => void) | null;
};

export type MarketLibrary = {
  /** false : bibliothèque pas encore activée — garder, supprimer et sélectionner sont masqués */
  available: boolean;
  /** Vue « Annonces » : la veille sans les annonces supprimées */
  watch: MetaGalleryAd[];
  /** Vue « Ma bibliothèque » */
  kept: LibraryGalleryAd[];
  /** Dernier échec par annonce, affiché sur sa carte */
  errors: Readonly<Record<string, string>>;
  toast: MarketToast | null;
  closeToast: () => void;
  keep: (adIds: readonly string[]) => void;
  /** Bascule « Gardée » de la veille : l'exemple quitte la bibliothèque, l'annonce reste dans la veille */
  unkeep: (adIds: readonly string[]) => void;
  dismiss: (adIds: readonly string[]) => void;
  /**
   * « Retirer de ma bibliothèque » : avec « Annuler » tant que l'annonce est
   * dans la veille, confirmation sinon. Rend false si le praticien renonce.
   */
  removeFromLibrary: (adIds: readonly string[]) => boolean;
};

type LibraryAction = (input: { adIds: string[] }) => Promise<{ error?: string; message?: string }>;

async function run(action: LibraryAction, adIds: string[]): Promise<string | null> {
  if (adIds.length === 0) return null;
  try {
    const result = await action({ adIds });
    return result.error ?? null;
  } catch {
    return ACTION_FAILED;
  }
}

/**
 * Gestes « Garder comme exemple » et « Supprimer » de la galerie, optimistes :
 * l'écran change tout de suite (état local posé par-dessus les données du
 * serveur), l'action part ensuite ; en cas d'échec le geste est défait et le
 * message s'affiche sur la carte (ou dans le bandeau pour un lot). Après
 * chaque réussite, la page est rafraîchie pour que les données suivent.
 */
export function useMarketLibrary({ market, mediaByAdId, library }: { market: MetaAdsMarket; mediaByAdId: Readonly<Record<string, MetaAdMedia | undefined>>; library: MetaLibraryView }): MarketLibrary {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, LibraryOverride | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<MarketToast | null>(null);
  const tokens = useRef(0);
  /** Dernier geste posé sur chaque annonce : un échec tardif ne défait pas un geste plus récent */
  const owners = useRef<Record<string, number>>({});

  // Le serveur ne renvoie pas les visuels d'une annonce supprimée : à l'annulation, la carte reprend
  // ceux qu'elle avait, le temps que les données reviennent (sinon elle passerait par l'affiche typographique).
  const seen = useRef<Record<string, MetaAdMedia | undefined>>({});
  const media = useMemo(() => {
    seen.current = { ...seen.current, ...mediaByAdId };
    const restored = library.dismissedIds.filter((id) => mediaByAdId[id] === undefined && seen.current[id] !== undefined).map((id) => [id, seen.current[id]] as const);
    return restored.length > 0 ? { ...mediaByAdId, ...Object.fromEntries(restored) } : mediaByAdId;
  }, [mediaByAdId, library.dismissedIds]);

  const watch = useMemo(() => watchGalleryAds(market.ads, media, library, overrides), [market.ads, media, library, overrides]);
  const kept = useMemo(() => libraryGalleryAds(market.ads, media, library, overrides), [market.ads, media, library, overrides]);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  /** Bandeau du bas ; `key` : jeton du geste annoncé (un échec de ce geste le referme), nouveau jeton sinon. */
  const say = useCallback(
    (message: string, options: { tone?: MarketToast["tone"]; undo?: MarketToast["undo"]; key?: number } = {}) =>
      setToast({ key: options.key ?? ++tokens.current, message, tone: options.tone ?? "info", undo: options.undo ?? null }),
    [],
  );
  const closeToast = useCallback(() => setToast(null), []);

  /** Pose l'état voulu à l'écran ; rend le jeton qui permettra de ne défaire que ce geste. */
  function mark(marks: Readonly<Record<string, LibraryMark>>): number {
    const token = ++tokens.current;
    const at = new Date().toISOString();
    const ids = Object.keys(marks);
    for (const id of ids) owners.current[id] = token;
    setOverrides((previous) => ({ ...previous, ...Object.fromEntries(ids.map((id) => [id, { mark: marks[id]!, at, token }])) }));
    setErrors((previous) => (ids.some((id) => id in previous) ? Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))) : previous));
    return token;
  }

  /**
   * Échec : retour à l'état du serveur pour les annonces que ce geste régit
   * encore (rien à défaire ni à signaler si un geste plus récent l'a
   * remplacé), annonce du geste refermée, message sur la carte (une annonce
   * visible) ou dans le bandeau (un lot, ou une carte qui n'est plus là).
   */
  function fail(ids: readonly string[], token: number, error: string, where: "card" | "toast" = ids.length === 1 ? "card" : "toast") {
    const mine = ids.filter((id) => owners.current[id] === token);
    if (mine.length === 0) return;
    setOverrides((previous) => {
      const next = { ...previous };
      for (const id of mine) if (next[id]?.token === token) delete next[id];
      return next;
    });
    if (where === "card") {
      setErrors((previous) => ({ ...previous, ...Object.fromEntries(mine.map((id) => [id, error])) }));
      setToast((current) => (current?.key === token ? null : current));
    } else {
      say(error, { tone: "error" });
    }
  }

  const bulk = (adIds: readonly string[]) => [...new Set(adIds)].slice(0, META_LIBRARY_BULK_MAX);

  function keep(adIds: readonly string[]) {
    const ids = bulk(adIds);
    if (ids.length === 0) return;
    const token = mark(Object.fromEntries(ids.map((id) => [id, "kept"])));
    if (ids.length > 1) say(`${ids.length} annonces gardées dans votre bibliothèque.`, { key: token });
    void run(keepMarketAds, ids).then((error) => (error ? fail(ids, token, error) : refresh()));
  }

  function unkeep(adIds: readonly string[]) {
    const ids = bulk(adIds);
    if (ids.length === 0) return;
    const token = mark(Object.fromEntries(ids.map((id) => [id, "none"])));
    void run(restoreMarketAds, ids).then((error) => (error ? fail(ids, token, error) : refresh()));
  }

  function dismiss(adIds: readonly string[]) {
    const ids = bulk(adIds);
    if (ids.length === 0) return;
    const keptBefore = new Set(kept.map((ad) => ad.id));
    const wasKept = ids.filter((id) => keptBefore.has(id));
    const token = mark(Object.fromEntries(ids.map((id) => [id, "dismissed"])));
    const undo = () => {
      // Annuler : l'annonce retrouve sa place, et son état d'exemple gardé si elle l'était
      const back = mark(Object.fromEntries(ids.map((id) => [id, wasKept.includes(id) ? "kept" : "none"])));
      setToast(null);
      void run(restoreMarketAds, ids)
        .then((error) => error ?? run(keepMarketAds, wasKept))
        .then((error) => {
          // En cas d'échec la carte repart avec l'état du serveur : le message va dans le bandeau
          if (error) fail(ids, back, error, "toast");
          refresh();
        });
    };
    say(ids.length > 1 ? `${ids.length} annonces supprimées de votre veille.` : "Annonce supprimée de votre veille.", { key: token, undo });
    void run(dismissMarketAds, ids).then((error) => (error ? fail(ids, token, error) : refresh()));
  }

  function removeFromLibrary(adIds: readonly string[]): boolean {
    const ids = bulk(adIds);
    if (ids.length === 0) return false;
    const inWatch = new Set(market.ads.map((ad) => ad.id));
    const lost = ids.filter((id) => !inWatch.has(id));
    if (lost.length > 0) {
      const many = lost.length > 1;
      const question =
        ids.length === 1
          ? "Cette annonce n'est plus dans votre veille : une fois retirée de votre bibliothèque, elle ne pourra pas être retrouvée. La retirer ?"
          : `${lost.length} de ces annonces ${many ? "ne sont" : "n'est"} plus dans votre veille : une fois ${many ? "retirées" : "retirée"} de votre bibliothèque, ${many ? "elles ne pourront" : "elle ne pourra"} pas être ${many ? "retrouvées" : "retrouvée"}. Retirer la sélection ?`;
      if (!window.confirm(question)) return false;
    }
    const token = mark(Object.fromEntries(ids.map((id) => [id, "none"])));
    // « Annuler » seulement si toutes les annonces sont encore dans la veille (elles peuvent être gardées à nouveau)
    const undo =
      lost.length === 0
        ? () => {
            setToast(null);
            keep(ids);
          }
        : null;
    say(ids.length > 1 ? `${ids.length} annonces retirées de votre bibliothèque.` : "Annonce retirée de votre bibliothèque.", { key: token, undo });
    void run(restoreMarketAds, ids).then((error) => (error ? fail(ids, token, error) : refresh()));
    return true;
  }

  return { available: library.available, watch, kept, errors, toast, closeToast, keep, unkeep, dismiss, removeFromLibrary };
}
