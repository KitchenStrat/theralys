"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button, Modal } from "@theralys/ui";
import { saveBlogSettings } from "../actions";

export type BlogSettingsValue = {
  publicationMode: "auto" | "manual";
  voiceDesignation: "nous" | "je" | "on";
  voiceAccord: "feminin" | "masculin";
  voiceReader: "vous" | "tu";
  voiceTone: "chaleureux" | "rassurant" | "pose" | "direct" | "pedagogue";
};

const DEFAULTS: BlogSettingsValue = {
  publicationMode: "auto",
  voiceDesignation: "je",
  voiceAccord: "feminin",
  voiceReader: "vous",
  voiceTone: "chaleureux",
};

const TONES: { value: BlogSettingsValue["voiceTone"]; label: string }[] = [
  { value: "chaleureux", label: "Chaleureux" },
  { value: "rassurant", label: "Rassurant" },
  { value: "pose", label: "Posé" },
  { value: "direct", label: "Direct" },
  { value: "pedagogue", label: "Pédagogue" },
];

export function BlogSettingsModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: BlogSettingsValue | null;
}) {
  const [value, setValue] = useState<BlogSettingsValue>(initial ?? DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    const result = await saveBlogSettings(value);
    setSaving(false);
    if (result.error) setError(result.error);
    else onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Paramètres du blog" wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-500">Réglages de vos futurs articles. Modifiables à tout moment.</p>

      <div className="mt-5 rounded-2xl border border-cream-300 p-4">
        <SettingRow
          label="Publication"
          hint="Quand vos articles sont mis en ligne."
        >
          <Segmented
            options={[
              { value: "auto", label: "Automatique" },
              { value: "manual", label: "Manuelle" },
            ]}
            value={value.publicationMode}
            onChange={(publicationMode) =>
              setValue({ ...value, publicationMode: publicationMode as BlogSettingsValue["publicationMode"] })
            }
          />
        </SettingRow>
      </div>

      <div className="mt-4 rounded-2xl border border-cream-300 p-4">
        <h3 className="text-sm font-semibold">Votre voix</h3>
        <div className="mt-3 space-y-4">
          <SettingRow label="Désignation">
            <Segmented
              options={[
                { value: "nous", label: "Nous" },
                { value: "je", label: "Je" },
                { value: "on", label: "On" },
              ]}
              value={value.voiceDesignation}
              onChange={(v) => setValue({ ...value, voiceDesignation: v as BlogSettingsValue["voiceDesignation"] })}
            />
          </SettingRow>
          <SettingRow label="Accord">
            <Segmented
              options={[
                { value: "feminin", label: "Féminin" },
                { value: "masculin", label: "Masculin" },
              ]}
              value={value.voiceAccord}
              onChange={(v) => setValue({ ...value, voiceAccord: v as BlogSettingsValue["voiceAccord"] })}
            />
          </SettingRow>
          <SettingRow label="Lecteur">
            <Segmented
              options={[
                { value: "vous", label: "Vous" },
                { value: "tu", label: "Tu" },
              ]}
              value={value.voiceReader}
              onChange={(v) => setValue({ ...value, voiceReader: v as BlogSettingsValue["voiceReader"] })}
            />
          </SettingRow>
          <SettingRow label="Ton">
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => setValue({ ...value, voiceTone: tone.value })}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    value.voiceTone === tone.value
                      ? "border-primary-400 bg-primary-50 text-primary-600"
                      : "border-cream-300 text-ink-700 hover:border-ink-300",
                  )}
                >
                  {tone.label}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-danger-500">{error}</p> : null}
    </Modal>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-full border border-cream-300 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            "rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
            option.value === value ? "bg-white text-ink-900 shadow-sm ring-1 ring-cream-300" : "text-ink-500 hover:text-ink-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
