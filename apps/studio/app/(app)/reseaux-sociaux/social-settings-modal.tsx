"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Info, Lightbulb, Plus } from "lucide-react";
import { FieldHint, Modal } from "@theralys/ui";
import { SOCIAL_INSTRUCTIONS_MAX, type SocialVoice } from "@theralys/shared";
import { Button, ProgressBar } from "@/components/ds";
import type { SocialSettingsView } from "@/lib/social/settings";
import { VoiceFields, type VoiceValue } from "../voice-fields";
import { saveSocialSettings } from "./actions";
import { ErrorNote, ModalHeader, TEXTAREA_CLASS, TOUCH_BUTTONS_CLASS } from "./social-ui";

const STEPS = [
  {
    title: "Trouvez votre voix.",
    subtitle: "Mêmes réglages que votre blog, mais indépendants : changez-les ici sans toucher à vos articles.",
  },
  { title: "Vos consignes.", subtitle: "Dites au générateur ce qui compte pour vous." },
  { title: "Votre rythme.", subtitle: "Choisissez vos jours de publication." },
] as const;

/** Jours ISO (1 = lundi … 7 = dimanche) : libellé court des pastilles, nom accessible complet. */
const DAYS: { value: number; label: string; name: string }[] = [
  { value: 1, label: "Lun", name: "Lundi" },
  { value: 2, label: "Mar", name: "Mardi" },
  { value: 3, label: "Mer", name: "Mercredi" },
  { value: 4, label: "Jeu", name: "Jeudi" },
  { value: 5, label: "Ven", name: "Vendredi" },
  { value: 6, label: "Sam", name: "Samedi" },
  { value: 7, label: "Dim", name: "Dimanche" },
];

/** Puces d'exemples : un clic ajoute la ligne aux consignes. */
const EXAMPLES = [
  "Terminer chaque légende par une question.",
  "Ne jamais citer de tarif.",
  "Parler de « séance » plutôt que de « consultation ».",
];

const PLACEHOLDER =
  "Ex. : Terminer chaque légende par une question. Ne jamais citer de tarif. Parler de « séance » plutôt que de « consultation ». Mettre en avant mon cabinet du centre-ville le mardi.";

function toVoiceValue(voice: SocialVoice): VoiceValue {
  return {
    voiceDesignation: voice.designation,
    voiceAccord: voice.accord,
    voiceReader: voice.reader,
    voiceTone: voice.tone,
  };
}

type SaveError = { message: string; field?: "instructions" };

/**
 * « Paramétrage » des contenus réseaux sociaux : assistant en 3 étapes calqué
 * sur les Paramètres du blog — voix (mêmes contrôles, réglages indépendants),
 * consignes libres au générateur, jours de publication. Les valeurs initiales
 * sont les réglages effectifs du site (`getSocialSettings`).
 */
