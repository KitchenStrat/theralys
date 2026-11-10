"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@theralys/ui";
import {
  META_GALLERY_DEFAULT_FILTERS,
  META_LIBRARY_BULK_MAX,
  filterGalleryAds,
  galleryCounts,
  galleryScopes,
  type MetaGalleryAd,
  type MetaGalleryFilters,
} from "@theralys/shared";
import { MarketCard, type GalleryMode } from "./market-card";
import { MarketDetail } from "./market-detail";
import { BulkBar } from "./market-feedback";
import { MarketToolbar } from "./market-toolbar";
import type { MarketLibrary } from "./use-market-library";

/** Cartes affichées d'abord, puis ajoutées par « Afficher plus ». */
const PAGE_SIZE = 24;

const NO_SELECTION: ReadonlySet<string> = new Set();

/**
 * Galerie d'annonces : barre d'outils (recherche, formats, filtres, tri),
 * grille de cartes paginée, mode sélection avec gestes groupés et fiche d'une
 * annonce. Sert la veille (« Annonces ») et les exemples gardés (« Ma
 * bibliothèque ») ; le filtrage et les compteurs viennent de
 * `@theralys/shared`.
 */
export function MarketGallery({
  mode,
  ads,
  filters,
  onFilters,
  library,
  now,
  onShowWatch,
}: {
  mode: GalleryMode;
  /** Toutes les annonces de la vue, avant filtrage (`savedAt` : vue bibliothèque) */
  ads: readonly (MetaGalleryAd & { savedAt?: string })[];
  filters: MetaGalleryFilters;
  onFilters: (next: MetaGalleryFilters) => void;
  library: MarketLibrary;
  now: Date;
  /** Vue bibliothèque vide : retour à la veille */
  onShowWatch: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [detailId, setDetailId] = useState<string | null>(null);

  const counts = useMemo(() => galleryCounts(ads, now), [ads, now]);
  // Filtre de zone : dans la veille seulement, et s'il y a plus d'une zone à départager
  const scopes = useMemo(() => {
    const present = galleryScopes(counts);
    return mode === "veille" && present.length > 1 ? present : [];
  }, [counts, mode]);
  // Un filtre de zone qui n'est plus proposé ne joue plus
  const active = useMemo<MetaGalleryFilters>(() => (filters.scope !== "all" && !scopes.includes(filters.scope) ? { ...filters, scope: "all" } : filters), [filters, scopes]);
  const filtered = useMemo(() => filterGalleryAds(ads, active, now), [ads, active, now]);
  const visible = filtered.slice(0, limit);
  const savedAt = useMemo(() => new Map(ads.map((ad) => [ad.id, ad.savedAt ?? null])), [ads]);
  // Sélection utile : les annonces cochées encore affichées
  const chosen = visible.filter((ad) => selected.has(ad.id)).map((ad) => ad.id);
  const detail = detailId === null ? null : (ads.find((ad) => ad.id === detailId) ?? null);
  const canEdit = library.available;

  // Annonce de la fiche disparue (supprimée, retirée) : la fiche ne doit pas se rouvrir si elle revient
  useEffect(() => {
    if (detailId !== null && !detail) setDetailId(null);
  }, [detailId, detail]);

  function changeFilters(next: MetaGalleryFilters) {
    setLimit(PAGE_SIZE);
    onFilters(next);
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < META_LIBRARY_BULK_MAX) next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(NO_SELECTION);
  }

  /** Geste groupé sur la sélection ; le mode sélection se referme, sauf si le praticien a renoncé. */
  function bulk(action: (ids: readonly string[]) => boolean | void) {
    if (action(chosen) !== false) stopSelecting();
  }

  if (ads.length === 0) {
    return mode === "bibliotheque" ? (
      <Card className="p-8 text-center text-ink-500" data-testid="meta-library-empty">
        <p className="mx-auto max-w-xl text-sm">
          <span className="font-medium text-ink-700">Votre bibliothèque est vide.</span> Dans l&apos;onglet Annonces, cliquez sur « Garder comme exemple » pour conserver une annonce, son
          analyse et ses visuels, même quand elle ne sera plus diffusée.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={onShowWatch}>
            Voir les annonces
          </Button>
        </div>
      </Card>
    ) : (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">Votre veille ne contient plus d&apos;annonce.</p>
        <p className="mt-1 text-sm">Relancez l&apos;analyse depuis l&apos;onglet Diagnostic pour repérer de nouvelles annonces.</p>
      </Card>
    );
  }

  return (
    <div className="relative">
      <MarketToolbar
        filters={active}
        onChange={changeFilters}
        counts={counts}
        scopes={scopes}
        shown={filtered.length}
        selecting={canEdit ? selecting : null}
        onToggleSelecting={() => (selecting ? stopSelecting() : setSelecting(true))}
      />

      {!canEdit && mode === "veille" ? <p className="mt-3 px-1 text-sm text-ink-500">Votre bibliothèque personnelle est en cours d&apos;activation.</p> : null}

      {filtered.length === 0 ? (
        <div className="mt-5 rounded-card border border-dashed border-cream-300 bg-white/60 px-6 py-12 text-center">
          <p className="font-medium text-ink-700">Aucune annonce ne correspond à ces filtres.</p>
          <p className="mt-1 text-sm text-ink-500">Élargissez la recherche ou revenez à la liste complète.</p>
          <div className="mt-5">
            <Button variant="secondary" onClick={() => changeFilters(META_GALLERY_DEFAULT_FILTERS)}>
              Réinitialiser les filtres
            </Button>
          </div>
        </div>
      ) : (
        // Conteneur de requêtes : le nombre de colonnes suit la largeur de la galerie, pas celle de la fenêtre
        <div className="@container mt-5">
          <ul
            role="list"
            data-testid="meta-gallery"
            aria-label={mode === "veille" ? "Annonces de la veille" : "Exemples gardés"}
            // Seuils choisis pour qu'une carte fasse au moins 244 px : « Garder comme exemple » tient sur une ligne
            className="grid grid-cols-1 gap-4 @[32rem]:grid-cols-2 @[48rem]:grid-cols-3 @[64rem]:grid-cols-4"
          >
            {visible.map((ad, index) => (
              <MarketCard
                key={ad.id}
                ad={ad}
                mode={mode}
                index={index}
                now={now}
                canEdit={canEdit}
                selecting={selecting}
                selected={selected.has(ad.id)}
                error={library.errors[ad.id] ?? null}
                savedAt={savedAt.get(ad.id) ?? null}
                onOpen={() => setDetailId(ad.id)}
                onToggle={() => toggle(ad.id)}
                onKeep={() => library.keep([ad.id])}
                onUnkeep={() => library.unkeep([ad.id])}
                onDismiss={() => library.dismiss([ad.id])}
                onRemove={() => library.removeFromLibrary([ad.id])}
              />
            ))}
          </ul>
        </div>
      )}

      {filtered.length > limit ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button variant="secondary" data-testid="meta-gallery-more" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            Afficher plus
          </Button>
          <p className="text-xs tabular-nums text-ink-500">
            {visible.length} annonces affichées sur {filtered.length}
          </p>
        </div>
      ) : null}

      {selecting && canEdit ? (
        <BulkBar
          mode={mode}
          count={chosen.length}
          onKeep={() => bulk(library.keep)}
          onDismiss={() => bulk(library.dismiss)}
          onRemove={() => bulk(library.removeFromLibrary)}
          onCancel={stopSelecting}
        />
      ) : null}

      {detail ? (
        <MarketDetail
          ad={detail}
          mode={mode}
          now={now}
          canEdit={canEdit}
          error={library.errors[detail.id] ?? null}
          savedAt={savedAt.get(detail.id) ?? null}
          onClose={() => setDetailId(null)}
          onKeep={() => library.keep([detail.id])}
          onUnkeep={() => library.unkeep([detail.id])}
          // L'annonce quitte la vue : la fiche se referme d'elle-même
          onDismiss={() => library.dismiss([detail.id])}
          onRemove={() => library.removeFromLibrary([detail.id])}
        />
      ) : null}
    </div>
  );
}
