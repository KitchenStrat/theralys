"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button } from "@theralys/ui";
import { saveBlogSettings } from "../actions";

export type BlogTheme = { label: string; perMonth: number };

export type BlogSettingsValue = {
  publicationMode: "auto" | "manual";
  voiceDesignation: "nous" | "je" | "on";
  voiceAccord: "feminin" | "masculin";
  voiceReader: "vous" | "tu";
  voiceTone: "chaleureux" | "rassurant" | "pose" | "direct" | "pedagogue";
  themes?: BlogTheme[];
};

const DEFAULTS: Omit<BlogSettingsValue, "themes"> = {
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

/** Aperçu vivant de la voix : une phrase type recomposée selon les réglages. */
function voicePreview(v: Omit<BlogSettingsValue, "themes">): string {
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

export function BlogSettingsModal({
  open,
  onClose,
  initial,
  monthlyQuota,
  defaultThemeLabels,
}: {
  open: boolean;
  onClose: () => void;
  initial: BlogSettingsValue | null;
  monthlyQuota: number;
  defaultThemeLabels: string[];
}) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<Omit<BlogSettingsValue, "themes">>(initial ?? DEFAULTS);
  const [themes, setThemes] = useState<BlogTheme[]>([]);
  const [newTheme, setNewTheme] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Ré)initialisation à l'ouverture : thèmes enregistrés, sinon les motifs
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setValue(initial ?? DEFAULTS);
    const base =
      initial?.themes && initial.themes.length > 0
        ? initial.themes
        : defaultThemeLabels.map((label) => ({ label, perMonth: 0 }));
    setThemes(spread(base, monthlyQuota));
  }, [open, initial, defaultThemeLabels, monthlyQuota]);

  const total = themes.reduce((sum, t) => sum + t.perMonth, 0);

  async function onSave() {
    setSaving(true);
    setError(null);
    const result = await saveBlogSettings({ ...value, themes });
    setSaving(false);
    if (result.error) setError(result.error);
    else onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête chaleureux + progression */}
        <div className="rounded-t-3xl bg-gradient-to-br from-primary-50 via-cream-50 to-primary-100 px-8 pb-6 pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary-600">Harmony</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-500">Étape {step + 1} sur 3</span>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={clsx(
                      "h-1 w-8 rounded-full",
                      i <= step ? "bg-primary-500" : "bg-cream-300",
                    )}
                  />
                ))}
              </div>
              <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-500 hover:text-ink-900">
                ✕
              </button>
            </div>
          </div>
          <h2 className="mt-4 font-serif text-3xl font-bold">
            {step === 0 ? "Trouvez votre voix." : step === 1 ? "De quoi parlera votre blog ?" : "Répartissez vos articles."}
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            {step === 0
              ? "Ajustez le ton de vos prochains articles et leur mode de publication."
              : step === 1
                ? "Ajoutez ou retirez les thématiques qui guideront les prochains sujets."
                : "Cette répartition s'appliquera aux prochains sujets du calendrier."}
          </p>
        </div>

        <div className="px-8 py-6">
          {step === 0 ? (
            <div className="space-y-5">
              <WizardRow label="Publication">
                <Segmented
                  options={[
                    { value: "auto", label: "Automatique" },
                    { value: "manual", label: "Manuelle" },
                  ]}
                  value={value.publicationMode}
                  onChange={(v) => setValue({ ...value, publicationMode: v as "auto" | "manual" })}
                />
              </WizardRow>
              <WizardRow label="Qui écrit ?">
                <Segmented
                  options={[
                    { value: "nous", label: "Nous" },
                    { value: "je", label: "Je" },
                    { value: "on", label: "On" },
                  ]}
                  value={value.voiceDesignation}
                  onChange={(v) =>
                    setValue({ ...value, voiceDesignation: v as BlogSettingsValue["voiceDesignation"] })
                  }
                />
              </WizardRow>
              <WizardRow label="Accord">
                <Segmented
                  options={[
                    { value: "feminin", label: "Féminin" },
                    { value: "masculin", label: "Masculin" },
                  ]}
                  value={value.voiceAccord}
                  onChange={(v) => setValue({ ...value, voiceAccord: v as "feminin" | "masculin" })}
                />
              </WizardRow>
              <WizardRow label="Vos lecteurs">
                <Segmented
                  options={[
                    { value: "vous", label: "Vous" },
                    { value: "tu", label: "Tu" },
                  ]}
                  value={value.voiceReader}
                  onChange={(v) => setValue({ ...value, voiceReader: v as "vous" | "tu" })}
                />
              </WizardRow>
              <WizardRow label="Ton">
                <div className="flex flex-wrap justify-end gap-2">
                  {TONES.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => setValue({ ...value, voiceTone: tone.value })}
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
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                  Aperçu
                </p>
                <p className="mt-2 font-serif italic leading-relaxed text-ink-900">
                  {voicePreview(value)}
                </p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              {themes.map((theme, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-cream-200 py-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{theme.label}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${theme.label}`}
                    onClick={() => setThemes(themes.filter((_, j) => j !== i))}
                    className="text-ink-500 hover:text-danger-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <form
                className="flex items-center gap-3 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newTheme.trim();
                  if (!label || themes.length >= 12) return;
                  setThemes([...themes, { label, perMonth: 0 }]);
                  setNewTheme("");
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-300 text-xs text-ink-500">
                  +
                </span>
                <input
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  placeholder="Ajouter une thématique…"
                  className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-ink-400"
                />
                {newTheme.trim() ? (
                  <button type="submit" className="text-sm font-medium text-primary-500">
                    Ajouter
                  </button>
                ) : null}
              </form>
              {themes.length === 0 ? (
                <p className="py-2 text-sm text-ink-500">
                  Ajoutez au moins une thématique — par défaut, vos motifs de consultation.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <p className="text-sm text-ink-700">
                Votre formule prévoit environ <strong>{monthlyQuota} articles par mois</strong>.
                Répartissez-les selon vos priorités.
              </p>
              <div className="mt-4 space-y-3">
                {themes.map((theme, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{theme.label}</span>
                    <div className="flex items-center rounded-xl border border-cream-300">
                      <button
                        type="button"
                        aria-label="Moins"
                        onClick={() =>
                          setThemes(
                            themes.map((t, j) =>
                              j === i ? { ...t, perMonth: Math.max(0, t.perMonth - 1) } : t,
                            ),
                          )
                        }
                        className="px-3 py-1.5 text-ink-500 hover:text-ink-900"
                      >
                        −
                      </button>
                      <span className="min-w-16 text-center text-sm font-medium">
                        {theme.perMonth} / mois
                      </span>
                      <button
                        type="button"
                        aria-label="Plus"
                        onClick={() =>
                          setThemes(
                            themes.map((t, j) =>
                              j === i ? { ...t, perMonth: Math.min(30, t.perMonth + 1) } : t,
                            ),
                          )
                        }
                        className="px-3 py-1.5 text-ink-500 hover:text-ink-900"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p
                className={clsx(
                  "mt-5 rounded-xl px-4 py-3 text-sm",
                  total === monthlyQuota
                    ? "bg-success-500/10 text-success-500"
                    : "bg-cream-100 text-ink-700",
                )}
              >
                {total === monthlyQuota
                  ? "Votre répartition est complète."
                  : total < monthlyQuota
                    ? `Encore ${monthlyQuota - total} article${monthlyQuota - total > 1 ? "s" : ""} à répartir.`
                    : `${total - monthlyQuota} article${total - monthlyQuota > 1 ? "s" : ""} au-dessus de votre formule — les premiers de la liste seront privilégiés.`}
              </p>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-danger-500">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t border-cream-200 px-8 py-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="text-sm font-medium text-ink-700 hover:text-ink-900"
            >
              ← Retour
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && themes.length === 0}>
              Continuer →
            </Button>
          ) : (
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer →"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Répartit le quota mensuel sur les thématiques qui n'ont pas encore de valeur. */
function spread(themes: BlogTheme[], quota: number): BlogTheme[] {
  const assigned = themes.reduce((sum, t) => sum + t.perMonth, 0);
  if (assigned > 0 || themes.length === 0) return themes;
  const base = Math.floor(quota / themes.length);
  let remainder = quota - base * themes.length;
  return themes.map((t) => ({ ...t, perMonth: base + (remainder-- > 0 ? 1 : 0) }));
}

function WizardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-700">{label}</p>
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
    <div className="flex rounded-full bg-cream-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            option.value === value
              ? "bg-white text-ink-900 shadow-sm ring-1 ring-cream-300"
              : "text-ink-500 hover:text-ink-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
