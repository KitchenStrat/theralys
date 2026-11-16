import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Cadres des captures d'écran du studio. Les images sont de vrais écrans
 * (compte de démonstration), servies par `next/image` : largeur adaptée à
 * l'écran, AVIF ou WebP, et un aperçu flou le temps du chargement.
 */

/** Fenêtre de navigateur : la barre d'adresse situe la capture dans l'espace client. */
export function BrowserFrame({
  url = "app.harmony-web.fr",
  children,
  className,
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_40px_90px_-40px_rgb(12_74_110/0.45)]",
        className,
      )}
    >
      <div aria-hidden className="flex items-center gap-2 border-b border-cream-200 bg-cream-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#fca5a5]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#fcd34d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#86efac]" />
        <span className="ml-3 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink-500">
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-success-500" fill="currentColor">
            <path d="M6 1a3 3 0 0 0-3 3v1H2.5A1.5 1.5 0 0 0 1 6.5v3A1.5 1.5 0 0 0 2.5 11h7A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5H9V4a3 3 0 0 0-3-3Zm2 4H4V4a2 2 0 1 1 4 0v1Z" />
          </svg>
          <span className="truncate">{url}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

/** Téléphone : un contour sobre autour d'une capture de l'application sur mobile. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-[2.2rem] border border-night-700/20 bg-night-900 p-[7px] shadow-[0_36px_70px_-30px_rgb(7_21_34/0.65)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-white">{children}</div>
    </div>
  );
}

/** Capture d'écran : toujours décrite, jamais plus large que son cadre. */
export function Capture({
  src,
  alt,
  sizes,
  priority = false,
  eager = false,
  className,
}: {
  src: StaticImageData;
  alt: string;
  /** Largeur affichée selon l'écran : `next/image` choisit le fichier le plus proche */
  sizes: string;
  /** Image du premier écran : préchargée */
  priority?: boolean;
  /** Chargée sans attendre le défilement, sans préchargement */
  eager?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      sizes={sizes}
      placeholder="blur"
      priority={priority}
      loading={priority ? undefined : eager ? "eager" : "lazy"}
      className={clsx("block h-auto w-full", className)}
    />
  );
}
