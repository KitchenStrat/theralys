"use client";

import { MessageSquareHeart } from "lucide-react";
import { Button } from "../ds/button";
import { FEEDBACK_HOOK, FEEDBACK_PITCH, useFeedback } from "./provider";

/**
 * Bandeau « Votre avis » : la phrase d'appel et le bouton qui ouvre la
 * fenêtre. Ne rend rien quand l'espace n'est pas ouvert. Bouton secondaire :
 * la page garde son seul bouton principal.
 */
export function FeedbackBand() {
  const feedback = useFeedback();
  if (!feedback) return null;
  return (
    <section
      aria-labelledby="avis-bandeau-titre"
      data-ds-section="accueil"
      data-testid="avis-bandeau"
      className="relative isolate overflow-hidden rounded-ds-card border border-ds-ink-200 bg-ds-section-soft p-5 sm:p-6"
    >
      <span aria-hidden className="-z-10 ds-band-art" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-ds-md bg-ds-section-gradient text-ds-section-on shadow-ds-glow">
          <MessageSquareHeart size={24} />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="avis-bandeau-titre" className="font-ds-voice text-xl/7 font-bold text-ds-section-ink text-balance">
            {FEEDBACK_HOOK}
          </h2>
          <p className="mt-1 text-ds-body text-ds-ink-700">{FEEDBACK_PITCH}</p>
        </div>
        <Button variant="secondary" onClick={feedback.open} icon={<MessageSquareHeart size={18} aria-hidden />} data-testid="avis-ouvrir-bandeau">
          Donner mon avis
        </Button>
      </div>
    </section>
  );
}
