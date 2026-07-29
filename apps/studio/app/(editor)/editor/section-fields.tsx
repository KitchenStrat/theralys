"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Section } from "@theralys/shared";
import { CropModal } from "./crop-modal";

/** Libellés des sections, partagés avec l'accordéon de l'éditeur. */
export const SECTION_LABELS: Record<Section["type"], string> = {
  hero: "En-tête (hero)",
  specialties: "Spécialités",
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
}: {
  section: Section;
  onChange: (patch: Partial<Section>) => void;
}) {
  switch (section.type) {
    case "hero":
      return (
        <SectionBox title="En-tête (hero)">
          <Field label="Badge local">
            <TextInput value={section.badge ?? ""} onChange={(badge) => onChange({ badge })} />
          </Field>
          <Field label="Titre principal (H1)">
            <TextArea value={section.title} rows={2} onChange={(title) => onChange({ title })} />
          </Field>
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <Field label="Texte du bouton">
            <TextInput value={section.ctaLabel ?? ""} onChange={(ctaLabel) => onChange({ ctaLabel })} />
          </Field>
        </SectionBox>
      );

    case "specialties":
      return (
        <SectionBox title="Spécialités">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <Field label="Introduction">
            <TextArea value={section.intro ?? ""} rows={2} onChange={(intro) => onChange({ intro })} />
          </Field>
          {section.items.map((item, i) => (
            <Field key={item.slug} label={`Carte « ${item.title} »`}>
              <TextArea
                value={item.excerpt}
                rows={2}
                onChange={(excerpt) =>
                  onChange({
                    items: section.items.map((it, j) => (j === i ? { ...it, excerpt } : it)),
                  })
                }
              />
            </Field>
          ))}
        </SectionBox>
      );

    case "about":
      return (
        <SectionBox title="À propos">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo (votre portrait, votre cabinet…)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
        </SectionBox>
      );

    case "reviews":
      return (
        <SectionBox title="Avis Google">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <p className="text-xs text-ink-500">
            Les avis sont synchronisés depuis votre fiche Google.
          </p>
        </SectionBox>
      );

    case "process":
      return (
        <SectionBox title="Déroulement d'une séance">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          {section.steps.map((step, i) => (
            <div key={i} className="rounded-xl bg-cream-100 p-3">
              <Field label={`Étape ${i + 1} — titre`}>
                <TextInput
                  value={step.title}
                  onChange={(title) =>
                    onChange({ steps: section.steps.map((s, j) => (j === i ? { ...s, title } : s)) })
                  }
                />
              </Field>
              <Field label="Description">
                <TextArea
                  value={step.description}
                  rows={3}
                  onChange={(description) =>
                    onChange({
                      steps: section.steps.map((s, j) => (j === i ? { ...s, description } : s)),
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </SectionBox>
      );

    case "faq":
      return (
        <SectionBox title="Questions fréquentes">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          {section.items.map((item, i) => (
            <div key={i} className="rounded-xl bg-cream-100 p-3">
              <Field label={`Question ${i + 1}`}>
                <TextInput
                  value={item.question}
                  onChange={(question) =>
                    onChange({ items: section.items.map((it, j) => (j === i ? { ...it, question } : it)) })
                  }
                />
              </Field>
              <Field label="Réponse">
                <TextArea
                  value={item.answer}
                  rows={3}
                  onChange={(answer) =>
                    onChange({ items: section.items.map((it, j) => (j === i ? { ...it, answer } : it)) })
                  }
                />
              </Field>
            </div>
          ))}
        </SectionBox>
      );

    case "contact":
      return (
        <SectionBox title="Contact">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <Field label="Adresse">
            <TextInput value={section.address ?? ""} onChange={(address) => onChange({ address })} />
          </Field>
          <Field label="Téléphone">
            <TextInput value={section.phone ?? ""} onChange={(phone) => onChange({ phone })} />
          </Field>
          <Field label="Email">
            <TextInput value={section.email ?? ""} onChange={(email) => onChange({ email })} />
          </Field>
          <Field label="Note pratique (parking, accès…)">
            <TextInput value={section.note ?? ""} onChange={(note) => onChange({ note })} />
          </Field>
        </SectionBox>
      );

    case "richText":
      return (
        <SectionBox title="Contenu de la page">
          {section.title !== undefined ? (
            <Field label="Titre">
              <TextInput value={section.title} onChange={(title) => onChange({ title })} />
            </Field>
          ) : null}
          <Field label="Texte (markdown)">
            <TextArea value={section.body} rows={14} mono onChange={(body) => onChange({ body })} />
          </Field>
        </SectionBox>
      );

    case "cta":
      return (
        <SectionBox title="Bandeau d'appel à l'action">
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <Field label="Texte">
            <TextArea value={section.body ?? ""} rows={2} onChange={(body) => onChange({ body })} />
          </Field>
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

function ParagraphsField({
  paragraphs,
  onChange,
}: {
  paragraphs: string[];
  onChange: (paragraphs: string[]) => void;
}) {
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <Field key={i} label={`Paragraphe ${i + 1}`}>
          <TextArea
            value={paragraph}
            rows={3}
            onChange={(text) => onChange(paragraphs.map((p, j) => (j === i ? text : p)))}
          />
        </Field>
      ))}
    </>
  );
}
