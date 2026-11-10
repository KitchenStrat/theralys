"use client";

import { clsx } from "clsx";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { metaMediaItemImage, type MetaAdMedia, type MetaAdMediaItem, type MetaGalleryAd } from "@theralys/shared";
import { adHook, metaVideoSrc } from "@/lib/meta-ads/market-view";
import { FOCUS_RING, Icon, PlayGlyph } from "./market-icons";
import { AdImage, TextPoster } from "./market-media";

/** L'attribut n'est pas typé sur `<video>` ; l'affiche et la redirection partent sans référent. */
const NO_REFERRER = { referrerPolicy: "no-referrer" } as const;

const NAV_BUTTON = clsx(
  "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 text-ink-900 shadow-md ring-1 ring-ink-900/5 backdrop-blur-sm transition hover:bg-white hover:shadow-lg motion-reduce:transition-none",
  FOCUS_RING,
);

/**
 * Visionneuse de la fiche d'une annonce : image, vidéo (lue par la route
 * `/api/meta-ads/media/…/video`) ou affiche typographique ; pour un carrousel
 * ou des déclinaisons, précédent / suivant, points, compteur et flèches du
 * clavier.
 */
export function MediaViewer({ ad, now }: { ad: MetaGalleryAd; now: Date }) {
  const media = ad.media;
  const items = media?.items ?? [];
  const count = items.length;
  const [position, setPosition] = useState(0);
  const index = count > 0 ? Math.min(position, count - 1) : 0;
  const item = items[index] ?? null;
  const unit = media?.variants ? "déclinaison" : "diapositive";
  const go = useCallback((delta: number) => setPosition((current) => (count > 0 ? (Math.min(current, count - 1) + delta + count) % count : 0)), [count]);

  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // Les flèches gardent leur rôle dans un champ et sur le lecteur vidéo (avance, recul)
      const target = event.target;
      if (target instanceof HTMLElement && ["VIDEO", "INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      go(event.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, go]);

  const image = item && media ? metaMediaItemImage(item, media, now) : null;
  const poster = <TextPoster adId={ad.id} hook={adHook(ad)} large />;
  const alt = `Visuel de l'annonce de ${ad.pageName}${count > 1 ? ` (${unit} ${index + 1} sur ${count})` : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream-100">
      <div className="relative aspect-[4/5] max-h-[62vh] w-full overflow-hidden md:aspect-auto md:max-h-none md:min-h-0 md:flex-1" aria-roledescription={count > 1 ? "carrousel" : undefined}>
        {image ? <img key={image} src={image} alt="" aria-hidden loading="lazy" decoding="async" referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl" /> : null}
        {item && media && item.kind === "video" ? (
          <VideoStage key={`${ad.id}-${index}`} adId={ad.id} index={index} item={item} media={media} image={image} alt={alt} libraryUrl={ad.libraryUrl} fallback={poster} />
        ) : image ? (
          <AdImage src={image} alt={alt} fallback={poster} className="relative h-full w-full object-contain" />
        ) : (
          poster
        )}

        {count > 1 ? (
          <>
            <span className="absolute left-3 top-3 rounded-full bg-ink-900/70 px-2.5 py-1 text-[11px] font-medium capitalize leading-none text-white backdrop-blur-sm" aria-live="polite">
              {unit} {index + 1}/{count}
            </span>
            <button type="button" data-testid="meta-detail-prev" onClick={() => go(-1)} aria-label={`${media?.variants ? "Déclinaison" : "Diapositive"} précédente`} className={clsx(NAV_BUTTON, "left-3")}>
              <Icon name="left" className="h-5 w-5" />
            </button>
            <button type="button" data-testid="meta-detail-next" onClick={() => go(1)} aria-label={`${media?.variants ? "Déclinaison" : "Diapositive"} suivante`} className={clsx(NAV_BUTTON, "right-3")}>
              <Icon name="right" className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-cream-200 bg-white/60 px-4 py-3">
          <div className="flex items-center gap-1" role="group" aria-label={media?.variants ? "Déclinaisons" : "Diapositives"}>
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPosition(i)}
                aria-label={`Afficher la ${unit} ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={clsx("flex h-6 w-6 cursor-pointer items-center justify-center rounded-full", FOCUS_RING)}
              >
                <span className={clsx("block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none", i === index ? "w-5 bg-primary-600" : "w-2 bg-ink-300 hover:bg-ink-500")} />
              </button>
            ))}
          </div>
          {media?.variants ? <p className="text-center text-xs text-ink-500">Meta choisit la déclinaison montrée à chaque personne.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Vidéo d'une annonce. Données de démonstration ou visuel sans fichier :
 * l'affiche seule, avec une note. Si la lecture échoue (fichier expiré,
 * quota), la note renvoie vers la bibliothèque de Meta.
 */
function VideoStage({
  adId,
  index,
  item,
  media,
  image,
  alt,
  libraryUrl,
  fallback,
}: {
  adId: string;
  index: number;
  item: MetaAdMediaItem;
  media: MetaAdMedia;
  image: string | null;
  alt: string;
  libraryUrl: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const demo = media.source === "mock";
  const playable = !demo && Boolean(item.sourceVideoUrl || item.videoUrl) && !failed;

  if (playable) {
    return (
      <video
        data-testid="meta-detail-video"
        data-state="lecteur"
        controls
        playsInline
        preload="none"
        poster={image ?? undefined}
        src={metaVideoSrc(adId, index)}
        onError={() => setFailed(true)}
        aria-label={alt.replace(/^Visuel/, "Vidéo")}
        className="relative h-full w-full bg-ink-900 object-contain"
        {...NO_REFERRER}
      />
    );
  }

  return (
    <div data-testid="meta-detail-video" data-state={demo ? "demonstration" : "indisponible"} className="relative h-full w-full">
      {image ? <AdImage src={image} alt={alt} fallback={fallback} className="relative h-full w-full object-contain" /> : fallback}
      <span aria-hidden className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 pl-0.5 text-ink-500 shadow-lg backdrop-blur-sm">
        <PlayGlyph className="h-6 w-6" />
      </span>
      <p className="absolute inset-x-3 bottom-3 rounded-xl bg-ink-900/80 px-3.5 py-2.5 text-center text-xs leading-relaxed text-white backdrop-blur-sm" role={demo ? undefined : "status"}>
        {demo ? (
          "Vidéo de démonstration (aucun fichier)."
        ) : (
          <>
            Vidéo indisponible pour le moment.{" "}
            <a href={libraryUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2 hover:no-underline">
              Voir sur Meta ↗<span className="sr-only"> (nouvel onglet)</span>
            </a>
          </>
        )}
      </p>
    </div>
  );
}
