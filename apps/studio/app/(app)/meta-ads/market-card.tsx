"use client";

import { clsx } from "clsx";
import { TriangleAlert } from "lucide-react";
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

/** Geste d'une carte : pilule de 36 px (44 px au doigt), pression du design system. */
const ACTION = "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full text-xs ds-press pointer-coarse:min-h-11";

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
      // Entrée en cascade du design system : six rangs au plus, puis toutes ensemble
      style={{ "--ds-i": Math.min(index % 24, 5) } as CSSProperties}
      className={clsx(
        "group @container relative flex flex-col overflow-hidden rounded-ds-card bg-white shadow-ds-card ds-rise",
        selecting && "cursor-pointer",
        // Sélectionnée : liseré de 2 px au bleu de l'action, en plus de la case cochée
        selected ? "ring-2 ring-ds-brand-600" : "ring-1 ring-ds-ink-900/5",
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
        className="relative block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-ds-ink-100 ds-focus-inset"
      >
        {cover ? (
          // Le visuel s'approche au survol (translation seule, absente en mouvement réduit)
          <span className="block h-full w-full motion-safe:transition-transform motion-safe:duration-ds-slow motion-safe:ease-ds-out motion-safe:group-hover:scale-[1.035]">
            <AdImage src={cover} alt={`Visuel de l'annonce de ${ad.pageName}`} fallback={poster} className="h-full w-full object-cover" />
          </span>
        ) : (
          poster
        )}
        <FormatBadge ad={ad} className="absolute top-2.5 left-2.5" />
        {format === "video" && cover ? (
          <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white pl-0.5 text-ds-ink-900 shadow-ds-pop motion-safe:transition-transform motion-safe:duration-ds-base motion-safe:ease-ds-out motion-safe:group-hover:scale-110">
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
              "absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg shadow-ds-card",
              selected ? "bg-ds-brand-600 text-white" : "bg-white text-transparent inset-ring-2 inset-ring-ds-ink-450",
            )}
          >
            <Icon name="check" className="size-4" />
          </span>
        ) : ad.kept && mode === "veille" ? (
          <span className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow" title="Dans votre bibliothèque">
            <Icon name="bookmark" filled className="size-4" />
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-1.5">
          <SignalBadge ad={ad} />
          <RankChip ad={ad} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <PageAvatar name={ad.pageName} url={ad.media?.avatarUrl} seed={ad.pageId ?? ad.pageName} />
          {/* Hors sélection, c'est le bouton qui rogne le nom : son anneau de focus reste entier. Au doigt, sa zone sensible monte à 44 px sans déplacer la mise en page */}
          <h3 className={clsx("min-w-0 flex-1 text-ds-body font-semibold text-ds-ink-900", selecting && "truncate")}>
            {selecting ? (
              ad.pageName
            ) : (
              <button type="button" onClick={onOpen} className={clsx("block max-w-full cursor-pointer truncate rounded text-left hover:text-ds-brand-700 pointer-coarse:-my-2.5 pointer-coarse:py-2.5", FOCUS_RING)}>
                {ad.pageName}
              </button>
            )}
          </h3>
        </div>

        <p className="truncate text-ds-meta text-ds-ink-700">{hook || <span className="text-ds-ink-600 italic">Annonce sans texte</span>}</p>

        {/* Deux lignes : la colonne de droite (date, note) prend sa largeur, les plateformes ont le reste */}
        <div className="space-y-2 rounded-ds-sm bg-ds-ink-50 px-2.5 py-2.5 inset-ring inset-ring-ds-ink-200">
          <dl className="flex items-start justify-between gap-2">
            <Fact label="Diffusion">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className={clsx("size-2 shrink-0 rounded-full", diffusion.state === "active" ? "bg-ds-success-600 ring-3 ring-ds-success-600/20" : "bg-ds-ink-300")} />
                <span className={diffusion.state === "active" ? undefined : "font-normal text-ds-ink-600"}>{diffusion.short}</span>
                {diffusion.state === "active" ? <span className="sr-only"> (en cours)</span> : null}
              </span>
            </Fact>
            <Fact label="Lancée le" end>
              <span className="ds-tnum">{formatAdDate(ad.startedAt) ?? "—"}</span>
            </Fact>
          </dl>
          <dl className="flex items-start justify-between gap-2">
            <Fact label="Plateformes">{platforms ?? "—"}</Fact>
            <Fact label="Note" end>
              <span className="ds-tnum">
                {adNote(ad.score)}
                <span className="font-normal text-ds-ink-600">/10</span>
              </span>
            </Fact>
          </dl>
        </div>

        {savedAt ? <p className="text-xs text-ds-ink-600">Gardée le {formatAdDate(savedAt) ?? "—"}</p> : null}

        {error ? (
          <p role="alert" className="flex items-start gap-1.5 rounded-ds-sm bg-ds-danger-100 px-2.5 py-2 text-xs text-ds-danger-900">
            <TriangleAlert size={14} aria-hidden className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}

        {canEdit && !selecting ? (
          <div className="mt-auto flex items-center gap-1.5 pt-0.5">
            {mode === "veille" ? (
              <>
                <button
                  type="button"
                  data-testid="meta-keep"
                  aria-pressed={ad.kept}
                  onClick={ad.kept ? onUnkeep : onKeep}
                  title={ad.kept ? "Retirer de ma bibliothèque" : "Conserver l'annonce, son analyse et ses visuels dans ma bibliothèque"}
                  className={clsx(
                    ACTION,
                    "min-w-0 flex-1 gap-[5px] px-2.5 font-semibold",
                    FOCUS_RING,
                    // Gardée : aplat profond de la section, signet plein et libellé « Gardée » — pas la couleur seule
                    ad.kept
                      ? "bg-ds-section-gradient-deep text-ds-section-on-deep"
                      : "bg-ds-section-tint-2 text-ds-section-ink inset-ring inset-ring-ds-section-line hover:bg-ds-section-line",
                  )}
                >
                  <Icon name="bookmark" filled={ad.kept} className="size-3.5 shrink-0" />
                  {/* Carte étroite (grille à quatre colonnes) : libellé court, les deux gestes restent nommés */}
                  <span className="truncate @[19rem]:hidden">{ad.kept ? "Gardée" : "Garder"}</span>
                  <span className="hidden truncate @[19rem]:inline">{ad.kept ? "Gardée" : "Garder comme exemple"}</span>
                  <span className="sr-only"> : annonce de {ad.pageName}</span>
                </button>
                <button
                  type="button"
                  data-testid="meta-dismiss"
                  onClick={onDismiss}
                  aria-label={`Supprimer l'annonce de ${ad.pageName}`}
                  title="Supprimer de ma veille"
                  className={clsx(
                    ACTION,
                    "min-w-9 shrink-0 gap-1.5 px-3 font-medium text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-danger-100 hover:text-ds-danger-900 hover:inset-ring-ds-danger-600/40",
                    FOCUS_RING,
                  )}
                >
                  <Icon name="trash" className="size-4 shrink-0" />
                  <span>Supprimer</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="meta-unkeep"
                onClick={onRemove}
                className={clsx(
                  ACTION,
                  "min-w-0 flex-1 gap-1.5 px-3 font-semibold text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-danger-100 hover:text-ds-danger-900 hover:inset-ring-ds-danger-600/40",
                  FOCUS_RING,
                )}
              >
                <Icon name="bookmark" className="size-4 shrink-0" />
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

function Fact({ label, end = false, children }: { label: string; /** Colonne de droite : alignée à droite, jamais rognée */ end?: boolean; children: ReactNode }) {
  return (
    <div className={end ? "shrink-0 text-right" : "min-w-0 flex-1"}>
      <dt className="text-xs text-ds-ink-600">{label}</dt>
      <dd className="truncate text-ds-meta font-medium text-ds-ink-900">{children}</dd>
    </div>
  );
}
