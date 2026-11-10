"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Modal } from "@theralys/ui";
import { META_AD_MEDIA_FORMAT_LABELS, adNote, type MetaGalleryAd } from "@theralys/shared";
import { SIGNAL_LABELS, VISUAL_STATE_LABELS, adDiffusion, adMainText, audienceLabel, formatAdDate, galleryFormatOf, httpUrl, platformsLabel, rankLabel, zonesLabel } from "@/lib/meta-ads/market-view";
import type { GalleryMode } from "./market-card";
import { FOCUS_RING, Icon } from "./market-icons";
import { PageAvatar, RankChip, SignalBadge, ZoneChip } from "./market-media";
import { MediaViewer } from "./market-viewer";
import { useVisualState } from "./use-visuals-loader";

const ACTION = "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors";

export type MarketDetailProps = {
  ad: MetaGalleryAd;
  mode: GalleryMode;
  now: Date;
  canEdit: boolean;
  error: string | null;
  /** Vue bibliothèque : date de garde (ISO 8601) */
  savedAt: string | null;
  onClose: () => void;
  onKeep: () => void;
  onUnkeep: () => void;
  onDismiss: () => void;
  onRemove: () => void;
};

/**
 * Fiche d'une annonce : à gauche la visionneuse (image, vidéo, carrousel), à
 * droite la page, le texte complet, le lien, les faits de diffusion et les
 * gestes. Sur mobile, tout défile et les gestes restent en bas de la boîte.
 */
