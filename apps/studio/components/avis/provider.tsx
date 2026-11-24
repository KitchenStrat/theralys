"use client";

import { clsx } from "clsx";
import { Heart, Lightbulb, MessageSquareHeart, Puzzle, Send, Star, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { Modal, Select } from "@theralys/ui";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KIND_PROMPTS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_RATING_MAX,
  FEEDBACK_TOPICS,
  FEEDBACK_TOPIC_LABELS,
  feedbackTopicForPath,
  normalizeFeedbackMessage,
  type FeedbackKind,
  type FeedbackTopic,
} from "@theralys/shared";
import { sendFeedback } from "@/app/(app)/_avis/actions";
import { Button } from "../ds/button";

/** La phrase d'appel de l'espace « Votre avis », partout où il se présente. */
export const FEEDBACK_HOOK = "Harmony se construit avec vous.";
export const FEEDBACK_PITCH = "Une idée, un manque, un agacement ? Dites-le-nous en deux minutes : chaque avis arrive directement à l'équipe.";

export type FeedbackContextValue = {
  /** Ouvre la fenêtre « Votre avis » */
  open: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

/**
 * L'accès à la fenêtre « Votre avis » ; `null` quand l'espace n'est pas ouvert
 * (migration pas encore appliquée, session de l'équipe en mode support, pages
 * d'aperçu) : rien ne le propose alors.
 */
export function useFeedback(): FeedbackContextValue | null {
  return useContext(FeedbackContext);
}

const KIND_ICONS: Record<FeedbackKind, LucideIcon> = { idea: Lightbulb, problem: TriangleAlert, missing: Puzzle, praise: Heart };

const RATING_WORDS = ["Déçu", "Mitigé", "Correct", "Satisfait", "Conquis"] as const;

const TEXTAREA =
  "w-full rounded-xl border border-ink-300 bg-white px-3 py-2.5 text-ds-body text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 pointer-coarse:text-base";

type FormError = { field: "message" | "form"; message: string };

/**
 * Fournit « Votre avis » à tout l'espace client : l'entrée de la navigation,
 * le bandeau de l'accueil et la fenêtre elle-même. Ouvert à chaque praticien,
 * quelle que soit sa formule.
 */
export function FeedbackProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Chaque ouverture repart d'une fenêtre neuve, réglée sur l'outil de la page en cours
  const [session, setSession] = useState(0);
  const value = useMemo<FeedbackContextValue>(
    () => ({
      open: () => {
        setSession((current) => current + 1);
        setOpen(true);
      },
    }),
    [],
  );
  const close = useCallback(() => setOpen(false), []);

  if (!enabled) return <>{children}</>;
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Modal open={open} onClose={close} title="Votre avis sur Harmony" size="lg" plain>
        <FeedbackForm key={session} pathname={pathname} onClose={close} />
      </Modal>
    </FeedbackContext.Provider>
  );
}

