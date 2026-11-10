"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { META_MARKET_SCOPE_LABELS, adIsTrending, metaMediaBadge, type MetaAdMedia, type MetaGalleryAd } from "@theralys/shared";
import { SIGNAL_LABELS, pageInitials, posterTone, rankLabel } from "@/lib/meta-ads/market-view";
import { Icon, type IconName } from "./market-icons";

/**
 * Briques visuelles partagées par la carte et la fiche d'une annonce : image
 * avec repli, affiche typographique, avatar de page, pastilles (format,
 * tendance ou signal, zone, rang).
 */

type AdImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** Affiché à la place de l'image si elle ne charge pas */
  fallback: ReactNode;
};

/** Image d'une annonce : apparition en fondu, repli si elle ne charge pas. Remontée à chaque changement d'adresse. */
export function AdImage(props: AdImageProps) {
  return <AdImageInner key={props.src} {...props} />;
}

function AdImageInner({ src, alt, className, fallback }: AdImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  // Image déjà chargée, ou déjà en échec, avant l'hydratation : ses événements ne reviendront pas
  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    if (typeof img.decode !== "function") return setState("ok");
    img.decode().then(
      () => setState("ok"),
      () => setState("failed"),
    );
  }, []);

  if (state === "failed") return <>{fallback}</>;
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onLoad={() => setState("ok")}
      onError={() => setState("failed")}
      className={clsx(className, "transition-opacity duration-300 motion-reduce:transition-none", state === "ok" ? "opacity-100" : "opacity-0")}
    />
  );
}

/**
 * Affiche typographique d'une annonce sans visuel : son accroche sur un
 * dégradé doux, toujours le même pour une annonce donnée. En `span` : elle
 * vit dans le bouton du visuel.
 */
export function TextPoster({ adId, hook, large = false }: { adId: string; hook: string; large?: boolean }) {
  const tone = posterTone(adId);
  return (
    <span
      // Carte : marge basse pour la pastille de zone posée sur le visuel
      className={clsx("flex h-full w-full flex-col justify-end text-left", large ? "p-8" : "px-4 pb-12 pt-11")}
      style={{
        color: tone.ink,
        background: `radial-gradient(110% 60% at 100% 0%, rgb(255 255 255 / 0.55), transparent 60%), linear-gradient(165deg, ${tone.from}, ${tone.to})`,
      }}
    >
      <span aria-hidden className={clsx("block font-serif leading-none opacity-30", large ? "text-7xl" : "text-[2.75rem]")}>
        «
      </span>
      <span className={clsx("mt-1 block text-balance font-semibold leading-snug tracking-tight", large ? "line-clamp-[9] text-2xl" : "line-clamp-5 text-[17px]")}>
        {hook || "Annonce sans texte"}
      </span>
    </span>
  );
}

/** Avatar de la page ; sans image (ou si elle ne charge pas) : initiales sur une pastille teintée. */
export function PageAvatar({ name, url, seed, className = "h-7 w-7 text-[11px]" }: { name: string; url: string | null | undefined; seed: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const tone = posterTone(seed);
  return (
    <span
      aria-hidden
      className={clsx("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-ink-900/5", className)}
      style={{ background: `linear-gradient(140deg, ${tone.from}, ${tone.to})`, color: tone.ink }}
    >
      {pageInitials(name)}
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

const FORMAT_ICONS: Record<MetaAdMedia["format"], IconName> = { image: "image", video: "video", carousel: "carousel" };

/** Pastille de format posée sur le visuel : « Vidéo », « Carrousel 1/3 », ou « Texte » sans visuel. */
export function FormatBadge({ media, className }: { media: MetaAdMedia | null; className?: string }) {
  const known = media !== null && media.items.length > 0;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full bg-ink-900/70 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm", className)}>
      <Icon name={known ? FORMAT_ICONS[media.format] : "text"} className="h-3.5 w-3.5" />
      {known ? metaMediaBadge(media) : "Texte"}
    </span>
  );
}

/** Teintes des signaux : celles des pastilles du studio, texte assombri pour rester lisible en petit corps. */
const SIGNAL_TONES: Record<"success" | "warning" | "neutral", string> = {
  success: "bg-success-100 text-green-800",
  warning: "bg-warning-100 text-yellow-800",
  neutral: "bg-cream-200 text-ink-700",
};

/** « Tendance » (encore diffusée, signal fort), sinon le signal de l'annonce. */
export function SignalBadge({ ad }: { ad: Pick<MetaGalleryAd, "active" | "signal"> }) {
  if (adIsTrending(ad)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
        <Icon name="trend" className="h-3.5 w-3.5" />
        Tendance
      </span>
    );
  }
  const signal = SIGNAL_LABELS[ad.signal];
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", SIGNAL_TONES[signal.tone])}>{signal.label}</span>;
}

/** Zone de l'annonce (« Autour de vous ») ; rien pour les annonces nationales ou d'autres zones. */
export function ZoneChip({ ad, overlay = false }: { ad: Pick<MetaGalleryAd, "scope">; overlay?: boolean }) {
  if (ad.scope === "france") return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full text-[11px] font-medium leading-none",
        overlay ? "bg-white/90 px-2 py-1 text-ink-900 shadow-sm backdrop-blur-sm" : "bg-primary-50 px-2.5 py-1 text-primary-700 ring-1 ring-inset ring-primary-100",
      )}
    >
      <Icon name="pin" className="h-3.5 w-3.5 text-primary-600" />
      {META_MARKET_SCOPE_LABELS[ad.scope]}
    </span>
  );
}

/** « #25 /111 · top 23 % » ; rien sans rang (veille antérieure). */
export function RankChip({ ad }: { ad: Pick<MetaGalleryAd, "rank" | "rankTotal"> }) {
  const label = rankLabel(ad);
  if (!label) return null;
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-cream-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-700" title="Rang par note parmi les annonces repérées">
      <span className="sr-only">Rang </span>
      {label}
    </span>
  );
}