export function SocialSettingsModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: SocialSettingsView;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [voice, setVoice] = useState<VoiceValue>(() => toVoiceValue(initial.voice));
  const [instructions, setInstructions] = useState(initial.instructions);
  const [days, setDays] = useState<number[]>(initial.postDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Réglages effectifs les plus récents, lus à l'ouverture seulement : un
  // rafraîchissement de la page pendant la saisie ne doit pas effacer le travail en cours
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // (Ré)initialisation à l'ouverture sur les réglages effectifs
  useEffect(() => {
    if (!open) return;
    const current = initialRef.current;
    setStep(0);
    setError(null);
    setVoice(toVoiceValue(current.voice));
    setInstructions(current.instructions);
    setDays(current.postDays);
  }, [open]);

  // Terme refusé : le curseur revient dans les consignes pour reformuler
  useEffect(() => {
    if (error?.field === "instructions" && step === 1) textareaRef.current?.focus();
  }, [error, step]);

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  function toggleDay(day: number) {
    setError(null);
    setDays((current) => {
      if (current.includes(day)) {
        // Au moins un jour de publication
        return current.length > 1 ? current.filter((d) => d !== day) : current;
      }
      return [...current, day].sort((a, b) => a - b);
    });
  }

  function changeInstructions(next: string) {
    setError(null);
    setInstructions(next);
  }

  function addExample(line: string) {
    setError(null);
    setInstructions((current) => {
      if (current.includes(line)) return current;
      const next = current.trim() === "" ? line : `${current.trimEnd()}\n${line}`;
      return next.slice(0, SOCIAL_INSTRUCTIONS_MAX);
    });
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await saveSocialSettings({
        designation: voice.voiceDesignation,
        accord: voice.voiceAccord,
        reader: voice.voiceReader,
        tone: voice.voiceTone,
        instructions,
        postDays: days,
      });
      if (result.error) {
        setError({ message: result.error, ...(result.field ? { field: result.field } : {}) });
        // Terme interdit : retour sur l'étape « Vos consignes » pour reformuler
        if (result.field === "instructions") setStep(1);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError({ message: "L'enregistrement a échoué — vérifiez votre connexion et réessayez." });
    } finally {
      setSaving(false);
    }
  }

  const current = STEPS[step] ?? STEPS[0];
  const perWeek = days.length;
  const instructionsError = error?.field === "instructions";
  const lastDay = days.length === 1;

  return (
    <Modal open={open} onClose={onClose} title="Paramétrage des contenus réseaux sociaux" size="lg" plain>
      {/* En-tête : où l'on en est (étape, jauge), puis le titre de l'étape — même structure que les Paramètres du blog */}
      <ModalHeader
        title={current.title}
        onClose={onClose}
        before={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="ds-brand-word text-lg">Harmony</p>
            <ProgressBar
              className="w-36"
              size="sm"
              value={step + 1}
              max={STEPS.length}
              label={<span className="text-ds-meta font-semibold text-ds-ink-700">Étape {step + 1} sur 3</span>}
              valueText={`Étape ${step + 1} sur 3`}
              hideValueText
            />
          </div>
        }
      >
        <p className="mt-1.5 text-ds-body text-ds-ink-700">{current.subtitle}</p>
      </ModalHeader>

      <div className="px-5 py-6 sm:px-8">
        {step === 0 ? (
          <div className={clsx("space-y-5", TOUCH_BUTTONS_CLASS)}>
            <VoiceFields
              value={voice}
              onChange={(next) => {
                setError(null);
                setVoice(next);
              }}
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <label htmlFor="social-instructions" className="block text-ds-body font-semibold text-ds-ink-900">
              Vos consignes au générateur
            </label>
            <textarea
              ref={textareaRef}
              id="social-instructions"
              rows={7}
              maxLength={SOCIAL_INSTRUCTIONS_MAX}
              value={instructions}
              onChange={(e) => changeInstructions(e.target.value)}
              placeholder={PLACEHOLDER}
              aria-invalid={instructionsError || undefined}
              aria-describedby={clsx(
                "social-instructions-hint social-instructions-count",
                instructionsError && "social-settings-error",
              )}
              className={clsx(TEXTAREA_CLASS, "mt-1.5 resize-y bg-white leading-relaxed aria-invalid:border-danger-500")}
            />
            <div className="flex items-start justify-between gap-4">
              <div id="social-instructions-hint">
                <FieldHint>
                  Les consignes contraires aux règles de communication des praticiens (promesses de résultat,
                  vocabulaire médical) ne peuvent pas être enregistrées : le mot en cause vous est indiqué.
                </FieldHint>
              </div>
              <p id="social-instructions-count" className="mt-1 shrink-0 text-xs text-ds-ink-600 ds-tnum">
                {instructions.length} / {SOCIAL_INSTRUCTIONS_MAX}
              </p>
            </div>
            <p className="mt-5 flex items-center gap-1.5 text-ds-meta font-semibold text-ds-section-ink">
              <Lightbulb size={15} aria-hidden />
              Exemples
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => {
                const added = instructions.includes(example);
                return (
                  <button
                    key={example}
                    type="button"
                    onClick={() => addExample(example)}
                    disabled={added}
                    className={clsx(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-left text-sm font-medium ds-focus pointer-coarse:min-h-11",
                      added
                        ? "cursor-default bg-ds-section-tint-2 text-ds-section-ink"
                        : "bg-white text-ds-brand-800 inset-ring inset-ring-ds-ink-300 ds-press hover:bg-ds-brand-50",
                    )}
                  >
                    {added ? (
                      <Check size={15} strokeWidth={2.5} aria-hidden className="shrink-0" />
                    ) : (
                      <Plus size={15} strokeWidth={2.5} aria-hidden className="shrink-0" />
                    )}
                    {example}
                    {added ? <span className="sr-only"> (ajoutée)</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div
              role="group"
              aria-label="Jours de publication"
              aria-describedby={lastDay ? "social-days-hint" : undefined}
              className="flex flex-wrap gap-2"
            >
              {DAYS.map((day) => {
                const on = days.includes(day.value);
                const locked = on && lastDay;
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={day.name}
                    aria-disabled={locked || undefined}
                    title={locked ? "Choisissez au moins un jour." : undefined}
                    onClick={() => toggleDay(day.value)}
                    className={clsx(
                      "inline-flex h-11 min-w-[4.25rem] items-center justify-center gap-1 rounded-full px-3 text-ds-body font-semibold ds-focus",
                      on
                        ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow"
                        : "bg-white text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-section-tint",
                      locked ? "cursor-default" : "ds-press",
                    )}
                  >
                    {on ? <Check size={15} strokeWidth={3} aria-hidden className="shrink-0" /> : null}
                    {day.label}
                  </button>
                );
              })}
            </div>
            {lastDay ? (
              <p id="social-days-hint" className="mt-2 text-ds-meta text-ds-ink-600">
                Choisissez au moins un jour : ce dernier jour reste actif.
              </p>
            ) : null}
            <p className="mt-5 flex items-start gap-2.5 text-base text-ds-ink-700" aria-live="polite">
              <CalendarCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
              <span>
                <strong className="font-semibold text-ds-ink-900">
                  {perWeek} contenu{perWeek > 1 ? "s" : ""} par semaine
                </strong>
                , soit environ {perWeek * 4} par mois.
              </span>
            </p>
            <div className="mt-5 flex items-start gap-2.5 rounded-ds-md bg-ds-section-tint px-4 py-3.5 text-ds-body text-ds-ink-700 ring-1 ring-ds-section-line/70">
              <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
              <span>
                Les contenus déjà préparés ne changent pas. Vos réglages s&apos;appliquent aux prochaines
                préparations de mois et aux demandes sur mesure.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <ErrorNote id="social-settings-error" className="mt-4">
            {error.message}
          </ErrorNote>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-ds-ink-200 px-5 py-4 sm:px-8 sm:py-5">
        {step > 0 ? (
          <Button variant="quiet" icon={<ArrowLeft size={18} aria-hidden />} onClick={() => goTo(step - 1)}>
            Retour
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button iconRight={<ArrowRight size={18} aria-hidden />} onClick={() => goTo(step + 1)}>
            Continuer
          </Button>
        ) : (
          <Button icon={<Check size={18} aria-hidden />} loading={saving} onClick={onSave}>
            Enregistrer
          </Button>
        )}
      </div>
    </Modal>
  );
}