function FeedbackForm({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [topic, setTopic] = useState<FeedbackTopic>(() => feedbackTopicForPath(pathname));
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [contactOk, setContactOk] = useState(true);
  const [error, setError] = useState<FormError | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, startSending] = useTransition();
  const ids = useId();
  const length = normalizeFeedbackMessage(message).length;
  const messageError = error?.field === "message" ? error.message : null;

  function submit() {
    setError(null);
    if (length < FEEDBACK_MESSAGE_MIN) {
      setError({ field: "message", message: "Encore quelques mots : racontez-nous la situation, c'est ce qui nous aide à améliorer Harmony." });
      return;
    }
    startSending(async () => {
      try {
        const result = await sendFeedback({ kind, topic, message, rating, contactOk, page: pathname });
        if (!result.ok) {
          setError({ field: result.field, message: result.error });
          return;
        }
        setSent(true);
      } catch {
        setError({ field: "form", message: "Votre avis n'a pas pu être envoyé — vérifiez votre connexion et réessayez." });
      }
    });
  }

  /** Un autre avis : la fenêtre repart de zéro ; seul le choix d'être recontacté, qui porte sur la personne, est gardé. */
  function another() {
    setKind("idea");
    setTopic(feedbackTopicForPath(pathname));
    setMessage("");
    setRating(null);
    setError(null);
    setSent(false);
  }

  return (
    <div data-ds-section="accueil" data-testid="avis-fenetre">
      <div className="relative isolate overflow-hidden bg-ds-section-soft px-5 py-5 sm:px-8 sm:py-6">
        <span aria-hidden className="-z-10 ds-band-art" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-full text-ds-ink-700 ds-focus hover:bg-white/70 sm:top-4 sm:right-4"
        >
          <X size={22} aria-hidden />
        </button>
        <div className="flex items-start gap-3.5 pr-10 sm:pr-8">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-ds-md bg-ds-section-gradient text-ds-section-on shadow-ds-glow">
            <MessageSquareHeart size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-ds-voice text-xl/7 font-bold text-ds-section-ink text-balance sm:text-2xl/8">{FEEDBACK_HOOK}</h2>
            <p className="mt-1.5 text-ds-body text-ds-ink-700">{FEEDBACK_PITCH}</p>
          </div>
        </div>
      </div>

      {sent ? (
        <div className="px-5 py-10 text-center sm:px-8" role="status" data-testid="avis-merci">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-ds-success-100 text-ds-success-700">
            <Heart size={26} />
          </span>
          <p className="mt-4 font-ds-voice text-xl font-bold text-ds-ink-900">Merci, c&apos;est noté&nbsp;!</p>
          <p className="mx-auto mt-2 max-w-md text-ds-body text-ds-ink-700">
            Votre avis est arrivé à l&apos;équipe. C&apos;est avec des retours comme le vôtre que nous décidons de ce que nous améliorons ensuite.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={another}>
              Donner un autre avis
            </Button>
            <Button onClick={onClose}>Fermer</Button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-6 px-5 py-6 sm:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <fieldset>
            <legend className="text-ds-body font-semibold text-ds-ink-900">C&apos;est plutôt…</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FEEDBACK_KINDS.map((option) => {
                const Icon = KIND_ICONS[option];
                const active = option === kind;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(option)}
                    className={clsx(
                      "flex min-h-11 items-center gap-2 rounded-ds-md border px-3 py-2 text-left text-ds-body font-medium transition-colors ds-focus",
                      active ? "border-ds-section-accent bg-ds-section-tint-2 text-ds-section-ink" : "border-ds-ink-200 bg-white text-ds-ink-700 hover:border-ds-ink-300",
                    )}
                  >
                    <Icon size={18} aria-hidden className="shrink-0" />
                    <span className="min-w-0">{FEEDBACK_KIND_LABELS[option]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${ids}-outil`} className="text-ds-body font-semibold text-ds-ink-900">
              À propos de
            </label>
            <Select
              id={`${ids}-outil`}
              value={topic}
              onChange={(event) => setTopic(event.target.value as FeedbackTopic)}
              className="mt-2 min-h-11 text-ds-body pointer-coarse:text-base"
            >
              {FEEDBACK_TOPICS.map((option) => (
                <option key={option} value={option}>
                  {FEEDBACK_TOPIC_LABELS[option]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor={`${ids}-avis`} className="text-ds-body font-semibold text-ds-ink-900">
              Votre avis
            </label>
            <p id={`${ids}-question`} className="mt-1 text-ds-body text-ds-ink-700">
              {FEEDBACK_KIND_PROMPTS[kind]}
            </p>
            <textarea
              id={`${ids}-avis`}
              data-testid="avis-texte"
              rows={4}
              maxLength={FEEDBACK_MESSAGE_MAX}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (messageError) setError(null);
              }}
              aria-describedby={`${ids}-question ${ids}-compte${messageError ? ` ${ids}-erreur` : ""}`}
              aria-invalid={messageError ? true : undefined}
              placeholder="Plus vous êtes précis, plus nous pouvons agir : ce que vous faisiez, ce que vous attendiez, ce qui vous aiderait."
              className={clsx(TEXTAREA, "mt-2", messageError && "border-ds-danger-600")}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              {messageError ? (
                <p id={`${ids}-erreur`} role="alert" className="text-ds-meta font-medium text-ds-danger-700">
                  {messageError}
                </p>
              ) : (
                <span />
              )}
              <p id={`${ids}-compte`} className="shrink-0 text-ds-meta text-ds-ink-600 tabular-nums">
                {length} / {FEEDBACK_MESSAGE_MAX}
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="text-ds-body font-semibold text-ds-ink-900">
              Votre note globale <span className="font-normal text-ds-ink-600">(facultatif)</span>
            </legend>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div role="radiogroup" aria-label="Votre note globale sur 5" className="flex">
                {Array.from({ length: FEEDBACK_RATING_MAX }, (_, index) => {
                  const stars = index + 1;
                  const lit = rating !== null && stars <= rating;
                  return (
                    <button
                      key={stars}
                      type="button"
                      role="radio"
                      aria-checked={rating === stars}
                      aria-label={`${stars} étoile${stars > 1 ? "s" : ""} sur ${FEEDBACK_RATING_MAX}`}
                      // Un second appui sur la note choisie la retire : elle est facultative
                      onClick={() => setRating(rating === stars ? null : stars)}
                      className="grid size-11 place-items-center rounded-full ds-focus"
                    >
                      <Star size={26} aria-hidden className={lit ? "fill-ds-sun-400 text-ds-sun-600" : "text-ds-ink-300"} />
                    </button>
                  );
                })}
              </div>
              <p aria-hidden className="min-h-5 text-ds-body font-medium text-ds-ink-700">
                {rating === null ? "" : RATING_WORDS[rating - 1]}
              </p>
            </div>
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-ds-body text-ds-ink-800">
            <input
              type="checkbox"
              checked={contactOk}
              onChange={(event) => setContactOk(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded border-ink-300 text-primary-600 focus:ring-2 focus:ring-primary-200"
            />
            <span>Vous pouvez me recontacter à ce sujet.</span>
          </label>

          {error?.field === "form" ? (
            <p role="alert" className="rounded-ds-md bg-ds-danger-100 px-3.5 py-2.5 text-ds-body font-medium text-ds-danger-900">
              {error.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ds-ink-200 pt-5">
            <Button type="button" variant="quiet" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={sending} icon={<Send size={18} aria-hidden />} data-testid="avis-envoyer">
              Envoyer mon avis
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
