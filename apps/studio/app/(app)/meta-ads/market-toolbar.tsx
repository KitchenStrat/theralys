"use client";

import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
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

/** Champ de la barre d'outils : 40 px (44 px au doigt), bordure de champ du design system (3:1) ; l'anneau de focus vient de la coquille. */
const FIELD = "h-10 w-full rounded-full border border-ds-ink-450 bg-white text-ds-body text-ds-ink-900 hover:border-ds-ink-600 pointer-coarse:h-11";

const SELECT = clsx(FIELD, "cursor-pointer appearance-none truncate pr-9 pl-4 font-medium");

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
    <div className="flex flex-wrap items-center gap-2 rounded-ds-card bg-white p-3 shadow-ds-card ring-1 ring-ds-ink-900/5 sm:gap-x-2.5 sm:p-4" role="search" aria-label="Filtrer les annonces">
      <label className="relative min-w-0 basis-full sm:flex-1 sm:basis-48">
        <span className="sr-only">Rechercher une annonce</span>
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ds-ink-600" />
        <input
          type="search"
          data-testid="meta-gallery-search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Rechercher une annonce"
          autoComplete="off"
          enterKeyHint="search"
          className={clsx(FIELD, "pr-4 pl-10 placeholder:text-ds-ink-500 [&::-webkit-search-cancel-button]:cursor-pointer")}
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
                {META_MARKET_SCOPE_LABELS[scope]}
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
            "order-last inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-ds-body ds-press sm:order-none pointer-coarse:min-h-11",
            FOCUS_RING,
            // Mode sélection actif : aplat d'encre et libellé gras, en plus de `aria-pressed`
            selecting ? "bg-ds-ink-900 font-semibold text-white" : "bg-white font-medium text-ds-brand-800 inset-ring inset-ring-ds-ink-300 hover:bg-ds-brand-50",
          )}
        >
          <Icon name="select" className="size-4" />
          Sélectionner
        </button>
      ) : null}

      {/* Retour à la ligne : formats et filtres à bascule sous la recherche */}
      <span aria-hidden className="hidden h-0 basis-full sm:block" />

      {/* La rangée défile sur mobile ; ses marges intérieures laissent la place de l'anneau de focus, qui n'est jamais rogné */}
      <div role="group" aria-label="Format" className="-mx-3 -my-1.5 flex min-w-0 basis-[calc(100%+1.5rem)] gap-1.5 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] sm:-mx-1.5 sm:basis-auto sm:px-1.5 [&::-webkit-scrollbar]:hidden">
        {pills.map((pill) => (
          <Pill key={pill.id} testId={`meta-gallery-format-${pill.testId}`} active={filters.format === pill.id} count={formatCount(pill.id)} onClick={() => onChange({ ...filters, format: pill.id })}>
            {pill.label}
          </Pill>
        ))}
      </div>

      <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-ds-ink-300 lg:block" />

      <div className="flex basis-full flex-wrap gap-1.5 sm:basis-auto">
        <Pill testId="meta-gallery-active" tone="toggle" active={filters.activeOnly} count={counts.active} onClick={() => onChange({ ...filters, activeOnly: !filters.activeOnly })} dot>
          Actives uniquement
        </Pill>
        <Pill testId="meta-gallery-recent" tone="toggle" active={filters.recentOnly} count={counts.recent} onClick={() => onChange({ ...filters, recentOnly: !filters.recentOnly })}>
          Nouveautés
        </Pill>
      </div>

      <div className="order-last ml-auto flex min-h-9 items-center gap-1 pl-1">
        {!pristine ? (
          <button
            type="button"
            data-testid="meta-gallery-reset"
            onClick={() => onChange(META_GALLERY_DEFAULT_FILTERS)}
            className={clsx("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-ds-meta font-semibold text-ds-brand-800 hover:bg-ds-brand-100 pointer-coarse:min-h-11", FOCUS_RING)}
          >
            <Icon name="undo" className="size-3.5" />
            Réinitialiser
          </button>
        ) : null}
        <p data-testid="meta-gallery-count" aria-live="polite" className="text-ds-body font-semibold whitespace-nowrap text-ds-ink-800 ds-tnum">
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
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ds-ink-600" />
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
        "inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-ds-meta whitespace-nowrap ds-press pointer-coarse:min-h-11",
        FOCUS_RING,
        // Format actif : aplat profond de la section et libellé gras ; filtre actif : teinte, liseré et coche
        tone === "tab"
          ? active
            ? "bg-ds-section-gradient-deep font-semibold text-ds-section-on-deep"
            : "bg-ds-ink-100 font-medium text-ds-ink-700 hover:bg-ds-ink-200"
          : active
            ? "bg-ds-section-tint-2 font-semibold text-ds-section-ink inset-ring inset-ring-ds-section-accent/60"
            : "bg-white font-medium text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-ink-50",
      )}
    >
      {dot ? <span aria-hidden className="size-2 rounded-full bg-ds-success-600" /> : null}
      {tone === "toggle" && active ? <Icon name="check" className="size-3.5" /> : null}
      {children}
      <span
        className={clsx(
          "rounded-full px-1.5 py-px text-xs leading-4 ds-tnum",
          tone === "tab" ? (active ? "bg-white text-ds-section-ink" : "bg-white text-ds-ink-700") : active ? "bg-white text-ds-section-ink" : "bg-ds-ink-100 text-ds-ink-700",
        )}
      >
        {count}
      </span>
    </button>
  );
}
