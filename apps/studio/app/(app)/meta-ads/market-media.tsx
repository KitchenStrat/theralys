"use client";

import { clsx } from "clsx";
import { Signal, SignalHigh, SignalLow, SignalMedium, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Spinner, type BadgeTone } from "@/components/ds";
import { META_MARKET_SCOPE_LABELS, adIsTrending, metaMediaBadge, type MetaAdMedia, type MetaGalleryAd, type MetaMarketSignal } from "@theralys/shared";
import { SIGNAL_LABELS, VISUAL_STATE_LABELS, pageInitials, posterTone, rankLabel } from "@/lib/meta-ads/market-view";
import { Icon, type IconName } from "./market-icons";
import { useVisualState } from "./use-visuals-loader";

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
      className={clsx(className, "transition-opacity duration-ds-enter ease-ds-out motion-reduce:transition-none", state === "ok" ? "opacity-100" : "opacity-0")}
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
      className={clsx("flex h-full w-full flex-col justify-end text-left", large ? "p-8" : "px-4 pt-11 pb-12")}
      style={{
        color: tone.ink,
        background: `radial-gradient(110% 60% at 100% 0%, rgb(255 255 255 / 0.55), transparent 60%), linear-gradient(165deg, ${tone.from}, ${tone.to})`,
      }}
    >
      <span aria-hidden className={clsx("block font-serif leading-none opacity-30", large ? "text-7xl" : "text-[2.75rem]")}>
        «
      </span>
      <span className={clsx("mt-1 block font-ds-display leading-snug font-bold tracking-tight text-balance", large ? "line-clamp-[9] text-2xl" : "line-clamp-5 text-[17px]")}>
        {hook || "Annonce sans texte"}
      </span>
    </span>
  );
}

/** Avatar de la page ; sans image (ou si elle ne charge pas) : initiales sur une pastille teintée. */
export function PageAvatar({ name, url, seed, className = "size-7 text-xs" }: { name: string; url: string | null | undefined; seed: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const tone = posterTone(seed);
  return (
    <span
      aria-hidden
      className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-ds-ink-900/5 select-none", className)}
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

/**
 * Pastille de format posée sur le visuel : « Vidéo », « Carrousel 1/3 ».
 * Sans visuel affichable, elle dit pourquoi — en cours de chargement, pas
 * encore chargé, indisponible — et ne prête jamais un format à l'annonce.
 */
export function FormatBadge({ ad, className }: { ad: Pick<MetaGalleryAd, "id" | "media">; className?: string }) {
  const state = useVisualState(ad);
  const media = ad.media;
  return (
    // Fond d'encre presque opaque : le blanc reste lisible quel que soit le visuel dessous
    <span data-visual={state} className={clsx("inline-flex items-center gap-1.5 rounded-full bg-ds-ink-900/85 px-2.5 py-1 text-xs leading-none font-medium text-white", className)}>
      {state === "ready" && media ? (
        <>
          <Icon name={FORMAT_ICONS[media.format]} className="size-3.5" />
          {metaMediaBadge(media)}
        </>
      ) : (
        <>
          {state === "loading" ? <Spinner className="size-3" /> : <Icon name="image" className="size-3.5" />}
          {VISUAL_STATE_LABELS[state === "ready" ? "none" : state]}
        </>
      )}
    </span>
  );
}

/** Signal d'une annonce : une teinte, une icône à trois niveaux et le mot — jamais la couleur seule. */
const SIGNALS: Record<MetaMarketSignal, { tone: BadgeTone; icon: LucideIcon }> = {
  fort: { tone: "success", icon: SignalHigh },
  moyen: { tone: "warning", icon: SignalMedium },
  faible: { tone: "neutral", icon: SignalLow },
};

/** « Tendance » (encore diffusée, signal fort), sinon le signal de l'annonce. */
export function SignalBadge({ ad }: { ad: Pick<MetaGalleryAd, "active" | "signal"> }) {
  if (adIsTrending(ad)) {
    // Mise en avant, pas un statut : l'accent chaud du design system
    return (
      <Badge tone="sun" icon={TrendingUp}>
        Tendance
      </Badge>
    );
  }
  const signal = SIGNALS[ad.signal] ?? { tone: "neutral" as const, icon: Signal };
  return (
    <Badge tone={signal.tone} icon={signal.icon}>
      {SIGNAL_LABELS[ad.signal].label}
    </Badge>
  );
}

/** Zone de l'annonce (« Autour de vous ») ; rien pour les annonces nationales ou d'autres zones. */
export function ZoneChip({ ad, overlay = false }: { ad: Pick<MetaGalleryAd, "scope">; overlay?: boolean }) {
  if (ad.scope === "france") return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full text-xs leading-none font-medium",
        overlay ? "bg-white px-2.5 py-1.5 text-ds-ink-900 shadow-ds-card" : "bg-ds-section-tint-2 px-2.5 py-1.5 text-ds-section-ink",
      )}
    >
      <Icon name="pin" className="size-3.5 text-ds-section-accent" />
      {META_MARKET_SCOPE_LABELS[ad.scope]}
    </span>
  );
}

/** « #25 /111 · top 23 % » ; rien sans rang (veille antérieure). */
export function RankChip({ ad }: { ad: Pick<MetaGalleryAd, "rank" | "rankTotal"> }) {
  const label = rankLabel(ad);
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-ds-ink-100 px-2 py-1 text-xs leading-none font-medium whitespace-nowrap text-ds-ink-700 ds-tnum" title="Rang par note parmi les annonces repérées">
      <span className="sr-only">Rang </span>
      {label}
    </span>
  );
}
