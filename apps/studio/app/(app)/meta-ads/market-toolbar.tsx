"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import {
  META_GALLERY_DEFAULT_FILTERS,
  META_GALLERY_SORTS,
  META_GALLERY_SORT_LABELS,
  META_MARKET_SCOPE_LABELS,
  type MetaGalleryCounts,
  type MetaGalleryFilters,
  type MetaGalleryFormat,
  type MetaGallerySort,
  type MetaMarketScope,
} from "@theralys/shared";
import { filtersAreDefault, galleryCountLabel } from "@/lib/meta-ads/market-view";
import { FOCUS_RING, Icon } from "./market-icons";

const FORMAT_PILLS: { id: MetaGalleryFormat; testId: string; label: string }[] = [
  { id: "all", testId: "all", label: "Tous" },
  { id: "video", testId: "video", label: "Vidéos" },
  { id: "image", testId: "image", label: "Images" },
  { id: "carousel", testId: "carousel", label: "Carrousels" },
  { id: "sans", testId: "sans", label: "Sans visuel" },
];

const SELECT =
  "h-10 w-full cursor-pointer appearance-none truncate rounded-full border border-cream-300 bg-white pl-3.5 pr-8 text-[13px] font-medium text-ink-900 transition-colors hover:border-ink-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:pl-4 sm:pr-9 sm:text-sm";

/**
 * Barre d'outils de la galerie : recherche, tri, zone, mode sélection, puis
 * formats (avec leurs compteurs), « Actives uniquement », « Nouveautés » et
 * le nombre d'annonces affichées. Les compteurs portent sur toute la vue,
 * avant filtrage.
 */
