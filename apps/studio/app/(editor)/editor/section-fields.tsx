"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
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
              <Field label={`Point fort ${i + 1} — titre`}>
                <TextInput
                  value={item.title}
                  onChange={(title) =>
                    onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                  }
                />
              </Field>
              <Field label="Texte (1 phrase courte)">
                <TextInput
                  value={item.text ?? ""}
                  onChange={(text) =>
                    onChange({ items: section.items.map((it, j) => (j === i ? { ...it, text } : it)) })
                  }
                />
              </Field>
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
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          <Field label="Introduction">
            <TextArea value={section.intro ?? ""} rows={2} onChange={(intro) => onChange({ intro })} />
          </Field>
          {section.items.map((item, i) => (
            <div key={item.slug} className="space-y-3 rounded-xl bg-cream-100 p-3">
              <IconField
                value={item.icon ?? specialtyIconFor(item.title, i)}
                onChange={(icon) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, icon } : it)) })
                }
              />
              <Field label={`Spécialité ${i + 1} — titre`}>
                <TextInput
                  value={item.title}
                  onChange={(title) =>
                    onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                  }
                />
              </Field>
              <Field label="Résumé de la carte">
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
          <Field label="Titre (question projective)">
            <TextArea value={section.title} rows={2} onChange={(title) => onChange({ title })} />
          </Field>
          <Field label="Phrase d'introduction">
            <TextArea value={section.intro ?? ""} rows={2} onChange={(intro) => onChange({ intro })} />
          </Field>
          {section.bullets.map((bullet, i) => (
            <Field key={i} label={`Bénéfice ✅ ${i + 1}`}>
              <TextArea
                value={bullet}
                rows={2}
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
            </Field>
          ))}
          <AddButton
            label="+ Ajouter un bénéfice"
            onClick={() => onChange({ bullets: [...section.bullets, ""] })}
          />
          <p className="rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
            💡 <strong>**texte**</strong> = passage en gras — mettez le bénéfice clé en gras en début
            de ligne
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
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
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
                <Field label={`Carte ${i + 1} — titre`}>
                  <TextInput
                    value={card.title}
                    onChange={(title) =>
                      onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                    }
                  />
                </Field>
                <Field label="Texte">
                  <TextArea
                    value={card.text}
                    rows={2}
                    onChange={(text) =>
                      onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })
                    }
                  />
                </Field>
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
            <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
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
          <Field label="Titre">
            <TextInput value={section.title} onChange={(title) => onChange({ title })} />
          </Field>
          {section.items.map((item, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-cream-100 p-3">
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
                <Field label={`Carte ${i + 1} — titre`}>
                  <TextInput
                    value={card.title}
                    onChange={(title) =>
                      onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                    }
                  />
                </Field>
                <Field label="Texte">
                  <TextArea
                    value={card.text}
                    rows={2}
                    onChange={(text) =>
                      onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })
                    }
                  />
                </Field>
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
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texte stocké (marqueurs **gras**) → HTML affiché : vrai gras, une div par ligne. */
function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const inner = escapeHtml(line).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return `<div>${inner || "<br>"}</div>`;
    })
    .join("");
}

/** HTML de la zone d'édition → texte stocké (le gras redevient **…**). */
function htmlToText(root: HTMLElement): string {
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const content = Array.from(node.childNodes).map(inline).join("");
    if ((node.tagName === "STRONG" || node.tagName === "B") && content.trim()) {
      return `**${content}**`;
    }
    return content;
  };
  const lines: string[] = [];
  let loose = "";
  for (const child of Array.from(root.childNodes)) {
    const isBlock =
      child instanceof HTMLElement && (child.tagName === "DIV" || child.tagName === "P");
    if (isBlock) {
      if (loose) {
        lines.push(loose);
        loose = "";
      }
      lines.push(inline(child).replace(/\n+$/, ""));
    } else {
      loose += inline(child);
    }
  }
  if (loose) lines.push(loose);
  return lines.join("\n");
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

  function toggleBold() {
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("bold");
    emit();
  }

  function toggleCheck() {
    const el = ref.current;
    if (!el) return;
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
    if (!a && !f) return;
    a = a ?? f;
    f = f ?? a;
    const ia = blocks.indexOf(a as HTMLElement);
    const io = blocks.indexOf(f as HTMLElement);
    const covered = blocks.slice(Math.min(ia, io), Math.max(ia, io) + 1);
    const filled = covered.filter((b) => (b.textContent ?? "").trim().length > 0);
    if (filled.length === 0) return;
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
    emit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      toggleBold();
      return;
    }
    // Seul le gras est proposé : italique et souligné sont neutralisés
    if ((event.ctrlKey || event.metaKey) && ["i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
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
        <div className="flex gap-1">
          {/* onMouseDown + preventDefault : la sélection reste active */}
          <button
            type="button"
            title="Mettre la sélection en gras (Ctrl+B)"
            aria-label="Mettre la sélection en gras"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBold();
            }}
            className="h-7 w-8 rounded-lg border border-ink-300 bg-white text-sm font-bold text-ink-700 transition-colors hover:border-primary-400 hover:text-primary-600"
          >
            B
          </button>
          <button
            type="button"
            title="Transformer la ligne en coche ✅"
            aria-label="Transformer la ligne en coche"
            onMouseDown={(e) => {
              e.preventDefault();
              toggleCheck();
            }}
            className="h-7 w-8 rounded-lg border border-ink-300 bg-white text-sm transition-colors hover:border-primary-400"
          >
            ✅
          </button>
        </div>
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
        className="min-h-36 w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 [&_b]:font-semibold [&_strong]:font-semibold"
      />
      <p className="mt-1.5 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
        💡 Sélectionnez un passage puis <strong>B</strong> (ou Ctrl+B) : il passe en gras
        directement · <strong>✅</strong> transforme la ligne en coche · Entrée passe à la
        ligne, une ligne vide sépare deux paragraphes
      </p>
    </div>
  );
}
