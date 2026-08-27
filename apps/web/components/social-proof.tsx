"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/*
 * Toast de preuve sociale : de courts avis apparaissent en bas à gauche,
 * restent quelques secondes, puis laissent place au suivant. Fermable
 * d'un clic, absent sur mobile et si l'utilisateur réduit les animations.
 */
const NOTES = [
  {
    name: "Camille P.",
    role: "Sophrologue",
    title: "Attentes dépassées",
    text: "Résultat professionnel et moderne, interface très simple à prendre en main.",
    photo: "/avatars/therapist-3.jpg",
  },
  {
    name: "Julien R.",
    role: "Ostéopathe",
    title: "Je recommande",
    text: "Fonctionnel et intuitif, un vrai plus pour la prise de rendez-vous.",
    photo: "/avatars/therapist-9.jpg",
  },
  {
    name: "Sophie D.",
    role: "Naturopathe",
    title: "Un vrai gain de temps",
    text: "Le blog se remplit tout seul et mes patients me trouvent sur Google.",
    photo: "/avatars/logo-cabinet-2.svg",
  },
  {
    name: "Claire B.",
    role: "Hypnothérapeute",
    title: "Très pro",
    text: "Démo reçue en quelques jours, site en ligne la semaine suivante.",
    photo: "/avatars/therapist-5.jpg",
  },
];

const FIRST_DELAY = 4000;
const VISIBLE_FOR = 6500;
const HIDDEN_FOR = 7000;
const LEAVE_ANIM = 450;

export function SocialProof() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "shown" | "leaving">("idle");
  const [closed, setClosed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (phase === "idle") {
      // N'apparaît qu'une fois le hero défilé : sa rangée d'avis reste dégagée
      const arm = () => {
        timer.current = setTimeout(() => setPhase("shown"), FIRST_DELAY);
      };
      if (window.scrollY > 400) {
        arm();
      } else {
        const onScroll = () => {
          if (window.scrollY > 400) {
            window.removeEventListener("scroll", onScroll);
            arm();
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
          window.removeEventListener("scroll", onScroll);
          if (timer.current) clearTimeout(timer.current);
        };
      }
    } else if (phase === "shown") {
      timer.current = setTimeout(() => setPhase("leaving"), VISIBLE_FOR);
    } else {
      timer.current = setTimeout(() => {
        setIndex((i) => (i + 1) % NOTES.length);
        setPhase("shown");
      }, LEAVE_ANIM + HIDDEN_FOR);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phase, closed]);

  if (closed || phase === "idle") return null;
  const note = NOTES[index];
  if (!note) return null;

  return (
    <div
      inert={phase === "leaving"}
      className={clsx(
        "fixed bottom-5 left-5 z-40 hidden w-72 rounded-2xl border border-cream-200 bg-white p-4 shadow-[var(--shadow-pop)] md:block",
        phase === "shown" ? "toast-in" : "toast-out pointer-events-none",
      )}
    >
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="Masquer les avis"
        className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-ink-300 transition hover:bg-cream-100 hover:text-ink-700"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="m2 2 8 8M10 2l-8 8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex items-center gap-2.5">
        <img src={note.photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">
            {note.name} <span className="font-normal text-ink-500">· {note.role}</span>
          </p>
          <p className="text-xs tracking-wider text-gold-400">★★★★★</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink-900">{note.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{note.text}</p>
    </div>
  );
}
