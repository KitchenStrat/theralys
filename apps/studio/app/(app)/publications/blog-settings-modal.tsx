"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button, Modal, Segmented } from "@theralys/ui";
import { saveBlogSettings } from "../actions";
import { DEFAULT_VOICE_VALUE, VoiceFields, WizardRow, type VoiceValue } from "../voice-fields";

export type BlogTheme = { label: string; perMonth: number };

export type BlogSettingsValue = VoiceValue & {
  publicationMode: "auto" | "manual";
  themes?: BlogTheme[];
};

const DEFAULTS: Omit<BlogSettingsValue, "themes"> = {
  publicationMode: "auto",
  ...DEFAULT_VOICE_VALUE,
};

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
    <Modal open={open} onClose={onClose} title="Paramètres du blog" size="lg" plain>
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
            <VoiceFields value={value} onChange={(voice) => setValue({ ...value, ...voice })} />
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
    </Modal>
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
