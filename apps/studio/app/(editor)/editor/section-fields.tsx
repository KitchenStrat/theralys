"use client";

import type { ReactNode } from "react";
import type { Section } from "@theralys/shared";

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
          <Field label="Photo (URL)">
            <TextInput
              value={section.imageUrl ?? ""}
              placeholder="https://…"
              onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
            />
          </Field>
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
          <Field label="Photo (URL)">
            <TextInput
              value={section.imageUrl ?? ""}
              placeholder="https://…"
              onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
            />
          </Field>
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

function SectionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="rounded-2xl border border-cream-300">
      <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-cream-100">
        {title}
      </summary>
      <div className="space-y-3 border-t border-cream-200 p-4">{children}</div>
    </details>
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
