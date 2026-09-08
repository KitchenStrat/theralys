"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SECTION_ICONS, SECTION_ICON_LABELS, specialtyIconFor, type Section } from "@theralys/shared";
import { regenerateMotifPage } from "../../(app)/actions";
import { CropModal } from "./crop-modal";

/** Libellés des sections, partagés avec l'accordéon de l'éditeur. */
export const SECTION_LABELS: Record<Section["type"], string> = {
  hero: "En-tête (hero)",
  highlights: "Points forts",
  specialties: "Spécialités",
  future: "Projection vers l'avenir",
  about: "À propos",
  reviews: "Avis Google",
  process: "Déroulement d'une séance",
  faq: "Questions fréquentes",
  contact: "Contact",
  richText: "Contenu de la page",
  cta: "Bandeau d'appel à l'action",
};

/**
 * Édition structurée d'une section : champs prédéfinis par type de section
 * (textes et URLs d'images) — pas de drag & drop libre, pas de HTML.
 */
export function SectionFields({
  section,
  onChange,
  onPageRegenerated,
}: {
  section: Section;
  onChange: (patch: Partial<Section>) => void;
  /** Appelé après la régénération d'une page de spécialité (rafraîchit l'aperçu). */
  onPageRegenerated?: () => void;
}) {
  switch (section.type) {
    case "hero":
      return (
        <SectionBox title="En-tête (hero)">
          <Field label="Badge local">
            <TextInput value={section.badge ?? ""} onChange={(badge) => onChange({ badge })} />
          </Field>
          <RichField
            label="Titre principal (H1)"
            minHeight="min-h-16"
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <Field label="Texte du bouton">
            <TextInput value={section.ctaLabel ?? ""} onChange={(ctaLabel) => onChange({ ctaLabel })} />
          </Field>
          <p className="text-xs font-medium text-ink-700">Badges chiffrés sur la photo</p>
          {(section.stats ?? []).map((stat, i) => {
            const stats = section.stats ?? [];
            return (
              <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
                <IconField
                  value={stat.icon}
                  onChange={(icon) =>
                    onChange({ stats: stats.map((s, j) => (j === i ? { ...s, icon } : s)) })
                  }
                />
                <Field label="Chiffre / valeur (ex. « +300 », « 7j/7 »)">
                  <TextInput
                    value={stat.value}
                    onChange={(value) =>
                      onChange({ stats: stats.map((s, j) => (j === i ? { ...s, value } : s)) })
                    }
                  />
                </Field>
                <Field label="Légende (ex. « Patients accompagnés »)">
                  <TextInput
                    value={stat.label}
                    onChange={(label) =>
                      onChange({ stats: stats.map((s, j) => (j === i ? { ...s, label } : s)) })
                    }
                  />
                </Field>
                <RemoveButton
                  label="Supprimer ce badge"
                  onClick={() => onChange({ stats: stats.filter((_, j) => j !== i) })}
                />
              </div>
            );
          })}
          <AddButton
            label="+ Ajouter un badge chiffré"
            onClick={() =>
              onChange({ stats: [...(section.stats ?? []), { icon: "etoile", value: "", label: "" }] })
            }
          />
        </SectionBox>
      );

    case "highlights":
      return (
        <SectionBox title="Points forts">
          {section.items.map((item, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
              <IconField
                value={item.icon}
                onChange={(icon) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, icon } : it)) })
                }
              />
              <RichField
                label={`Point fort ${i + 1} — titre`}
                value={item.title}
                onChange={(title) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                }
              />
              <RichField
                label="Texte (1 phrase courte)"
                value={item.text ?? ""}
                onChange={(text) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, text } : it)) })
                }
              />
              {section.items.length > 1 ? (
                <RemoveButton
                  label="Supprimer ce point fort"
                  onClick={() => onChange({ items: section.items.filter((_, j) => j !== i) })}
                />
              ) : null}
            </div>
          ))}
          <AddButton
            label="+ Ajouter un point fort"
            onClick={() =>
              onChange({ items: [...section.items, { icon: "etoile", title: "", text: "" }] })
            }
          />
        </SectionBox>
      );

    case "specialties":
      return (
        <SectionBox title="Spécialités">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          <RichField
            label="Introduction"
            minHeight="min-h-16"
            value={section.intro ?? ""}
            onChange={(intro) => onChange({ intro })}
          />
          {section.items.map((item, i) => (
            <div key={item.slug} className="space-y-3 rounded-xl bg-cream-100 p-3">
              <IconField
                value={item.icon ?? specialtyIconFor(item.title, i)}
                onChange={(icon) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, icon } : it)) })
                }
              />
              <RichField
                label={`Spécialité ${i + 1} — titre`}
                value={item.title}
                onChange={(title) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                }
              />
              <RichField
                label="Résumé de la carte"
                minHeight="min-h-16"
                value={item.excerpt}
                onChange={(excerpt) =>
                  onChange({
                    items: section.items.map((it, j) => (j === i ? { ...it, excerpt } : it)),
                  })
                }
              />
              <RegenerateMotifButton
                slug={item.slug}
                title={item.title}
                excerpt={item.excerpt}
                onDone={onPageRegenerated}
              />
            </div>
          ))}
        </SectionBox>
      );

    case "future":
      return (
        <SectionBox title="Projection vers l'avenir">
          <Field label="Badge (ex. « Santé & Équilibre »)">
            <TextInput value={section.badge ?? ""} onChange={(badge) => onChange({ badge })} />
          </Field>
          <RichField
            label="Titre (question projective)"
            minHeight="min-h-16"
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <RichField
            label="Phrase d'introduction"
            minHeight="min-h-16"
            value={section.intro ?? ""}
            onChange={(intro) => onChange({ intro })}
          />
          {section.bullets.map((bullet, i) => (
            <div key={i}>
              <RichField
                label={`Bénéfice ✅ ${i + 1}`}
                multiline
                minHeight="min-h-16"
                value={bullet}
                onChange={(text) =>
                  onChange({ bullets: section.bullets.map((b, j) => (j === i ? text : b)) })
                }
              />
              {section.bullets.length > 1 ? (
                <div className="mt-1">
                  <RemoveButton
                    label="Supprimer ce bénéfice"
                    onClick={() => onChange({ bullets: section.bullets.filter((_, j) => j !== i) })}
                  />
                </div>
              ) : null}
            </div>
          ))}
          <AddButton
            label="+ Ajouter un bénéfice"
            onClick={() => onChange({ bullets: [...section.bullets, ""] })}
          />
          <p className="rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
            💡 Sélectionnez un passage puis <strong>B</strong> (ou Ctrl+B) : il passe en gras
            directement — mettez le bénéfice clé en gras en début de ligne
          </p>
          <ImageField
            label="Photo (séance avec un(e) patient(e)…)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <Field label="Texte du bouton">
            <TextInput value={section.ctaLabel ?? ""} onChange={(ctaLabel) => onChange({ ctaLabel })} />
          </Field>
        </SectionBox>
      );

    case "about":
      return (
        <SectionBox title="À propos">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo (votre portrait, votre cabinet…)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <p className="text-xs font-medium text-ink-700">Cartes infos pratiques (durée, tarifs…)</p>
          {(section.infoCards ?? []).map((card, i) => {
            const cards = section.infoCards ?? [];
            return (
              <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
                <IconField
                  value={card.icon}
                  onChange={(icon) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, icon } : c)) })
                  }
                />
                <RichField
                  label={`Carte ${i + 1} — titre`}
                  value={card.title}
                  onChange={(title) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                  }
                />
                <RichField
                  label="Texte"
                  multiline
                  minHeight="min-h-16"
                  value={card.text}
                  onChange={(text) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })
                  }
                />
                <RemoveButton
                  label="Supprimer cette carte"
                  onClick={() => onChange({ infoCards: cards.filter((_, j) => j !== i) })}
                />
              </div>
            );
          })}
          <AddButton
            label="+ Ajouter une carte info"
            onClick={() =>
              onChange({
                infoCards: [...(section.infoCards ?? []), { icon: "horloge", title: "", text: "" }],
              })
            }
          />
        </SectionBox>
      );

    case "reviews":
      return (
        <SectionBox title="Avis Google">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          <p className="text-xs text-ink-500">
            Les avis sont synchronisés depuis votre fiche Google.
          </p>
        </SectionBox>
      );

    case "process":
      return (
        <SectionBox title="Déroulement d'une séance">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          {section.steps.map((step, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
              <RichField
                label={`Étape ${i + 1} — titre`}
                value={step.title}
                onChange={(title) =>
                  onChange({ steps: section.steps.map((s, j) => (j === i ? { ...s, title } : s)) })
                }
              />
              <RichField
                label="Description"
                multiline
                minHeight="min-h-20"
                value={step.description}
                onChange={(description) =>
                  onChange({
                    steps: section.steps.map((s, j) => (j === i ? { ...s, description } : s)),
                  })
                }
              />
              {section.steps.length > 1 ? (
                <RemoveButton
                  label="Supprimer cette étape"
                  onClick={() => onChange({ steps: section.steps.filter((_, j) => j !== i) })}
                />
              ) : null}
            </div>
          ))}
          <AddButton
            label="+ Ajouter une étape"
            onClick={() => onChange({ steps: [...section.steps, { title: "", description: "" }] })}
          />
        </SectionBox>
      );

    case "faq":
      return (
        <SectionBox title="Questions fréquentes">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          {section.items.map((item, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
              <RichField
                label={`Question ${i + 1}`}
                value={item.question}
                onChange={(question) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, question } : it)) })
                }
              />
              <RichField
                label="Réponse"
                multiline
                minHeight="min-h-20"
                value={item.answer}
                onChange={(answer) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, answer } : it)) })
                }
              />
              {section.items.length > 1 ? (
                <RemoveButton
                  label="Supprimer cette question"
                  onClick={() => onChange({ items: section.items.filter((_, j) => j !== i) })}
                />
              ) : null}
            </div>
          ))}
          <AddButton
            label="+ Ajouter une question"
            onClick={() => onChange({ items: [...section.items, { question: "", answer: "" }] })}
          />
        </SectionBox>
      );

    case "contact":
      return (
        <SectionBox title="Contact">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          <Field label="Adresse">
            <TextInput value={section.address ?? ""} onChange={(address) => onChange({ address })} />
          </Field>
          <Field label="Téléphone">
            <TextInput value={section.phone ?? ""} onChange={(phone) => onChange({ phone })} />
          </Field>
          <Field label="Email">
            <TextInput value={section.email ?? ""} onChange={(email) => onChange({ email })} />
          </Field>
          <RichField
            label="Note pratique (parking, accès…)"
            value={section.note ?? ""}
            onChange={(note) => onChange({ note })}
          />
          <p className="text-xs text-ink-500">
            La carte interactive et l&apos;encart « Le cabinet » utilisent votre fiche Google
            (onglet Paramètres) ou, à défaut, l&apos;adresse ci-dessus.
          </p>
          <p className="text-xs font-medium text-ink-700">Cartes de rappel (expérience, accès…)</p>
          {(section.infoCards ?? []).map((card, i) => {
            const cards = section.infoCards ?? [];
            return (
              <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
                <IconField
                  value={card.icon}
                  onChange={(icon) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, icon } : c)) })
                  }
                />
                <RichField
                  label={`Carte ${i + 1} — titre`}
                  value={card.title}
                  onChange={(title) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                  }
                />
                <RichField
                  label="Texte"
                  minHeight="min-h-16"
                  value={card.text}
                  onChange={(text) =>
                    onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })
                  }
                />
                <RemoveButton
                  label="Supprimer cette carte"
                  onClick={() => onChange({ infoCards: cards.filter((_, j) => j !== i) })}
                />
              </div>
            );
          })}
          <AddButton
            label="+ Ajouter une carte"
            onClick={() =>
              onChange({
                infoCards: [...(section.infoCards ?? []), { icon: "medaille", title: "", text: "" }],
              })
            }
          />
        </SectionBox>
      );

    case "richText":
      return (
        <SectionBox title="Contenu de la page">
          {section.title !== undefined ? (
            <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          ) : null}
          <Field label="Texte (markdown)">
            <TextArea value={section.body} rows={14} mono onChange={(body) => onChange({ body })} />
          </Field>
        </SectionBox>
      );

    case "cta":
      return (
        <SectionBox title="Bandeau d'appel à l'action">
          <RichField label="Titre" value={section.title} onChange={(title) => onChange({ title })} />
          <RichField
            label="Texte"
            multiline
            minHeight="min-h-16"
            value={section.body ?? ""}
            onChange={(body) => onChange({ body })}
          />
          <Field label="Texte du bouton">
            <TextInput value={section.buttonLabel} onChange={(buttonLabel) => onChange({ buttonLabel })} />
          </Field>
        </SectionBox>
      );
  }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Le titre est porté par l'accordéon de l'éditeur (SiteEditor). */
