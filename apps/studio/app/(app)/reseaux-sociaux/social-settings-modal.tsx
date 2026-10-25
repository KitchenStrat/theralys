"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Button, FieldHint, Modal } from "@theralys/ui";
import { SOCIAL_INSTRUCTIONS_MAX, type SocialVoice } from "@theralys/shared";
import type { SocialSettingsView } from "@/lib/social/settings";
import { VoiceFields, type VoiceValue } from "../voice-fields";
import { saveSocialSettings } from "./actions";

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
      {/* En-tête chaleureux + progression (même structure que les Paramètres du blog) */}
      <div className="rounded-t-3xl bg-gradient-to-br from-primary-50 via-cream-50 to-primary-100 px-8 pb-6 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary-600">Harmony</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500">Étape {step + 1} sur 3</span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={clsx("h-1 w-8 rounded-full", i <= step ? "bg-primary-500" : "bg-cream-300")}
                />
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-500 hover:text-ink-900">
              ✕
            </button>
          </div>
        </div>
        <h2 className="mt-4 font-serif text-3xl font-bold">{current.title}</h2>
        <p className="mt-1.5 text-sm text-ink-500">{current.subtitle}</p>
      </div>

      <div className="px-8 py-6">
        {step === 0 ? (
          <div className="space-y-5">
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
            <label htmlFor="social-instructions" className="block text-sm font-medium text-ink-700">
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
              className={clsx(
                "mt-1 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm leading-relaxed text-ink-900",
                "placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100",
                instructionsError ? "border-danger-500" : "border-ink-300",
              )}
            />
            <div className="flex items-start justify-between gap-4">
              <div id="social-instructions-hint">
                <FieldHint>
                  Les consignes contraires aux règles de communication des praticiens (promesses de résultat,
                  vocabulaire médical) ne peuvent pas être enregistrées : le mot en cause vous est indiqué.
                </FieldHint>
              </div>
              <p id="social-instructions-count" className="mt-1 shrink-0 text-xs tabular-nums text-ink-500">
                {instructions.length} / {SOCIAL_INSTRUCTIONS_MAX}
              </p>
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary-600">Exemples</p>
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
                      "rounded-full border px-3.5 py-1.5 text-left text-sm transition-colors",
                      added
                        ? "cursor-default border-primary-200 bg-primary-50 text-primary-600"
                        : "border-cream-300 text-ink-700 hover:border-ink-300",
                    )}
                  >
                    {added ? "✓" : "+"} {example}
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
                      "h-11 w-14 rounded-full border text-sm font-medium transition-colors",
                      on
                        ? "border-primary-400 bg-primary-500 text-white shadow-sm"
                        : "border-cream-300 bg-white text-ink-700 hover:border-ink-300",
                      locked && "cursor-default",
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            {lastDay ? (
              <p id="social-days-hint" className="mt-2 text-xs text-ink-500">
                Choisissez au moins un jour : ce dernier jour reste actif.
              </p>
            ) : null}
            <p className="mt-4 text-sm text-ink-700" aria-live="polite">
              <strong className="text-ink-900">
                {perWeek} contenu{perWeek > 1 ? "s" : ""} par semaine
              </strong>
              , soit environ {perWeek * 4} par mois.
            </p>
            <div className="mt-5 rounded-2xl bg-primary-50/60 px-5 py-4 text-sm leading-relaxed text-ink-700">
              Les contenus déjà préparés ne changent pas. Vos réglages s&apos;appliquent aux prochaines
              préparations de mois et aux demandes sur mesure.
            </div>
          </div>
        ) : null}

        {error ? (
          <p id="social-settings-error" className="mt-4 text-sm text-danger-500" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-cream-200 px-8 py-5">
        {step > 0 ? (
          <button type="button" onClick={() => goTo(step - 1)} className="text-sm font-medium text-ink-700 hover:text-ink-900">
            ← Retour
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button onClick={() => goTo(step + 1)}>Continuer →</Button>
        ) : (
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
