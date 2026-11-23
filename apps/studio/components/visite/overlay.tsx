"use client";

import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Check, Compass, Info } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@theralys/ui";
import { Button } from "@/components/ds/button";
import { frenchSpacing, holeRect, placeCard, type Rect, type ResolvedStep } from "@/lib/visite/engine";
import type { TourDefinition } from "@/lib/visite/tours";
import { bringIntoView, findTarget, rectOf } from "./dom";

type Layout = {
  /** Découpe autour de la cible ; `null` : carte centrée, voile uni */
  hole: Rect | null;
  top: number;
  left: number;
};

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type TourOverlayProps = {
  definition: TourDefinition;
  steps: readonly ResolvedStep[];
  index: number;
  /** Fenêtre de bienvenue (avant la première étape) */
  intro: boolean;
  firstName?: string;
  onNext: () => void;
  onPrevious: () => void;
  /** Passer, Échap, « Plus tard » */
  onClose: () => void;
};

/**
 * La visite à l'écran : un voile, une découpe autour de l'élément montré, et
 * une carte posée à côté (une feuille pleine largeur sur téléphone). La carte
 * est une boîte de dialogue : le focus y est retenu puis rendu à l'élément
 * d'origine, Échap la ferme, les flèches passent d'une étape à l'autre, chaque
 * étape est annoncée. Rien de la page n'est cliquable pendant la visite.
 *
 * Mouvement : la découpe change de place sans transition, seul le contenu de la
 * carte arrive en fondu (aucun déplacement animé, rien en mouvement réduit).
 */