function SectionBox({ children }: { title?: string; children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

/**
 * Photo d'une section : téléversement (avec recadrage au format) ou URL,
 * avec aperçu.
 */
function ImageField({
  label,
  value,
  onChange,
  aspect = 4 / 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Rapport largeur/hauteur du cadrage (défaut : portrait 4:5) */
  aspect?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toCrop, setToCrop] = useState<File | null>(null);

  async function upload(file: File | Blob, name: string, type: string) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", new File([file], name, { type }));
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Téléversement impossible");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Téléversement impossible — réessayez.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Field label={label}>
      {value ? (
        <img
          src={value}
          alt=""
          className="mb-2 h-28 w-full rounded-xl border border-cream-300 object-cover"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {uploading ? "Envoi en cours…" : "📷 Téléverser une photo"}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-full bg-cream-100 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream-200"
          >
            Retirer
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setToCrop(file);
        }}
      />
      {toCrop ? (
        <CropModal
          file={toCrop}
          aspect={aspect}
          onCancel={() => {
            setToCrop(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          onConfirm={(blob) => {
            setToCrop(null);
            void upload(blob, "photo.jpg", "image/jpeg");
          }}
        />
      ) : null}
      <div className="mt-2">
        <TextInput value={value} placeholder="ou collez une URL https://…" onChange={onChange} />
      </div>
      {error ? <p className="mt-1 text-xs text-danger-500">{error}</p> : null}
    </Field>
  );
}

/** Choix d'une icône d'encart parmi la bibliothèque partagée. */
function IconField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Icône">
      <select
        value={value && (SECTION_ICONS as readonly string[]).includes(value) ? value : "coeur"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      >
        {SECTION_ICONS.map((name) => (
          <option key={name} value={name}>
            {SECTION_ICON_LABELS[name]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Régénère la page de spécialité liée à une carte (titre modifié → nouveau
 * contenu IA + nouvelle photo, mêmes URL ; sujets d'articles re-planifiés).
 */
function RegenerateMotifButton({
  slug,
  title,
  excerpt,
  onDone,
}: {
  slug: string;
  title: string;
  excerpt: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("Régénération en cours… (environ une minute, la page reste en ligne)");
          try {
            const result = await regenerateMotifPage({ slug, title, excerpt });
            if (result.error) setStatus(result.error);
            else {
              setStatus("Page régénérée ✓ — contenu, photo et sujets d'articles mis à jour");
              onDone?.();
            }
          } catch {
            setStatus("La régénération a échoué — réessayez dans un instant.");
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-xl border border-primary-300 px-3 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50 disabled:opacity-50"
      >
        {busy ? "Régénération en cours…" : "↻ Re-générer la page de spécialité"}
      </button>
      {status ? <p className="text-xs text-ink-500">{status}</p> : null}
    </div>
  );
}

/** Lien discret de suppression d'un élément de liste (étape, question, paragraphe). */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="text-right">
      <button type="button" onClick={onClick} className="text-xs text-danger-500 hover:underline">
        {label}
      </button>
    </div>
  );
}

/** Bouton pointillé d'ajout d'un élément de liste. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-dashed border-ink-300 px-3 py-2 text-sm font-medium text-ink-500 hover:border-primary-400 hover:text-primary-500"
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-700">{label}</p>
      {children}
    </div>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
    />
  );
}

function TextArea({
  value,
  rows,
  mono,
  onChange,
}: {
  value: string;
  rows: number;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${mono ? "font-mono" : ""}`}
    />
  );
}

/** Ligne vide = nouveau paragraphe ; les retours simples restent dans le paragraphe. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Seuls ces schémas d'URL sont acceptés en lien (jamais javascript: etc.). */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/|#)/i;
/** Lignes de liste dans le format stocké — mêmes règles que le rendu public. */
const BULLET_LINE = /^[-•]\s+/;
const NUMBER_LINE = /^\d+[.)]\s+/;

/** Une ligne stockée → HTML inline : gras d'abord, [liens](url) dans chaque segment. */
function lineToHtml(line: string): string {
  const linkify = (s: string) =>
    s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      SAFE_LINK.test(url) ? `<a href="${url}">${label}</a>` : match,
    );
  return escapeHtml(line)
    .split(/(\*\*.+?\*\*)/g)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? `<strong>${linkify(part.slice(2, -2))}</strong>`
        : linkify(part),
    )
    .join("");
}

/**
 * Texte stocké → HTML affiché : vrai gras, vrais liens, une div par ligne ;
 * les suites de lignes « - … » / « 1. … » deviennent de vraies listes.
 */
function textToHtml(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const marker = BULLET_LINE.test(line) ? BULLET_LINE : NUMBER_LINE.test(line) ? NUMBER_LINE : null;
    if (!marker) {
      html.push(`<div>${lineToHtml(line) || "<br>"}</div>`);
      i++;
      continue;
    }
    const tag = marker === BULLET_LINE ? "ul" : "ol";
    const items: string[] = [];
    while (i < lines.length && marker.test(lines[i] ?? "")) {
      items.push(`<li>${lineToHtml((lines[i] ?? "").replace(marker, "")) || "<br>"}</li>`);
      i++;
    }
    html.push(`<${tag}>${items.join("")}</${tag}>`);
  }
  return html.join("");
}

/** HTML de la zone d'édition → texte stocké (gras **…**, liens [texte](url), listes). */
function htmlToText(root: HTMLElement): string {
  const inline = (node: Node, inBold: boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    if (node.tagName === "A") {
      // Pas de gras à l'intérieur d'un lien (non représentable) ; on écarte
      // les caractères qui casseraient la syntaxe [texte](url).
      const label = Array.from(node.childNodes)
        .map((child) => inline(child, true))
        .join("")
        .replace(/[[\]]/g, "")
        .replace(/\n+/g, " ")
        .trim();
      const href = (node.getAttribute("href") ?? "")
        .trim()
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\s/g, "%20");
      if (label && SAFE_LINK.test(href)) return `[${label}](${href})`;
      return label;
    }
    const bold = node.tagName === "STRONG" || node.tagName === "B";
    const content = Array.from(node.childNodes)
      .map((child) => inline(child, inBold || bold))
      .join("");
    // Un gras imbriqué dans un gras ne rouvre pas de marqueurs ; un gras
    // multi-lignes est refermé puis rouvert à chaque ligne pour rester
    // analysable par les regex mono-lignes.
    if (bold && !inBold && content.trim()) {
      return content
        .split("\n")
        .map((part) => (part.trim() ? `**${part}**` : part))
        .join("\n");
    }
    return content;
  };

  /** <ul>/<ol> → lignes « - … » / « 1. … » (sous-listes aplaties au même niveau). */
  const listToLines = (list: HTMLElement, ordered: boolean): string[] => {
    const out: string[] = [];
    let n = 0;
    for (const child of Array.from(list.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.tagName === "UL" || child.tagName === "OL") {
        out.push(...listToLines(child, child.tagName === "OL"));
        continue;
      }
      if (child.tagName !== "LI") continue;
      let main = "";
      const nested: string[] = [];
      for (const inner of Array.from(child.childNodes)) {
        if (inner instanceof HTMLElement && (inner.tagName === "UL" || inner.tagName === "OL")) {
          nested.push(...listToLines(inner, inner.tagName === "OL"));
        } else {
          main += inline(inner, false);
        }
      }
      const flat = main.replace(/\n+/g, " ").trim();
      if (flat) {
        n++;
        out.push(ordered ? `${n}. ${flat}` : `- ${flat}`);
      }
      out.push(...nested);
    }
    return out;
  };

  const lines: string[] = [];
  let loose = "";
  const pushLoose = () => {
    if (loose) {
      // Un <br> final (reliquat Firefox) ne doit pas devenir un \n stocké
      lines.push(loose.replace(/\n+$/, ""));
      loose = "";
    }
  };
  /** Un bloc peut contenir une liste imbriquée : texte d'abord, listes ensuite. */
  const pushBlock = (block: HTMLElement) => {
    let main = "";
    const nested: string[] = [];
    for (const child of Array.from(block.childNodes)) {
      if (child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")) {
        nested.push(...listToLines(child, child.tagName === "OL"));
      } else {
        main += inline(child, false);
      }
    }
    const trimmed = main.replace(/\n+$/, "");
    if (trimmed || nested.length === 0) lines.push(trimmed);
    lines.push(...nested);
  };
  for (const child of Array.from(root.childNodes)) {
    if (child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")) {
      pushLoose();
      lines.push(...listToLines(child, child.tagName === "OL"));
      continue;
    }
    if (child instanceof HTMLElement && (child.tagName === "DIV" || child.tagName === "P")) {
      pushLoose();
      pushBlock(child);
      continue;
    }
    loose += inline(child, false);
  }
  pushLoose();
  return lines.join("\n");
}

/**
 * Dépôt (glisser-déposer) forcé en texte brut, inséré au point de dépôt :
 * sans interception, le navigateur insère la version HTML riche (liens,
 * couleurs, listes…) que la sérialisation ne sait pas représenter.
 */
function dropAsPlainText(
  event: DragEvent<HTMLDivElement>,
  el: HTMLElement | null,
  flatten: boolean,
): boolean {
  event.preventDefault();
  if (!el) return false;
  let text = event.dataTransfer.getData("text/plain");
  if (flatten) text = text.replace(/\s*\n+\s*/g, " ");
  if (!text) return false;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const selection = window.getSelection();
  if (!selection) return false;
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(event.clientX, event.clientY);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
  }
  if (!range || !el.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  el.focus();
  document.execCommand("insertText", false, text);
  return true;
}

/**
 * La sélection courante est-elle bien dans cette zone d'édition ? Évite que
 * le bouton B d'un champ mette en gras le texte sélectionné dans un autre
 * (execCommand agit sur la sélection globale du document).
 */
function selectionInside(el: HTMLElement | null): boolean {
  const selection = window.getSelection();
  return Boolean(
    el && selection && selection.rangeCount > 0 && el.contains(selection.anchorNode),
  );
}

// ─── Commandes de mise en forme (partagées par tous les champs riches) ────────

function toggleBoldCmd(el: HTMLElement | null): boolean {
  if (!selectionInside(el)) return false;
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("bold");
  return true;
}

function toggleListCmd(el: HTMLElement | null, ordered: boolean): boolean {
  if (!selectionInside(el)) return false;
  document.execCommand(ordered ? "insertOrderedList" : "insertUnorderedList");
  return true;
}

/** Lien hypertexte sur la sélection — ou retrait du lien sous le curseur. */
function toggleLinkCmd(el: HTMLElement | null): boolean {
  if (!el || !selectionInside(el)) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  let node: Node | null = selection.anchorNode;
  let anchor: HTMLAnchorElement | null = null;
  while (node && node !== el) {
    if (node instanceof HTMLAnchorElement) {
      anchor = node;
      break;
    }
    node = node.parentNode;
  }
  if (anchor) {
    const range = document.createRange();
    range.selectNodeContents(anchor);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("unlink");
    return true;
  }
  if (selection.isCollapsed) {
    window.alert("Sélectionnez d'abord le texte à transformer en lien.");
    return false;
  }
  const input = window.prompt("Adresse du lien (https://… ou /page-du-site)");
  const trimmed = input?.trim();
  if (!trimmed) return false;
  const url = SAFE_LINK.test(trimmed) ? trimmed : `https://${trimmed}`;
  document.execCommand("createLink", false, url);
  return true;
}

/** Préfixe/retire « ✅ » sur la ou les lignes couvertes par la sélection. */
function toggleCheckCmd(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.children.length === 0) el.innerHTML = "<div><br></div>";
  const blocks = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  const selection = window.getSelection();
  const blockOf = (start: Node | null): HTMLElement | null => {
    let n = start;
    while (n && n !== el) {
      if (n.parentNode === el && n instanceof HTMLElement) return n;
      n = n.parentNode;
    }
    return null;
  };
  let a = selection ? blockOf(selection.anchorNode) : null;
  let f = selection ? blockOf(selection.focusNode) : null;
  if (!a && !f) return false;
  a = a ?? f;
  f = f ?? a;
  const ia = blocks.indexOf(a as HTMLElement);
  const io = blocks.indexOf(f as HTMLElement);
  const covered = blocks.slice(Math.min(ia, io), Math.max(ia, io) + 1);
  const filled = covered.filter((b) => (b.textContent ?? "").trim().length > 0);
  if (filled.length === 0) return false;
  const allChecked = filled.every((b) => (b.textContent ?? "").trimStart().startsWith("✅"));
  for (const b of filled) {
    if (allChecked) {
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      const t = walker.nextNode() as Text | null;
      if (t) t.data = t.data.replace(/^\s*✅\s?/, "");
    } else if (!(b.textContent ?? "").trimStart().startsWith("✅")) {
      b.insertBefore(document.createTextNode("✅ "), b.firstChild);
    }
  }
  return true;
}

function ListUlIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      {[3.5, 8, 12.5].map((y) => (
        <g key={y}>
          <circle cx="2.6" cy={y} r="1.3" fill="currentColor" />
          <line x1="6" y1={y} x2="14.5" y2={y} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

function ListOlIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      {(
        [
          [5.5, "1"],
          [10.5, "2"],
          [15.5, "3"],
        ] as const
      ).map(([baseline, digit]) => (
        <g key={digit}>
          <text x="0" y={baseline} fontSize="5.4" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
            {digit}
          </text>
          <line x1="6" y1={baseline - 2} x2="14.5" y2={baseline - 2} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** Styles des éléments riches à l'intérieur des zones d'édition. */
const EDITABLE_RICH_CLASSES =
  "[&_a]:cursor-text [&_a]:text-primary-600 [&_a]:underline [&_b]:font-semibold [&_strong]:font-semibold [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5";

/**
 * Barre d'outils commune des champs riches : gras, coche ✅, lien, listes.
 * `getEl` fournit la zone d'édition ; `onApplied` resérialise après une
 * commande réussie. Boutons sur onMouseDown + preventDefault pour que la
 * sélection reste active.
 */
function RichToolbar({
  getEl,
  onApplied,
  lists,
}: {
  getEl: () => HTMLElement | null;
  onApplied: () => void;
  lists?: boolean;
}) {
  const btn =
    "flex h-7 w-8 items-center justify-center rounded-lg border border-ink-300 bg-white text-sm text-ink-700 transition-colors hover:border-primary-400 hover:text-primary-600";
  const apply =
    (command: (el: HTMLElement | null) => boolean) => (event: { preventDefault: () => void }) => {
      event.preventDefault();
      if (command(getEl())) onApplied();
    };
  return (
    <div className="flex gap-1">
      <button
        type="button"
        title="Mettre la sélection en gras (Ctrl+B)"
        aria-label="Mettre la sélection en gras"
        onMouseDown={apply(toggleBoldCmd)}
        className={`${btn} font-bold`}
      >
        B
      </button>
      <button
        type="button"
        title="Transformer la ligne en coche ✅"
        aria-label="Transformer la ligne en coche"
        onMouseDown={apply(toggleCheckCmd)}
        className={btn}
      >
        ✅
      </button>
      <button
        type="button"
        title="Lien hypertexte sur la sélection (Ctrl+K)"
        aria-label="Ajouter ou retirer un lien hypertexte"
        onMouseDown={apply(toggleLinkCmd)}
        className={btn}
      >
        🔗
      </button>
      {lists ? (
        <>
          <button
            type="button"
            title="Liste à puces"
            aria-label="Liste à puces"
            onMouseDown={apply((el) => toggleListCmd(el, false))}
            className={btn}
          >
            <ListUlIcon />
          </button>
          <button
            type="button"
            title="Liste numérotée"
            aria-label="Liste numérotée"
            onMouseDown={apply((el) => toggleListCmd(el, true))}
            className={btn}
          >
            <ListOlIcon />
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * Un seul champ « Paragraphe », en vrai WYSIWYG : le gras s'affiche en gras
 * (aucun marqueur visible), Entrée passe à la ligne, une ligne vide sépare
 * deux paragraphes. La zone convertit vers le format stocké (tableau de
 * paragraphes avec **gras**) — le rendu côté site ne change pas.
 */
function ParagraphsField({
  paragraphs,
  onChange,
}: {
  paragraphs: string[];
  onChange: (paragraphs: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  // Injection initiale, puis resynchronisation si la valeur change ailleurs
  // (changement de page, régénération) — jamais pendant la frappe.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      lastEmitted.current !== null &&
      splitParagraphs(lastEmitted.current).join("\u0001") === paragraphs.join("\u0001")
    ) {
      return;
    }
    const incoming = paragraphs.join("\n\n");
    el.innerHTML = textToHtml(incoming);
    lastEmitted.current = incoming;
  }, [paragraphs]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const text = htmlToText(el);
    lastEmitted.current = text;
    onChange(splitParagraphs(text));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        if (toggleBoldCmd(ref.current)) emit();
        return;
      }
      if (key === "k") {
        event.preventDefault();
        if (toggleLinkCmd(ref.current)) emit();
        return;
      }
      // Italique et souligné ne font pas partie du format : neutralisés
      if (key === "i" || key === "u") event.preventDefault();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    // Collage en texte brut : pas de HTML importé de Word ou d'ailleurs
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    emit();
  }

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <p className="text-xs font-medium text-ink-700">Paragraphe</p>
        <RichToolbar getEl={() => ref.current} onApplied={emit} lists />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Paragraphe"
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(event) => {
          if (dropAsPlainText(event, ref.current, false)) emit();
        }}
        className={`min-h-36 w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${EDITABLE_RICH_CLASSES}`}
      />
      <p className="mt-1.5 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
        💡 Sélectionnez un passage puis <strong>B</strong> (Ctrl+B) : gras ·{" "}
        <strong>🔗</strong> (Ctrl+K) : lien · <strong>✅</strong> : coche en début de ligne ·
        boutons listes : puces ou numéros · Entrée passe à la ligne, une ligne vide sépare
        deux paragraphes
      </p>
    </div>
  );
}

/**
 * Champ texte riche à valeur simple (string), même mécanique WYSIWYG que le
 * champ Paragraphe : le gras s'affiche en gras et se stocke en **marqueurs**.
 * `multiline` autorise Entrée quand le site affiche les retours à la ligne
 * (whitespace-pre-line) ; sinon les retours sont remplacés par des espaces,
 * comme le rendu public le ferait de toute façon.
 */
function RichField({
  label,
  value,
  onChange,
  multiline = false,
  minHeight = "min-h-10",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  minHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  // Injection initiale, puis resynchronisation seulement quand la valeur
  // change ailleurs (changement de page, suppression d'un élément de liste).
  useEffect(() => {
    const el = ref.current;
    if (!el || lastEmitted.current === value) return;
    el.innerHTML = textToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    let text = htmlToText(el);
    if (!multiline) text = text.replace(/\s*\n+\s*/g, " ");
    // Un champ vidé doit stocker "" (Firefox laisse un <br> résiduel qui
    // deviendrait sinon un espace) : le rendu public masque les champs vides.
    if (!text.trim()) text = "";
    lastEmitted.current = text;
    onChange(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        if (toggleBoldCmd(ref.current)) emit();
        return;
      }
      if (key === "k") {
        event.preventDefault();
        if (toggleLinkCmd(ref.current)) emit();
        return;
      }
      // Italique et souligné ne font pas partie du format : neutralisés
      if (key === "i" || key === "u") {
        event.preventDefault();
        return;
      }
    }
    if (!multiline && event.key === "Enter") event.preventDefault();
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    // Collage en texte brut : pas de HTML importé de Word ou d'ailleurs
    event.preventDefault();
    let text = event.clipboardData.getData("text/plain");
    if (!multiline) text = text.replace(/\s*\n+\s*/g, " ");
    document.execCommand("insertText", false, text);
    emit();
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <p className="text-xs font-medium text-ink-700">{label}</p>
        <RichToolbar getEl={() => ref.current} onApplied={emit} lists={multiline} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        aria-label={label}
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(event) => {
          if (dropAsPlainText(event, ref.current, !multiline)) emit();
        }}
        className={`${minHeight} w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${EDITABLE_RICH_CLASSES}`}
      />
    </div>
  );
}
