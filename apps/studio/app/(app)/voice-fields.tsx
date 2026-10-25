"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";
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

/** Ligne d'un assistant : libellé à gauche, contrôle à droite. */
export function WizardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-700">{label}</p>
      {children}
    </div>
  );
}

/**
 * Contrôles de la voix (« Qui écrit ? », « Accord », « Vos lecteurs », « Ton »)
 * et encart « Aperçu » — rendus dans le conteneur `space-y-5` de l'appelant.
 */
export function VoiceFields({ value, onChange }: { value: VoiceValue; onChange: (value: VoiceValue) => void }) {
  return (
    <>
      <WizardRow label="Qui écrit ?">
        <Segmented
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
          options={[
            { value: "vous", label: "Vous" },
            { value: "tu", label: "Tu" },
          ]}
          value={value.voiceReader}
          onChange={(v) => onChange({ ...value, voiceReader: v as VoiceValue["voiceReader"] })}
        />
      </WizardRow>
      <WizardRow label="Ton">
        <div className="flex flex-wrap justify-end gap-2">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              type="button"
              aria-pressed={value.voiceTone === tone.value}
              onClick={() => onChange({ ...value, voiceTone: tone.value })}
              className={clsx(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                value.voiceTone === tone.value
                  ? "border-primary-400 bg-primary-50 font-medium text-primary-600"
                  : "border-cream-300 text-ink-700 hover:border-ink-300",
              )}
            >
              {tone.label}
            </button>
          ))}
        </div>
      </WizardRow>
      <div className="rounded-2xl bg-primary-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Aperçu</p>
        <p className="mt-2 font-serif italic leading-relaxed text-ink-900">{voicePreview(value)}</p>
      </div>
    </>
  );
}