export function TourOverlay({ definition, steps, index, intro, firstName, onNext, onPrevious, onClose }: TourOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const step = steps[index];
  const selector = intro ? null : (step?.selector ?? null);
  const count = steps.length;
  const last = index === count - 1;
  const stepKey = intro ? "bienvenue" : (step?.id ?? "fin");

  useDialogFocus(true, cardRef);

  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const target = selector ? findTarget(selector) : null;
    const hole = target ? holeRect(rectOf(target), viewport) : null;
    const place = placeCard({ target: hole, viewport, card: { width: card.offsetWidth, height: card.offsetHeight } });
    setLayout((current) =>
      current &&
      current.top === place.top &&
      current.left === place.left &&
      current.hole?.top === hole?.top &&
      current.hole?.left === hole?.left &&
      current.hole?.width === hole?.width &&
      current.hole?.height === hole?.height
        ? current
        : { hole, top: place.top, left: place.left },
    );
  }, [selector]);

  // À chaque étape : la cible vient à l'écran, puis la carte se place (au rendu suivant, une fois le défilement fait)
  useIsomorphicLayoutEffect(() => {
    const target = selector ? findTarget(selector) : null;
    // La carte porte déjà le texte de l'étape : sa hauteur dit la place à lui réserver (écart et marge compris)
    if (target) bringIntoView(target, (cardRef.current?.offsetHeight ?? 0) + 26);
    measure();
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [measure, selector, stepKey]);

  // La découpe suit sa cible : défilement, rotation de l'écran, carte qui change de hauteur, page qui bouge encore
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (observer && cardRef.current) observer.observe(cardRef.current);
    const target = selector ? findTarget(selector) : null;
    if (observer && target) observer.observe(target);
    // Les entrées en cascade de la page finissent en moins d'une demi-seconde
    const settle = window.setTimeout(schedule, 520);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      observer?.disconnect();
    };
  }, [measure, selector]);

  // Le bouton principal reçoit le focus à chaque étape : Entrée fait avancer
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [stepKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft" && !intro) {
        event.preventDefault();
        onPrevious();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [intro, onClose, onNext, onPrevious]);

  if (!intro && !step) return null;

  const introCopy = definition.intro;
  const title = frenchSpacing(intro && introCopy ? (firstName ? `${introCopy.title}, ${firstName}` : introCopy.title) : (step?.title ?? ""));
  const body = frenchSpacing(intro && introCopy ? introCopy.body : (step?.body ?? ""));
  const note = !intro && step?.note ? frenchSpacing(step.note) : null;
  const announcement = intro ? "" : `Étape ${index + 1} sur ${count}. ${title}. ${body}${note ? ` ${note}` : ""}`;

  return createPortal(
    <div className="ds-scope" data-ds-section={definition.section} data-tour-overlay={definition.id}>
      {/* Écran : la page n'est ni cliquable ni défilable au doigt pendant la visite */}
      <div className="ds-tour-shield" aria-hidden />
      {layout?.hole ? (
        <div
          aria-hidden
          className="ds-tour-hole"
          style={{ top: layout.hole.top, left: layout.hole.left, width: layout.hole.width, height: layout.hole.height }}
        />
      ) : (
        <div aria-hidden className="ds-tour-veil" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-testid="tour-card"
        data-step={stepKey}
        className="ds-tour-card"
        // Avant la première mesure la carte est transparente, pas masquée : un élément masqué ne peut pas recevoir le focus
        style={layout ? { top: layout.top, left: layout.left } : { top: 0, left: 0, opacity: 0, pointerEvents: "none" }}
      >
        {/* `key` : le contenu de chaque étape arrive en fondu ; la carte elle-même reste en place */}
        <div key={stepKey} className="p-5 ds-fade-in sm:p-6">
          {intro ? (
            <span aria-hidden className="mb-4 grid size-12 place-items-center rounded-ds-md bg-ds-section-gradient text-ds-section-on shadow-ds-glow">
              <Compass size={24} strokeWidth={2} />
            </span>
          ) : (
            <p className="text-ds-meta font-semibold text-ds-section-accent">
              Étape {index + 1} sur {count}
            </p>
          )}
          <h2 id={titleId} className={clsx("font-ds-voice text-ds-ink-900 text-balance", intro ? "text-2xl/8" : "mt-1.5 text-xl/7")}>
            {title}
          </h2>
          <div id={bodyId}>
            <p className="mt-2 text-base text-ds-ink-700 text-pretty">{body}</p>
            {note ? (
              <p className="mt-2.5 flex items-start gap-2 text-ds-meta text-ds-ink-600">
                <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
                <span>{note}</span>
              </p>
            ) : null}
          </div>

          {intro ? null : (
            // Progression : un segment par étape, celles déjà vues remplies
            <ol aria-hidden className="mt-4 flex gap-1.5">
              {steps.map((entry, position) => (
                <li
                  key={entry.id}
                  className={clsx("h-1.5 flex-1 rounded-full", position <= index ? "bg-ds-section-gradient" : "bg-ds-section-tint-2")}
                />
              ))}
            </ol>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            {intro && introCopy ? (
              <>
                <Button type="button" variant="quiet" size="sm" onClick={onClose} data-testid="tour-later">
                  {introCopy.later}
                </Button>
                <Button ref={primaryRef} type="button" size="sm" onClick={onNext} iconRight={<ArrowRight size={16} aria-hidden />} data-testid="tour-start">
                  {introCopy.start}
                </Button>
              </>
            ) : (
              <>
                {last ? (
                  <span />
                ) : (
                  <Button type="button" variant="quiet" size="sm" onClick={onClose} data-testid="tour-skip">
                    Passer
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  {index > 0 ? (
                    <Button type="button" variant="secondary" size="sm" onClick={onPrevious} icon={<ArrowLeft size={16} aria-hidden />} data-testid="tour-previous">
                      Précédent
                    </Button>
                  ) : null}
                  <Button
                    ref={primaryRef}
                    type="button"
                    size="sm"
                    onClick={onNext}
                    iconRight={last ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}
                    data-testid="tour-next"
                  >
                    {last ? "Terminer" : "Suivant"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chaque étape est annoncée ; la fenêtre de bienvenue l'est par son arrivée au focus */}
      <p className="sr-only" aria-live="polite" data-testid="tour-live">
        {announcement}
      </p>
    </div>,
    document.body,
  );
}
