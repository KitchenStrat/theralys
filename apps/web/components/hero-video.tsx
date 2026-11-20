"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import poster from "@/assets/photos/hero-poster.jpg";

/*
 * Fond vidéo du haut de page : des praticiens au travail, en lumière
 * naturelle (deux plans de banque d'images montés en boucle, sans coupure).
 *
 * - La première image s'affiche d'emblée (optimisée, prioritaire) ; la vidéo
 *   se charge ensuite et la remplace en fondu. La page n'attend jamais la vidéo.
 * - Version 720p sur téléphone, 1080p au-delà.
 * - Pas de vidéo si le visiteur demande un mouvement réduit ou économise ses
 *   données : l'image fixe reste.
 * - Elle s'arrête quand elle sort de l'écran, et un bouton permet de la mettre
 *   en pause.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(true);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.muted = true;
    video.src = window.matchMedia("(max-width: 767px)").matches ? "/media/hero-720.mp4" : "/media/hero-1080.mp4";
    setEnabled(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry?.isIntersecting ?? true;
        if (visible.current && !video.dataset.paused) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.05 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (paused) {
      delete video.dataset.paused;
      if (visible.current) void video.play().catch(() => {});
    } else {
      video.dataset.paused = "1";
      video.pause();
    }
    setPaused(!paused);
  };

  return (
    <>
      <div aria-hidden className="absolute inset-0">
        <Image src={poster} alt="" fill priority sizes="100vw" placeholder="blur" className="object-cover" />
        <video
          ref={ref}
          loop
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          disablePictureInPicture
          onPlaying={() => setPlaying(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${playing ? "opacity-100" : "opacity-0"}`}
        />
        {/* Voile brun très sombre plutôt que bleu : la lumière chaude de l'image est conservée, et le titre blanc reste lisible partout */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(22_17_13/0.7)_0%,rgb(22_17_13/0.5)_38%,rgb(22_17_13/0.56)_70%,rgb(22_17_13/0.74)_100%)]" />
      </div>
      {enabled ? (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={paused}
          className="focus-ring-dark absolute right-4 bottom-[calc(var(--hero-overlap)+1rem)] z-10 grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 md:right-6"
        >
          <span className="sr-only">{paused ? "Relancer la vidéo de fond" : "Mettre la vidéo de fond en pause"}</span>
          {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
        </button>
      ) : null}
    </>
  );
}