export function MarketToolbar({
  filters,
  onChange,
  counts,
  scopes,
  shown,
  selecting,
  onToggleSelecting,
}: {
  filters: MetaGalleryFilters;
  onChange: (next: MetaGalleryFilters) => void;
  counts: MetaGalleryCounts;
  /** Zones proposées par le filtre de zone ; vide : filtre masqué */
  scopes: MetaMarketScope[];
  /** Annonces après filtrage */
  shown: number;
  /** null : sélection indisponible (bibliothèque pas encore activée) */
  selecting: boolean | null;
  onToggleSelecting: () => void;
}) {
  const formatCount = (format: MetaGalleryFormat) => (format === "all" ? counts.total : counts.formats[format]);
  const pills = FORMAT_PILLS.filter((pill) => pill.id !== "sans" || counts.formats.sans > 0 || filters.format === "sans");
  const pristine = filtersAreDefault(filters);

  return (
    // Une seule rangée qui se replie : sur mobile, « Sélectionner » rejoint le compteur sur la dernière ligne
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-cream-200 bg-white p-3 shadow-(--shadow-card) sm:gap-x-2.5 sm:p-4" role="search" aria-label="Filtrer les annonces">
      <label className="relative min-w-0 basis-full sm:basis-64 sm:flex-1">
        <span className="sr-only">Rechercher une annonce</span>
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          type="search"
          data-testid="meta-gallery-search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Rechercher une annonce"
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 w-full rounded-full border border-cream-300 bg-cream-50 pl-10 pr-4 text-sm text-ink-900 transition-colors placeholder:text-ink-500 hover:border-ink-300 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 [&::-webkit-search-cancel-button]:cursor-pointer"
        />
      </label>

      <SelectField label="Trier les annonces" className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto">
        <select data-testid="meta-gallery-sort" value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value as MetaGallerySort })} className={SELECT}>
          {META_GALLERY_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {META_GALLERY_SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </SelectField>

      {scopes.length > 0 ? (
        <SelectField label="Filtrer par zone" className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto">
          <select data-testid="meta-gallery-scope" value={filters.scope} onChange={(event) => onChange({ ...filters, scope: event.target.value as MetaGalleryFilters["scope"] })} className={SELECT}>
            <option value="all">Toutes les zones</option>
            {scopes.map((scope) => (
              <option key={scope} value={scope}>
                {META_MARKET_SCOPE_LABELS[scope]} ({counts.scopes[scope]})
              </option>
            ))}
          </select>
        </SelectField>
      ) : null}

      {selecting !== null ? (
        <button
          type="button"
          data-testid="meta-select-toggle"
          aria-pressed={selecting}
          onClick={onToggleSelecting}
          className={clsx(
            "order-last inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors sm:order-none sm:h-10 sm:px-4",
            FOCUS_RING,
            selecting ? "bg-ink-900 text-white hover:bg-ink-700" : "border border-cream-300 bg-white text-ink-900 hover:border-ink-300 hover:bg-cream-50",
          )}
        >
          <Icon name="select" className="h-4 w-4" />
          Sélectionner
        </button>
      ) : null}

      {/* Retour à la ligne : formats et filtres à bascule sous la recherche */}
      <span aria-hidden className="hidden h-0 basis-full sm:block" />

      <div role="group" aria-label="Format" className="-mx-3 flex min-w-0 basis-[calc(100%+1.5rem)] gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:basis-auto sm:px-0 [&::-webkit-scrollbar]:hidden">
        {pills.map((pill) => (
          <Pill key={pill.id} testId={`meta-gallery-format-${pill.testId}`} active={filters.format === pill.id} count={formatCount(pill.id)} onClick={() => onChange({ ...filters, format: pill.id })}>
            {pill.label}
          </Pill>
        ))}
      </div>

      <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-cream-300 lg:block" />

      <div className="flex basis-full flex-wrap gap-1.5 sm:basis-auto">
        <Pill testId="meta-gallery-active" tone="toggle" active={filters.activeOnly} count={counts.active} onClick={() => onChange({ ...filters, activeOnly: !filters.activeOnly })} dot>
          Actives uniquement
        </Pill>
        <Pill testId="meta-gallery-recent" tone="toggle" active={filters.recentOnly} count={counts.recent} onClick={() => onChange({ ...filters, recentOnly: !filters.recentOnly })}>
          Nouveautés
        </Pill>
      </div>

      <div className="order-last ml-auto flex min-h-8 items-center gap-1 pl-1">
        {!pristine ? (
          <button
            type="button"
            data-testid="meta-gallery-reset"
            onClick={() => onChange(META_GALLERY_DEFAULT_FILTERS)}
            className={clsx("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50", FOCUS_RING)}
          >
            <Icon name="undo" className="h-3.5 w-3.5" />
            Réinitialiser
          </button>
        ) : null}
        <p data-testid="meta-gallery-count" aria-live="polite" className="whitespace-nowrap text-sm font-medium tabular-nums text-ink-700">
          {galleryCountLabel(shown, counts.total)}
        </p>
      </div>
    </div>
  );
}

function SelectField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={clsx("relative block", className)}>
      <span className="sr-only">{label}</span>
      {children}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 sm:right-3.5" aria-hidden>
        <path d="M5.5 8l4.5 4.5L14.5 8" />
      </svg>
    </label>
  );
}

/** Pastille à compteur : onglet de format (une seule active) ou filtre à bascule. */
function Pill({
  testId,
  active,
  count,
  onClick,
  tone = "tab",
  dot = false,
  children,
}: {
  testId: string;
  active: boolean;
  count: number;
  onClick: () => void;
  tone?: "tab" | "toggle";
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors",
        FOCUS_RING,
        tone === "tab"
          ? active
            ? "bg-primary-600 text-white shadow-sm"
            : "bg-cream-100 text-ink-700 hover:bg-cream-200"
          : active
            ? "bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-300"
            : "bg-white text-ink-700 ring-1 ring-inset ring-cream-300 hover:bg-cream-50 hover:ring-ink-300",
      )}
    >
      {dot ? <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" /> : null}
      {tone === "toggle" && active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
      {children}
      <span
        className={clsx(
          "rounded-full px-1.5 py-px text-[11px] tabular-nums leading-4",
          tone === "tab" ? (active ? "bg-white/20 text-white" : "bg-white text-ink-500") : active ? "bg-primary-100 text-primary-800" : "bg-cream-100 text-ink-500",
        )}
      >
        {count}
      </span>
    </button>
  );
}
