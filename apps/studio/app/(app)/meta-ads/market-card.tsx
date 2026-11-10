"use client";

import { clsx } from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { adNote, metaMediaCover, type MetaGalleryAd } from "@theralys/shared";
import { adDiffusion, adHook, formatAdDate, galleryFormatOf, platformsLabel } from "@/lib/meta-ads/market-view";
import { FOCUS_RING, Icon, PlayGlyph } from "./market-icons";
import { AdImage, FormatBadge, PageAvatar, RankChip, SignalBadge, TextPoster, ZoneChip } from "./market-media";

export type GalleryMode = "veille" | "bibliotheque";

export type MarketCardProps = {
  ad: MetaGalleryAd;
  mode: GalleryMode;
  /** Position dans la grille (cascade d'apparition) */
  index: number;
  now: Date;
  /** Bibliothèque activée : garder et supprimer sont proposés */
  canEdit: boolean;
  /** Mode sélection : toute la carte coche ou décoche l'annonce */
  selecting: boolean;
  selected: boolean;
  /** Dernier échec d'un geste sur cette annonce */
  error: string | null;
  /** Vue bibliothèque : date de garde (ISO 8601) */
  savedAt: string | null;
  onOpen: () => void;
  onToggle: () => void;
  onKeep: () => void;
  onUnkeep: () => void;
  onDismiss: () => void;
  onRemove: () => void;
};

/**
 * Carte d'une annonce : visuel 4:5 (ou affiche typographique), pastilles,
 * page, accroche, faits (diffusion, lancement, plateformes, note) et les deux
 * gestes « Garder comme exemple » / « Supprimer ».
 */
