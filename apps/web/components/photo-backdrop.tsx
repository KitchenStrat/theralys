import Image, { type StaticImageData } from "next/image";
import clsx from "clsx";

/*
 * Photo en fond d'une section : plein cadre, sous un voile qui garde le texte
 * lisible, avec une parallaxe très douce au défilement. Décorative : le texte
 * de la section porte le sens.
 *
 * La section doit être `relative overflow-hidden`, et son contenu positionné
 * (`relative`) pour passer devant. Les photos viennent de banques d'images
 * (provenance dans le README de la vitrine).
 */
export function PhotoBackdrop({
  src,
  veil,
  position = "50% 50%",
  className,
}: {
  src: StaticImageData;
  /** Classes du voile posé sur la photo (couleur et opacité) */
  veil: string;
  /** Point de la photo à garder dans le cadre quand il est rogné */
  position?: string;
  className?: string;
}) {
  return (
    <div aria-hidden className={clsx("absolute inset-0 overflow-hidden", className)}>
      {/* La photo dépasse du cadre en haut et en bas : la parallaxe ne découvre jamais de bord */}
      <div data-parallax="0.05" className="absolute inset-x-0 -inset-y-[12%]">
        <Image src={src} alt="" fill sizes="100vw" placeholder="blur" className="object-cover" style={{ objectPosition: position }} />
      </div>
      <div className={clsx("absolute inset-0", veil)} />
    </div>
  );
}
