import type { StaticImageData } from "next/image";
import { Bookmark, Ellipsis, Heart, MessageCircle, Send } from "lucide-react";
import clsx from "clsx";
import { Capture } from "./frames";

/**
 * Aperçu d'une publication telle qu'elle paraîtra sur le fil d'un réseau
 * social : le compte du cabinet, le visuel préparé par Harmony, sa légende et
 * ses mots-dièse. Le visuel est une vraie image produite par le studio ; le
 * compte est celui du cabinet de démonstration.
 *
 * Aucun compteur de mentions « J'aime » ni de commentaires : l'aperçu montre
 * une publication prête à poster, pas un succès inventé.
 *
 * Pour les lecteurs d'écran, l'ensemble est une seule image décrite par
 * `label` ; le détail de l'aperçu ne leur est pas lu ligne à ligne.
 */
export function PostMock({
  image,
  account,
  place,
  initials,
  caption,
  hashtags,
  pages,
  label,
  className,
}: {
  image: StaticImageData;
  /** Nom du compte, tel qu'il s'affiche au-dessus de la publication */
  account: string;
  place: string;
  initials: string;
  caption: string;
  hashtags: string[];
  /** Nombre de pages du carrousel ; au-delà de 1, la pastille « 1/n » et les points s'affichent */
  pages: number;
  /** Description de l'aperçu pour les lecteurs d'écran */
  label: string;
  className?: string;
}) {
  return (
    <figure
      role="img"
      aria-label={label}
      className={clsx(
        "relative rounded-2xl border border-cream-200 bg-white shadow-[0_34px_70px_-28px_rgb(7_21_34/0.6)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute -top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-success-600 px-2.5 py-1 text-xs font-bold text-white shadow-md"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        Prêt à poster
      </span>

      <div aria-hidden className="overflow-hidden rounded-2xl">
        {/* Le compte */}
        <div className="flex items-center gap-2 px-3 pt-3.5 pb-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5b4a8a] to-[#8a5f97] text-[11px] font-bold text-white ring-2 ring-white outline outline-1 outline-[#d9c8e6]">
            {initials}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-ink-900">{account}</span>
            <span className="block truncate text-[11px] text-ink-500">{place}</span>
          </span>
          <Ellipsis size={18} className="ml-auto shrink-0 text-ink-500" />
        </div>

        {/* Le visuel préparé par Harmony */}
        <div className="relative">
          <Capture src={image} alt="" sizes="(min-width: 1280px) 256px, 224px" />
          {pages > 1 ? (
            <span className="absolute top-2 right-2 rounded-full bg-night-900/75 px-2 py-0.5 text-[11px] font-semibold text-white">
              1/{pages}
            </span>
          ) : null}
        </div>

        {/* Les gestes du fil, sans compteur */}
        <div className="flex items-center gap-3 px-3 pt-2.5 text-ink-900">
          <Heart size={19} strokeWidth={1.9} />
          <MessageCircle size={19} strokeWidth={1.9} />
          <Send size={19} strokeWidth={1.9} />
          {pages > 1 ? (
            <span className="mx-auto flex items-center gap-1 pr-6">
              {Array.from({ length: Math.min(pages, 5) }, (_, index) => (
                <span key={index} className={clsx("h-1.5 w-1.5 rounded-full", index === 0 ? "bg-primary-600" : "bg-ink-300")} />
              ))}
            </span>
          ) : null}
          <Bookmark size={19} strokeWidth={1.9} className="ml-auto" />
        </div>

        {/* La légende et ses mots-dièse */}
        <figcaption className="px-3 pt-2 pb-3.5 text-[12.5px] leading-snug text-ink-900">
          <span className="font-semibold">{account}</span> {caption}
          <span className="mt-1 block text-primary-700">{hashtags.map((tag) => `#${tag}`).join(" ")}</span>
        </figcaption>
      </div>
    </figure>
  );
}