export function MarketCard({ ad, mode, index, now, canEdit, selecting, selected, error, savedAt, onOpen, onToggle, onKeep, onUnkeep, onDismiss, onRemove }: MarketCardProps) {
  const cover = metaMediaCover(ad.media, now);
  const hook = adHook(ad);
  const format = galleryFormatOf(ad);
  const diffusion = adDiffusion(ad);
  const platforms = platformsLabel(ad.platforms);
  const poster = <TextPoster adId={ad.id} hook={hook} />;

  return (
    <li
      data-testid="meta-gallery-card"
      data-ad-id={ad.id}
      data-format={format}
      data-kept={ad.kept ? "true" : "false"}
      onClick={selecting ? onToggle : undefined}
      style={{ "--mg-i": Math.min(index % 24, 11) } as CSSProperties}
      className={clsx(
        "mg-card group @container relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgb(12_74_110/0.05)] transition duration-300 motion-reduce:transition-none",
        selecting && "cursor-pointer",
        selected ? "border-primary-400 ring-2 ring-primary-300" : "border-cream-200 hover:-translate-y-0.5 hover:shadow-pop motion-reduce:hover:translate-y-0",
      )}
    >
      <button
        type="button"
        data-testid="meta-card-media"
        onClick={(event) => {
          if (!selecting) return onOpen();
          // La carte entière coche déjà : un seul basculement par clic
          event.stopPropagation();
          onToggle();
        }}
        aria-pressed={selecting ? selected : undefined}
        aria-label={selecting ? `Sélectionner l'annonce de ${ad.pageName}` : `Voir l'annonce de ${ad.pageName}`}
        className="relative block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-cream-100 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-primary-500"
      >
        {cover ? (
          <AdImage
            src={cover}
            alt={`Visuel de l'annonce de ${ad.pageName}`}
            fallback={poster}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
          />
        ) : (
          poster
        )}
        <FormatBadge media={ad.media} className="absolute left-2.5 top-2.5" />
        {format === "video" && cover ? (
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 pl-0.5 text-ink-900 shadow-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 motion-reduce:transform-none">
            <PlayGlyph />
          </span>
        ) : null}
        <span className="absolute bottom-2.5 left-2.5 flex">
          <ZoneChip ad={ad} overlay />
        </span>
        {selecting ? (
          <span
            aria-hidden
            className={clsx(
              "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg shadow-sm transition-colors",
              selected ? "bg-primary-600 text-white" : "bg-white/90 text-transparent ring-1 ring-inset ring-ink-300",
            )}
          >
            <Icon name="check" className="h-4 w-4" />
          </span>
        ) : ad.kept && mode === "veille" ? (
          <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-md" title="Dans votre bibliothèque">
            <Icon name="bookmark" filled className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex min-h-[22px] flex-wrap items-center justify-between gap-1.5">
          <SignalBadge ad={ad} />
          <RankChip ad={ad} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <PageAvatar name={ad.pageName} url={ad.media?.avatarUrl} seed={ad.pageId ?? ad.pageName} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
            {selecting ? (
              ad.pageName
            ) : (
              <button type="button" onClick={onOpen} className={clsx("max-w-full cursor-pointer truncate rounded text-left align-bottom transition-colors hover:text-primary-700", FOCUS_RING)}>
                {ad.pageName}
              </button>
            )}
          </h3>
        </div>

        <p className="truncate text-[13px] leading-5 text-ink-700">{hook || <span className="italic text-ink-500">Annonce sans texte</span>}</p>

        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-xl bg-cream-100/70 px-3 py-2.5">
          <Fact label="Diffusion">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={clsx("h-2 w-2 shrink-0 rounded-full", diffusion.state === "active" ? "bg-success-500 shadow-[0_0_0_3px_rgb(22_163_74/0.15)]" : "bg-ink-300")} />
              <span className={diffusion.state === "active" ? undefined : "font-normal text-ink-500"}>{diffusion.short}</span>
              {diffusion.state === "active" ? <span className="sr-only"> (en cours)</span> : null}
            </span>
          </Fact>
          <Fact label="Lancée le">
            <span className="tabular-nums">{formatAdDate(ad.startedAt) ?? "—"}</span>
          </Fact>
          <Fact label="Plateformes">{platforms ?? "—"}</Fact>
          <Fact label="Note">
            <span className="tabular-nums">
              {adNote(ad.score)}
              <span className="font-normal text-ink-500">/10</span>
            </span>
          </Fact>
        </dl>

        {savedAt ? <p className="text-[11px] leading-4 text-ink-500">Gardée le {formatAdDate(savedAt) ?? "—"}</p> : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-danger-100 px-2.5 py-1.5 text-xs text-danger-500">
            {error}
          </p>
        ) : null}

        {canEdit && !selecting ? (
          <div className="mt-auto flex items-center gap-2 pt-0.5">
            {mode === "veille" ? (
              <>
                <button
                  type="button"
                  data-testid="meta-keep"
                  aria-pressed={ad.kept}
                  onClick={ad.kept ? onUnkeep : onKeep}
                  title={ad.kept ? "Retirer de ma bibliothèque" : "Conserver l'annonce, son analyse et ses visuels dans ma bibliothèque"}
                  className={clsx(
                    "inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                    FOCUS_RING,
                    ad.kept ? "bg-primary-600 text-white hover:bg-primary-700" : "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200 hover:bg-primary-100",
                  )}
                >
                  <Icon name="bookmark" filled={ad.kept} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{ad.kept ? "Gardée" : "Garder comme exemple"}</span>
                  <span className="sr-only"> : annonce de {ad.pageName}</span>
                </button>
                <button
                  type="button"
                  data-testid="meta-dismiss"
                  onClick={onDismiss}
                  aria-label={`Supprimer l'annonce de ${ad.pageName}`}
                  title="Supprimer de ma veille"
                  className={clsx(
                    "inline-flex h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink-500 ring-1 ring-inset ring-cream-300 transition-colors hover:bg-danger-100 hover:text-danger-500 hover:ring-danger-500/30",
                    FOCUS_RING,
                  )}
                >
                  <Icon name="trash" className="h-4 w-4 shrink-0" />
                  {/* Libellé visible dès que la carte est assez large (mobile, grille à trois colonnes) */}
                  <span className="hidden @[18.5rem]:inline">Supprimer</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="meta-unkeep"
                onClick={onRemove}
                className={clsx(
                  "inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-700 ring-1 ring-inset ring-cream-300 transition-colors hover:bg-danger-100 hover:text-danger-500 hover:ring-danger-500/30",
                  FOCUS_RING,
                )}
              >
                <Icon name="bookmark" className="h-4 w-4 shrink-0" />
                <span className="truncate">Retirer de ma bibliothèque</span>
                <span className="sr-only"> : annonce de {ad.pageName}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-4 text-ink-500">{label}</dt>
      <dd className="truncate text-[13px] font-medium leading-5 text-ink-900">{children}</dd>
    </div>
  );
}