export function MarketDetail({ ad, mode, now, canEdit, error, savedAt, onClose, onKeep, onUnkeep, onDismiss, onRemove }: MarketDetailProps) {
  const media = ad.media;
  const bodies = [...new Set(ad.bodies.map((body) => body.trim()).filter((body) => body !== ""))];
  const body = adMainText(ad);
  const others = bodies.filter((text) => text !== body);
  const title = ad.titles.find((text) => text.trim() !== "") ?? null;
  const description = ad.descriptions.find((text) => text.trim() !== "") ?? null;
  const caption = ad.captions.find((text) => text.trim() !== "") ?? null;
  const landing = httpUrl(media?.linkUrl);
  const format = galleryFormatOf(ad);
  const visual = useVisualState(ad);
  const diffusion = adDiffusion(ad);
  const about = [
    media?.pageLikes != null ? `${media.pageLikes.toLocaleString("fr-FR")} mention${media.pageLikes > 1 ? "s" : ""} J'aime` : null,
    media?.pageCategories[0] ?? null,
  ].filter(Boolean);

  return (
    <Modal open onClose={onClose} title={`Annonce de ${ad.pageName}`} size="xl" plain>
      <div
        data-testid="meta-detail"
        data-ad-id={ad.id}
        className="relative flex max-h-[90vh] flex-col md:grid md:h-[min(90vh,45rem)] md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] md:grid-rows-[minmax(0,1fr)_auto]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto md:contents">
          <div className="md:row-span-2 md:min-h-0">
            <MediaViewer key={ad.id} ad={ad} now={now} />
          </div>

          <div className="px-5 pb-6 pt-5 md:min-h-0 md:overflow-y-auto md:px-6 md:pt-6">
            <header className="flex items-center gap-3 pr-10">
              <PageAvatar name={ad.pageName} url={media?.avatarUrl} seed={ad.pageId ?? ad.pageName} className="h-11 w-11 text-sm" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-ink-900">{ad.pageName}</h2>
                {about.length > 0 ? <p className="mt-0.5 text-xs text-ink-500">{about.join(" · ")}</p> : null}
              </div>
            </header>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <SignalBadge ad={ad} />
              <ZoneChip ad={ad} />
              <RankChip ad={ad} />
            </div>

            <h3 className="mt-5 text-sm font-semibold text-ink-900">Texte de l&apos;annonce</h3>
            {body ? <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink-700">{body}</p> : <p className="mt-1.5 text-sm italic text-ink-500">Annonce sans texte (visuel seul).</p>}
            {others.length > 0 ? (
              <details className="mt-2 text-sm text-ink-700">
                <summary className={clsx("cursor-pointer rounded text-xs font-medium text-primary-700 hover:underline", FOCUS_RING)}>
                  {others.length > 1 ? `${others.length} autres versions du texte` : "Une autre version du texte"}
                </summary>
                <ul className="mt-2 space-y-2">
                  {others.map((text, i) => (
                    <li key={`${i}-${text.slice(0, 24)}`} className="whitespace-pre-line break-words rounded-xl bg-cream-100/70 px-3 py-2 leading-relaxed">
                      {text}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {title || description || caption || media?.ctaText || landing ? (
              <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50 p-4">
                <dl className="space-y-2.5">
                  {title ? <Row label="Titre du lien" strong>{title}</Row> : null}
                  {description ? <Row label="Description">{description}</Row> : null}
                  {caption ? <Row label="Lien affiché">{caption}</Row> : null}
                  {media?.ctaText ? (
                    <Row label="Bouton">
                      <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-ink-900 ring-1 ring-inset ring-cream-300">{media.ctaText}</span>
                    </Row>
                  ) : null}
                </dl>
                {landing ? (
                  <a href={landing} target="_blank" rel="noopener noreferrer nofollow" className={clsx("mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-primary-700 hover:underline", FOCUS_RING)}>
                    Voir la page de destination ↗<span className="sr-only"> (nouvel onglet)</span>
                  </a>
                ) : null}
              </div>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Fact label="Diffusion">
                <span className="flex items-start gap-1.5">
                  <span aria-hidden className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", diffusion.state === "active" ? "bg-success-500 shadow-[0_0_0_3px_rgb(22_163_74/0.15)]" : "bg-ink-300")} />
                  {diffusion.long}
                </span>
              </Fact>
              <Fact label="Lancée le">{formatAdDate(ad.startedAt) ?? "Date inconnue"}</Fact>
              <Fact label="Portée européenne">{ad.euTotalReach === null ? "Inconnue" : `≈ ${ad.euTotalReach.toLocaleString("fr-FR")} personnes`}</Fact>
              <Fact label="Plateformes">{platformsLabel(ad.platforms, 6) ?? "Non précisées"}</Fact>
              <Fact label="Audience">{audienceLabel(ad) ?? "Non précisée"}</Fact>
              <Fact label="Zones">{zonesLabel(ad) ?? "Non précisées"}</Fact>
              <Fact label="Signal">{SIGNAL_LABELS[ad.signal].short}</Fact>
              <Fact label="Note">
                <span className="tabular-nums">{adNote(ad.score)}/10</span>
              </Fact>
              <Fact label="Rang">{rankLabel(ad) ?? "—"}</Fact>
              <Fact label="Format">{format === "sans" ? VISUAL_STATE_LABELS[visual === "ready" ? "none" : visual] : `${META_AD_MEDIA_FORMAT_LABELS[format]}${media && media.items.length > 1 ? ` · ${media.items.length} ${media.variants ? "déclinaisons" : "diapositives"}` : ""}`}</Fact>
              {savedAt ? <Fact label="Dans votre bibliothèque">Gardée le {formatAdDate(savedAt) ?? "—"}</Fact> : null}
            </dl>
          </div>
        </div>

        <div className="border-t border-cream-200 bg-white px-5 py-3.5 md:col-start-2 md:px-6">
          {error ? (
            <p role="alert" className="mb-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {/* Mobile : le geste principal sur toute la largeur, puis « Supprimer » et le lien Meta sur une ligne */}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && mode === "veille" ? (
              <>
                <button
                  type="button"
                  data-testid="meta-keep"
                  aria-pressed={ad.kept}
                  onClick={ad.kept ? onUnkeep : onKeep}
                  title={ad.kept ? "Retirer de ma bibliothèque" : "Conserver l'annonce, son analyse et ses visuels dans ma bibliothèque"}
                  className={clsx(ACTION, FOCUS_RING, "basis-full whitespace-nowrap sm:basis-auto", ad.kept ? "bg-primary-600 text-white hover:bg-primary-700" : "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200 hover:bg-primary-100")}
                >
                  <Icon name="bookmark" filled={ad.kept} className="h-4 w-4 shrink-0" />
                  {ad.kept ? "Gardée" : "Garder comme exemple"}
                </button>
                <button type="button" data-testid="meta-dismiss" onClick={onDismiss} className={clsx(ACTION, FOCUS_RING, "text-ink-700 ring-1 ring-inset ring-cream-300 hover:bg-danger-100 hover:text-danger-500 hover:ring-danger-500/30")}>
                  <Icon name="trash" className="h-4 w-4 shrink-0" />
                  Supprimer
                </button>
              </>
            ) : null}
            {canEdit && mode === "bibliotheque" ? (
              <button type="button" data-testid="meta-unkeep" onClick={onRemove} className={clsx(ACTION, FOCUS_RING, "basis-full whitespace-nowrap text-ink-700 ring-1 ring-inset ring-cream-300 hover:bg-danger-100 hover:text-danger-500 hover:ring-danger-500/30 sm:basis-auto")}>
                <Icon name="bookmark" className="h-4 w-4 shrink-0" />
                Retirer de ma bibliothèque
              </button>
            ) : null}
            <a
              href={ad.libraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx("ml-auto inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-1.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50", FOCUS_RING)}
            >
              Voir sur Meta ↗<span className="sr-only"> (nouvel onglet)</span>
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className={clsx("absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-md ring-1 ring-ink-900/5 backdrop-blur-sm transition-colors hover:bg-cream-100 hover:text-ink-900", FOCUS_RING)}
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, strong = false, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={clsx("break-words text-sm", strong ? "font-semibold text-ink-900" : "text-ink-700")}>{children}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink-900">{children}</dd>
    </div>
  );
}
