"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Check, Quote } from "lucide-react";
import { Segmented } from "@theralys/ui";

/**
 * « Votre voix » : réglages communs au blog (Paramètres des publications) et
 * aux contenus réseaux sociaux (Paramétrage), mêmes valeurs que les enums
 * `voice_*` de la base.
 */
export type VoiceValue = {
  voiceDesignation: "nous" | "je" | "on";
  voiceAccord: "feminin" | "masculin";
  voiceReader: "vous" | "tu";
  voiceTone: "chaleureux" | "rassurant" | "pose" | "direct" | "pedagogue";
};

export const DEFAULT_VOICE_VALUE: VoiceValue = {
  voiceDesignation: "je",
  voiceAccord: "feminin",
  voiceReader: "vous",
  voiceTone: "chaleureux",
};

export const TONES: { value: VoiceValue["voiceTone"]; label: string }[] = [
  { value: "chaleureux", label: "Chaleureux" },
  { value: "rassurant", label: "Rassurant" },
  { value: "pose", label: "Posé" },
  { value: "direct", label: "Direct" },
  { value: "pedagogue", label: "Pédagogue" },
];

/** Aperçu vivant de la voix : une phrase type recomposée selon les réglages. */
export function voicePreview(v: VoiceValue): string {
  const je = v.voiceDesignation === "je";
  const nous = v.voiceDesignation === "nous";
  const vous = v.voiceReader === "vous";
  const you = vous ? "vous" : "te";
  const your = vous ? "votre" : "ton";
  const welcome = je
    ? `je ${vous ? "vous accueille" : "t'accueille"}`
    : nous
      ? `nous ${vous ? "vous accueillons" : "t'accueillons"}`
      : `on ${vous ? "vous accueille" : "t'accueille"}`;
  const cab = je ? "mon" : "notre";
  const attentive = je
    ? v.voiceAccord === "feminin"
      ? "attentive"
      : "attentif"
    : nous
      ? v.voiceAccord === "feminin"
        ? "attentives"
        : "attentifs"
      : "attentif";
  const advance = je ? "J'avance" : nous ? "Nous avançons" : "On avance";

  switch (v.voiceTone) {
    case "chaleureux":
      return `« Dans ${cab} cabinet, ${welcome} avec chaleur, ${attentive} à ${your} histoire. ${advance} ensemble, pas à pas, à ${your} rythme. »`;
    case "rassurant":
      return `« Ce que ${you === "vous" ? "vous vivez" : "tu vis"} est fréquent, et il existe des réponses douces. ${welcome[0]!.toUpperCase()}${welcome.slice(1)} dans un cadre apaisant, sans jugement. »`;
    case "pose":
      return `« Chaque séance commence par un temps d'écoute. ${advance} posément, en respectant ce dont ${your} corps a besoin. »`;
    case "direct":
      return `« Des séances concrètes, des repères simples, des effets que ${vous ? "vous pouvez" : "tu peux"} ressentir. ${welcome[0]!.toUpperCase()}${welcome.slice(1)} avec un objectif clair. »`;
    case "pedagogue":
      return `« Comprendre ce qui se joue dans ${your} corps, c'est déjà avancer. ${advance} en expliquant chaque étape, simplement. »`;
  }
}

/**
 * Sélecteur à segments partagé, à la taille du design system : segments de
 * 36 px, 44 px au doigt, et la couleur de la section pour le segment actif.
 */
export const SEGMENTED_SIZE =
  "max-w-full [&>button]:min-h-9 [&>button]:aria-pressed:font-semibold [&>button]:aria-pressed:text-ds-section-ink pointer-coarse:[&>button]:min-h-11";

/** Ligne d'un assistant : libellé à gauche, contrôle à droite (dessous quand la place manque). */
export function WizardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-ds-body font-medium text-ds-ink-800">{label}</p>
      {children}
    </div>
  );
}

/**
 * Contrôles de la voix (« Qui écrit ? », « Accord », « Vos lecteurs », « Ton »)
 * et encart « Aperçu » — rendus dans le conteneur `space-y-5` de l'appelant.
 * Les couleurs suivent la section englobante (blog ou réseaux sociaux).
 */
export function VoiceFields({ value, onChange }: { value: VoiceValue; onChange: (value: VoiceValue) => void }) {
  return (
    <>
      <WizardRow label="Qui écrit ?">
        <Segmented
          aria-label="Qui écrit ?"
          className={SEGMENTED_SIZE}
          options={[
            { value: "nous", label: "Nous" },
            { value: "je", label: "Je" },
            { value: "on", label: "On" },
          ]}
          value={value.voiceDesignation}
          onChange={(v) => onChange({ ...value, voiceDesignation: v as VoiceValue["voiceDesignation"] })}
        />
      </WizardRow>
      <WizardRow label="Accord">
        <Segmented
          aria-label="Accord"
          className={SEGMENTED_SIZE}
          options={[
            { value: "feminin", label: "Féminin" },
            { value: "masculin", label: "Masculin" },
          ]}
          value={value.voiceAccord}
          onChange={(v) => onChange({ ...value, voiceAccord: v as VoiceValue["voiceAccord"] })}
        />
      </WizardRow>
      <WizardRow label="Vos lecteurs">
        <Segmented
          aria-label="Vos lecteurs"
          className={SEGMENTED_SIZE}
          options={[
            { value: "vous", label: "Vous" },
            { value: "tu", label: "Tu" },
          ]}
          value={value.voiceReader}
          onChange={(v) => onChange({ ...value, voiceReader: v as VoiceValue["voiceReader"] })}
        />
      </WizardRow>
      <WizardRow label="Ton">
        <div role="group" aria-label="Ton" className="flex flex-wrap gap-2 sm:justify-end">
          {TONES.map((tone) => {
            const selected = value.voiceTone === tone.value;
            return (
              <button
                key={tone.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...value, voiceTone: tone.value })}
                className={clsx(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-ds-body ds-focus ds-press pointer-coarse:min-h-11",
                  selected
                    ? "bg-ds-section-tint-2 font-semibold text-ds-section-ink inset-ring-2 inset-ring-ds-section-accent"
                    : "bg-white font-medium text-ds-ink-700 inset-ring inset-ring-ds-ink-300 hover:bg-ds-ink-50",
                )}
              >
                {/* Le ton choisi porte une coche : jamais la couleur seule */}
                {selected ? <Check size={16} strokeWidth={2.5} aria-hidden className="text-ds-section-accent ds-pop" /> : null}
                {tone.label}
              </button>
            );
          })}
        </div>
      </WizardRow>
      <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
        <p className="flex items-center gap-2 text-ds-meta font-semibold text-ds-section-accent">
          <Quote size={16} aria-hidden />
          Aperçu
        </p>
        <p className="mt-2 text-base/7 text-ds-ink-900 text-pretty">{voicePreview(value)}</p>
      </div>
    </>
  );
}
