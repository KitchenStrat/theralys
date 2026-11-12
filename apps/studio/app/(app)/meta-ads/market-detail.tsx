"use client";

import { clsx } from "clsx";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Modal } from "@theralys/ui";
import { META_AD_MEDIA_FORMAT_LABELS, adNote, type MetaGalleryAd } from "@theralys/shared";
import { SIGNAL_LABELS, VISUAL_STATE_LABELS, adDiffusion, adMainText, audienceLabel, formatAdDate, galleryFormatOf, httpUrl, platformsLabel, rankLabel, zonesLabel } from "@/lib/meta-ads/market-view";
import type { GalleryMode } from "./market-card";
import { FOCUS_RING, Icon } from "./market-icons";
import { PageAvatar, RankChip, SignalBadge, ZoneChip } from "./market-media";
import { MediaViewer } from "./market-viewer";
import { TEXT_LINK } from "./parts";
import { useVisualState } from "./use-visuals-loader";

/** Geste de la fiche : pilule de 44 px, pression du design system. */
const ACTION = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ds-press";
const ACTION_DANGER = "text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-danger-100 hover:text-ds-danger-900 hover:inset-ring-ds-danger-600/40";

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

          <div className="px-5 pt-5 pb-6 md:min-h-0 md:overflow-y-auto md:px-6 md:pt-6">
            <header className="flex items-center gap-3 pr-12">
              <PageAvatar name={ad.pageName} url={media?.avatarUrl} seed={ad.pageId ?? ad.pageName} className="size-11 text-ds-body" />
              <div className="min-w-0">
                <h2 className="font-ds-display text-xl/7 font-bold text-ds-ink-900">{ad.pageName}</h2>
                {about.length > 0 ? <p className="mt-0.5 text-ds-meta text-ds-ink-600">{about.join(" · ")}</p> : null}
              </div>
            </header>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <SignalBadge ad={ad} />
              <ZoneChip ad={ad} />
              <RankChip ad={ad} />
            </div>

            <h3 className="mt-5 text-ds-body font-semibold text-ds-ink-900">Texte de l&apos;annonce</h3>
            {body ? (
              <p className="mt-1.5 text-base break-words whitespace-pre-line text-ds-ink-700">{body}</p>
            ) : (
              <p className="mt-1.5 text-base text-ds-ink-600 italic">Annonce sans texte (visuel seul).</p>
            )}
            {others.length > 0 ? (
              <details className="mt-2 text-ds-body text-ds-ink-700">
                <summary className={clsx("py-1.5", TEXT_LINK)}>
                  {others.length > 1 ? `${others.length} autres versions du texte` : "Une autre version du texte"}
                </summary>
                <ul className="mt-2 space-y-2">
                  {others.map((text, i) => (
                    <li key={`${i}-${text.slice(0, 24)}`} className="rounded-ds-sm bg-ds-ink-50 px-3 py-2 break-words whitespace-pre-line inset-ring inset-ring-ds-ink-200">
                      {text}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {title || description || caption || media?.ctaText || landing ? (
              <div className="mt-4 rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70">
                <dl className="space-y-2.5">
                  {title ? <Row label="Titre du lien" strong>{title}</Row> : null}
                  {description ? <Row label="Description">{description}</Row> : null}
                  {caption ? <Row label="Lien affiché">{caption}</Row> : null}
                  {media?.ctaText ? (
                    <Row label="Bouton">
                      <span className="inline-flex rounded-lg bg-white px-2.5 py-1 text-ds-meta font-semibold text-ds-ink-900 inset-ring inset-ring-ds-ink-300">{media.ctaText}</span>
                    </Row>
                  ) : null}
                </dl>
                {landing ? (
                  <a href={landing} target="_blank" rel="noopener noreferrer nofollow" className={clsx("mt-3 inline-flex min-h-9 items-center gap-1.5 text-ds-body", TEXT_LINK)}>
                    Voir la page de destination
                    <Icon name="external" className="size-4" />
                    <span className="sr-only"> (nouvel onglet)</span>
                  </a>
                ) : null}
              </div>
            ) : null}

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
              <Fact label="Diffusion">
                <span className="flex items-start gap-1.5">
                  <span aria-hidden className={clsx("mt-2 size-2 shrink-0 rounded-full", diffusion.state === "active" ? "bg-ds-success-600 ring-3 ring-ds-success-600/20" : "bg-ds-ink-300")} />
                  {diffusion.long}
                </span>
              </Fact>
              <Fact label="Lancée le">{formatAdDate(ad.startedAt) ?? "Date inconnue"}</Fact>
              {/* Seul chiffre de portée que Meta publie (comptes touchés dans l'Union européenne) : pour une annonce locale, ce sont les personnes de sa zone */}
              <Fact label="Personnes touchées">
                {ad.euTotalReach === null ? (
                  "Non communiqué"
                ) : (
                  <>
                    ≈ {ad.euTotalReach.toLocaleString("fr-FR")} <span className="font-normal text-ds-ink-600">depuis son lancement</span>
                  </>
                )}
              </Fact>
              <Fact label="Plateformes">{platformsLabel(ad.platforms, 6) ?? "Non précisées"}</Fact>
              <Fact label="Audience">{audienceLabel(ad) ?? "Non précisée"}</Fact>
              <Fact label="Zones">{zonesLabel(ad) ?? "Non précisées"}</Fact>
              <Fact label="Signal">{SIGNAL_LABELS[ad.signal].short}</Fact>
              <Fact label="Note">
                <span className="ds-tnum">{adNote(ad.score)}/10</span>
              </Fact>
              <Fact label="Rang">{rankLabel(ad) ?? "—"}</Fact>
              <Fact label="Format">{format === "sans" ? VISUAL_STATE_LABELS[visual === "ready" ? "none" : visual] : `${META_AD_MEDIA_FORMAT_LABELS[format]}${media && media.items.length > 1 ? ` · ${media.items.length} ${media.variants ? "déclinaisons" : "diapositives"}` : ""}`}</Fact>
              {savedAt ? <Fact label="Dans votre bibliothèque">Gardée le {formatAdDate(savedAt) ?? "—"}</Fact> : null}
            </dl>
          </div>
        </div>

        <div className="border-t border-ds-ink-200 bg-white px-5 py-3.5 md:col-start-2">
          {error ? (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-ds-sm bg-ds-danger-100 px-3 py-2 text-ds-body text-ds-danger-900">
              <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
          {/* Mobile : le geste principal sur toute la largeur, puis « Supprimer » et le lien Meta sur une ligne ; grand écran : les trois sur une seule ligne */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {canEdit && mode === "veille" ? (
              <>
                <button
                  type="button"
                  data-testid="meta-keep"
                  aria-pressed={ad.kept}
                  onClick={ad.kept ? onUnkeep : onKeep}
                  title={ad.kept ? "Retirer de ma bibliothèque" : "Conserver l'annonce, son analyse et ses visuels dans ma bibliothèque"}
                  className={clsx(
                    ACTION,
                    FOCUS_RING,
                    "basis-full whitespace-nowrap sm:basis-auto",
                    ad.kept ? "bg-ds-section-gradient-deep text-ds-section-on-deep" : "bg-ds-section-tint-2 text-ds-section-ink inset-ring inset-ring-ds-section-line hover:bg-ds-section-line",
                  )}
                >
                  <Icon name="bookmark" filled={ad.kept} className="size-4 shrink-0" />
                  {ad.kept ? "Gardée" : "Garder comme exemple"}
                </button>
                <button type="button" data-testid="meta-dismiss" onClick={onDismiss} className={clsx(ACTION, FOCUS_RING, ACTION_DANGER)}>
                  <Icon name="trash" className="size-4 shrink-0" />
                  Supprimer
                </button>
              </>
            ) : null}
            {canEdit && mode === "bibliotheque" ? (
              <button type="button" data-testid="meta-unkeep" onClick={onRemove} className={clsx(ACTION, FOCUS_RING, ACTION_DANGER, "basis-full whitespace-nowrap sm:basis-auto")}>
                <Icon name="bookmark" className="size-4 shrink-0" />
                Retirer de ma bibliothèque
              </button>
            ) : null}
            <a
              href={ad.libraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx("-mr-1.5 ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-1.5 text-sm font-semibold whitespace-nowrap text-ds-brand-800 hover:bg-ds-brand-100", FOCUS_RING)}
            >
              Voir sur Meta
              <Icon name="external" className="size-4" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className={clsx("absolute top-3 right-3 grid size-11 cursor-pointer place-items-center rounded-full bg-white text-ds-ink-700 shadow-ds-card ring-1 ring-ds-ink-900/5 hover:text-ds-ink-900", FOCUS_RING)}
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, strong = false, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-ds-meta text-ds-ink-600">{label}</dt>
      <dd className={clsx("text-ds-body break-words", strong ? "font-semibold text-ds-ink-900" : "text-ds-ink-700")}>{children}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ds-meta text-ds-ink-600">{label}</dt>
      <dd className="mt-0.5 text-ds-body font-medium break-words text-ds-ink-900">{children}</dd>
    </div>
  );
}
