"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Check, Minus, Plus, Settings, TriangleAlert, X } from "lucide-react";
import { Modal, Segmented } from "@theralys/ui";
import { Button, IconBadge, InlineSuccess, ProgressBar } from "@/components/ds";
import { saveBlogSettings } from "../actions";
import { DEFAULT_VOICE_VALUE, SEGMENTED_SIZE, VoiceFields, WizardRow, type VoiceValue } from "../voice-fields";

export type BlogTheme = { label: string; perMonth: number };

export type BlogSettingsValue = VoiceValue & {
  publicationMode: "auto" | "manual";
  themes?: BlogTheme[];
};

const DEFAULTS: Omit<BlogSettingsValue, "themes"> = {
  publicationMode: "auto",
  ...DEFAULT_VOICE_VALUE,
};

const STEPS = [
  {
    title: "Trouvez votre voix.",
    intro: "Ajustez le ton de vos prochains articles et leur mode de publication.",
  },
  {
    title: "De quoi parlera votre blog ?",
    intro: "Ajoutez ou retirez les thématiques qui guideront les prochains sujets.",
  },
  {
    title: "Répartissez vos articles.",
    intro: "Cette répartition s'appliquera aux prochains sujets du calendrier.",
  },
] as const;

/** Bouton rond d'appoint (fermer, retirer, plus, moins) : 36 px, 44 px au doigt. */
const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-full text-ds-ink-600 ds-focus ds-press hover:bg-ds-ink-100 hover:text-ds-ink-900 pointer-coarse:size-11";

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

  const current = STEPS[step] ?? STEPS[0];

  return (
    <Modal open={open} onClose={onClose} title="Paramètres du blog" size="lg" plain>
      <div data-ds-section="publications">
        {/* En-tête : où l'on est dans l'assistant, et ce que règle l'étape */}
        <div className="relative isolate overflow-hidden rounded-t-3xl bg-ds-section-soft px-5 pt-5 pb-6 sm:px-8 sm:pt-6">
          <span aria-hidden className="ds-band-art -z-10" />
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2.5 text-ds-body font-semibold text-ds-section-ink">
              <IconBadge icon={Settings} size="sm" />
              Paramètres du blog
            </p>
            <button type="button" onClick={onClose} aria-label="Fermer" className={clsx(ICON_BUTTON, "bg-white shadow-sm")}>
              <X size={18} aria-hidden />
            </button>
          </div>
          <ProgressBar
            className="mt-5 max-w-56 [--ds-progress-track:var(--color-white)]"
            size="sm"
            value={step + 1}
            max={STEPS.length}
            label={`Étape ${step + 1} sur ${STEPS.length}`}
            valueText={`Étape ${step + 1} sur ${STEPS.length}`}
            hideValueText
          />
          {/* Le changement d'étape est annoncé (le focus reste sur « Continuer ») ; `key` : le titre arrive en fondu */}
          <div aria-live="polite">
            <div key={step} className="ds-fade-in">
              <h2 className="mt-4 font-ds-display text-2xl/8 font-bold text-ds-section-ink text-balance sm:text-[1.75rem]/9">
                {current.title}
              </h2>
              <p className="mt-1.5 text-base text-ds-ink-700 text-pretty">{current.intro}</p>
            </div>
          </div>
        </div>

        <div key={step} className="px-5 py-6 ds-fade-in sm:px-8">
          {step === 0 ? (
            <div className="space-y-5">
              <WizardRow label="Publication">
                <Segmented
                  aria-label="Publication"
                  className={SEGMENTED_SIZE}
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
              <ul className="divide-y divide-ds-ink-200">
                {themes.map((theme, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-ds-section-tint-2 text-ds-meta font-semibold text-ds-section-ink ds-tnum"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-base font-medium break-words text-ds-ink-900">{theme.label}</span>
                    <button
                      type="button"
                      aria-label={`Retirer ${theme.label}`}
                      onClick={() => setThemes(themes.filter((_, j) => j !== i))}
                      className={clsx(ICON_BUTTON, "hover:bg-ds-danger-100 hover:text-ds-danger-700")}
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className={clsx("flex items-center gap-3 py-2", themes.length > 0 && "border-t border-ds-ink-200")}
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newTheme.trim();
                  if (!label || themes.length >= 12) return;
                  setThemes([...themes, { label, perMonth: 0 }]);
                  setNewTheme("");
                }}
              >
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full text-ds-ink-600 inset-ring inset-ring-ds-ink-450"
                >
                  <Plus size={16} />
                </span>
                <input
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  placeholder="Ajouter une thématique…"
                  aria-label="Ajouter une thématique"
                  className="min-h-11 min-w-0 flex-1 rounded-ds-sm border-none bg-transparent px-1 text-base text-ds-ink-900 placeholder:text-ds-ink-600"
                />
                {newTheme.trim() ? (
                  <Button type="submit" variant="secondary" size="sm">
                    Ajouter
                  </Button>
                ) : null}
              </form>
              {themes.length === 0 ? (
                <p className="py-2 text-ds-body text-ds-ink-600">
                  Ajoutez au moins une thématique — par défaut, vos motifs de consultation.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <p className="text-base text-ds-ink-700">
                Votre formule prévoit environ{" "}
                <strong className="font-semibold text-ds-ink-900">{monthlyQuota} articles par mois</strong>. Répartissez-les selon
                vos priorités.
              </p>
              <ul className="mt-4 space-y-2.5">
                {themes.map((theme, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    {/* Pas de `min-w-0` : le libellé ne descend jamais sous son mot le plus long. Faute de place,
                        c'est le compteur qui passe à la ligne (calé à droite) : aucun mot n'est coupé en deux. */}
                    <span className="max-w-full flex-[1_1_7rem] text-base break-words text-ds-ink-900">{theme.label}</span>
                    <div className="ml-auto flex shrink-0 items-center rounded-full bg-white p-0.5 inset-ring inset-ring-ds-ink-300">
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
                        className={ICON_BUTTON}
                      >
                        <Minus size={18} aria-hidden />
                      </button>
                      <span className="min-w-18 text-center text-ds-body font-semibold text-ds-ink-900 ds-tnum">
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
                        className={ICON_BUTTON}
                      >
                        <Plus size={18} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 min-h-11">
                {total === monthlyQuota ? (
                  <InlineSuccess>Votre répartition est complète.</InlineSuccess>
                ) : (
                  <p role="status" className="rounded-ds-sm bg-ds-ink-100 px-4 py-2.5 text-ds-body text-ds-ink-700">
                    {total < monthlyQuota
                      ? `Encore ${monthlyQuota - total} article${monthlyQuota - total > 1 ? "s" : ""} à répartir.`
                      : `${total - monthlyQuota} article${total - monthlyQuota > 1 ? "s" : ""} au-dessus de votre formule — les premiers de la liste seront privilégiés.`}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        {/* Pied collé au bas de la fenêtre : l'action de l'étape reste visible quand le contenu défile */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-ds-ink-200 bg-white px-5 py-4 sm:px-8 sm:py-5">
          {step > 0 ? (
            <Button variant="quiet" icon={<ArrowLeft size={18} aria-hidden />} onClick={() => setStep(step - 1)}>
              Retour
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button
              iconRight={<ArrowRight size={18} aria-hidden />}
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && themes.length === 0}
            >
              Continuer
            </Button>
          ) : (
            <Button icon={<Check size={18} aria-hidden />} onClick={onSave} loading={saving}>
              Enregistrer
            </Button>
          )}
        </div>
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
