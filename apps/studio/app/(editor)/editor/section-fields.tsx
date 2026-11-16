"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  Heading,
  ImageUp,
  Link2,
  List,
  ListOrdered,
  Plus,
  RefreshCw,
  SquareCheckBig,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  SECTION_ICONS,
  SECTION_ICON_CATEGORIES,
  SECTION_ICON_CATEGORY,
  SECTION_ICON_LABELS,
  sectionIconMarkup,
  SECTION_LABELS,
  SECTION_LIMITS,
  futureBodyText,
  searchSectionIcons,
  specialtyIconFor,
  type Section,
  type SectionIconCategory,
  type SectionIconName,
} from "@theralys/shared";
import { Button } from "@/components/ds";
import { moveItem } from "@/lib/editor/move-item";
import { regenerateMotifPage } from "../../(app)/actions";
import { CropModal } from "./crop-modal";
import {
  ActionMessage,
  ADD_BUTTON,
  DANGER_LINK,
  FIELD_BOX,
  FIELD_FOCUS,
  FieldError,
  HINT,
  ICON_BUTTON,
  INPUT,
  LABEL,
  Note,
  ToolRef,
} from "./editor-ui";

/** Libellés des sections : source partagée avec le site public (étiquettes de l'aperçu). */
export { SECTION_LABELS };

/**
 * Édition structurée d'une section : champs prédéfinis par type de section
 * (textes et URLs d'images) — pas de drag & drop libre, pas de HTML.
 */
export function SectionFields({
  section,
  onChange,
  onPageRegenerated,
  googleConnected = false,
}: {
  section: Section;
  onChange: (patch: Partial<Section>) => void;
  /** Appelé après la régénération d'une page de spécialité (rafraîchit l'aperçu). */
  onPageRegenerated?: () => void;
  /** Fiche Google reliée : propose le badge « note Google » du hero */
  googleConnected?: boolean;
}) {
  switch (section.type) {
    case "hero": {
      const stats = section.stats ?? [];
      return (
        <SectionBox>
          <Field label="Badge local" length={visibleLength(section.badge ?? "")} limit={SECTION_LIMITS.badge}>
            <TextInput
              value={section.badge ?? ""}
              limit={SECTION_LIMITS.badge}
              onChange={(badge) => onChange({ badge })}
            />
          </Field>
          <RichField
            label="Titre principal (H1)"
            minHeight="min-h-16"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <Field
            label="Texte du bouton"
            length={visibleLength(section.ctaLabel ?? "")}
            limit={SECTION_LIMITS.buttonLabel}
          >
            <TextInput
              value={section.ctaLabel ?? ""}
              limit={SECTION_LIMITS.buttonLabel}
              onChange={(ctaLabel) => onChange({ ctaLabel })}
            />
          </Field>
          {googleConnected ? (
            <SwitchRow
              label="Afficher la note Google"
              hint="Un badge avec votre note sur 5 et votre nombre d'avis Google, sous le titre, d'après votre fiche reliée."
              checked={section.showGoogleRating === true}
              onChange={(showGoogleRating) => onChange({ showGoogleRating })}
            />
          ) : null}
          <GroupTitle>Badges chiffrés sur la photo</GroupTitle>
          {stats.map((stat, i) => (
            <ListItem
              key={i}
              label={`Badge ${i + 1}`}
              index={i}
              count={stats.length}
              onMove={(to) => onChange({ stats: moveItem(stats, i, to) })}
              removeLabel="Supprimer ce badge"
              onRemove={() => onChange({ stats: stats.filter((_, j) => j !== i) })}
            >
              <IconField
                value={stat.icon}
                onChange={(icon) => onChange({ stats: stats.map((s, j) => (j === i ? { ...s, icon } : s)) })}
              />
              <Field
                label="Chiffre / valeur (ex. « +300 », « 7j/7 »)"
                length={visibleLength(stat.value)}
                limit={SECTION_LIMITS.statValue}
              >
                <TextInput
                  value={stat.value}
                  limit={SECTION_LIMITS.statValue}
                  onChange={(value) => onChange({ stats: stats.map((s, j) => (j === i ? { ...s, value } : s)) })}
                />
              </Field>
              <Field
                label="Légende (ex. « Patients accompagnés »)"
                length={visibleLength(stat.label)}
                limit={SECTION_LIMITS.statLabel}
              >
                <TextInput
                  value={stat.label}
                  limit={SECTION_LIMITS.statLabel}
                  onChange={(label) => onChange({ stats: stats.map((s, j) => (j === i ? { ...s, label } : s)) })}
                />
              </Field>
            </ListItem>
          ))}
          <AddButton
            label="Ajouter un badge chiffré"
            onClick={() => onChange({ stats: [...stats, { icon: "etoile", value: "", label: "" }] })}
          />
        </SectionBox>
      );
    }

    case "highlights":
      return (
        <SectionBox>
          {section.items.map((item, i) => (
            <ListItem
              key={i}
              label={`Point fort ${i + 1}`}
              index={i}
              count={section.items.length}
              onMove={(to) => onChange({ items: moveItem(section.items, i, to) })}
              removeLabel="Supprimer ce point fort"
              onRemove={
                section.items.length > 1
                  ? () => onChange({ items: section.items.filter((_, j) => j !== i) })
                  : undefined
              }
            >
              <IconField
                value={item.icon}
                onChange={(icon) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, icon } : it)) })
                }
              />
              <RichField
                label="Titre"
                limit={SECTION_LIMITS.cardTitle}
                value={item.title}
                onChange={(title) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                }
              />
              <RichField
                label="Texte (1 phrase courte)"
                limit={SECTION_LIMITS.cardText}
                value={item.text ?? ""}
                onChange={(text) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, text } : it)) })
                }
              />
            </ListItem>
          ))}
          <AddButton
            label="Ajouter un point fort"
            onClick={() =>
              onChange({ items: [...section.items, { icon: "etoile", title: "", text: "" }] })
            }
          />
        </SectionBox>
      );

    case "specialties":
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <RichField
            label="Introduction"
            minHeight="min-h-16"
            limit={SECTION_LIMITS.excerpt}
            value={section.intro ?? ""}
            onChange={(intro) => onChange({ intro })}
          />
          {section.items.map((item, i) => (
            <ListItem
              key={item.slug}
              label={`Spécialité ${i + 1}`}
              index={i}
              count={section.items.length}
              onMove={(to) => onChange({ items: moveItem(section.items, i, to) })}
            >
              <IconField
                value={item.icon ?? specialtyIconFor(item.title, i)}
                onChange={(icon) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, icon } : it)) })
                }
              />
              <RichField
                label="Titre"
                limit={SECTION_LIMITS.cardTitle}
                value={item.title}
                onChange={(title) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, title } : it)) })
                }
              />
              <RichField
                label="Résumé de la carte"
                minHeight="min-h-16"
                limit={SECTION_LIMITS.excerpt}
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
            </ListItem>
          ))}
        </SectionBox>
      );

    case "future":
      return (
        <SectionBox>
          <Field
            label="Badge (ex. « Santé & Équilibre »)"
            length={visibleLength(section.badge ?? "")}
            limit={SECTION_LIMITS.badge}
          >
            <TextInput
              value={section.badge ?? ""}
              limit={SECTION_LIMITS.badge}
              onChange={(badge) => onChange({ badge })}
            />
          </Field>
          <RichField
            label="Titre (question projective)"
            minHeight="min-h-16"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <RichField
            label="Texte (introduction + liste à puces)"
            multiline
            minHeight="min-h-48"
            limit={SECTION_LIMITS.body}
            value={futureBodyText(section)}
            onChange={(body) => onChange({ body })}
            hint={
              <>
                La première ligne sert d&apos;introduction. Ensuite, une ligne par bénéfice avec{" "}
                <ToolRef icon={List}>Liste à puces</ToolRef>, et le début de chaque ligne en{" "}
                <ToolRef icon={Bold}>Gras</ToolRef>.
              </>
            }
          />
          <ImageField
            label="Photo (séance avec un(e) patient(e)…)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <Field
            label="Texte du bouton"
            length={visibleLength(section.ctaLabel ?? "")}
            limit={SECTION_LIMITS.buttonLabel}
          >
            <TextInput
              value={section.ctaLabel ?? ""}
              limit={SECTION_LIMITS.buttonLabel}
              onChange={(ctaLabel) => onChange({ ctaLabel })}
            />
          </Field>
        </SectionBox>
      );

    case "about": {
      const cards = section.infoCards ?? [];
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <ParagraphsField paragraphs={section.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
          <ImageField
            label="Photo (votre portrait, votre cabinet…)"
            value={section.imageUrl ?? ""}
            onChange={(imageUrl) => onChange({ imageUrl: imageUrl || undefined })}
          />
          <GroupTitle>Cartes infos pratiques (durée, tarifs…)</GroupTitle>
          {cards.map((card, i) => (
            <ListItem
              key={i}
              label={`Carte ${i + 1}`}
              index={i}
              count={cards.length}
              onMove={(to) => onChange({ infoCards: moveItem(cards, i, to) })}
              removeLabel="Supprimer cette carte"
              onRemove={() => onChange({ infoCards: cards.filter((_, j) => j !== i) })}
            >
              <IconField
                value={card.icon}
                onChange={(icon) => onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, icon } : c)) })}
              />
              <RichField
                label="Titre"
                limit={SECTION_LIMITS.cardTitle}
                value={card.title}
                onChange={(title) =>
                  onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                }
              />
              <RichField
                label="Texte"
                multiline
                minHeight="min-h-16"
                limit={SECTION_LIMITS.cardText}
                value={card.text}
                onChange={(text) => onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })}
              />
            </ListItem>
          ))}
          <AddButton
            label="Ajouter une carte info"
            onClick={() => onChange({ infoCards: [...cards, { icon: "horloge", title: "", text: "" }] })}
          />
        </SectionBox>
      );
    }

    case "reviews":
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <RichField
            label="Introduction (facultative)"
            minHeight="min-h-16"
            limit={SECTION_LIMITS.excerpt}
            value={section.intro ?? ""}
            onChange={(intro) => onChange({ intro })}
          />
          <Note tone="info">Les avis sont synchronisés depuis votre fiche Google.</Note>
        </SectionBox>
      );

    case "process":
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          {section.steps.map((step, i) => (
            <ListItem
              key={i}
              label={`Étape ${i + 1}`}
              index={i}
              count={section.steps.length}
              onMove={(to) => onChange({ steps: moveItem(section.steps, i, to) })}
              removeLabel="Supprimer cette étape"
              onRemove={
                section.steps.length > 1
                  ? () => onChange({ steps: section.steps.filter((_, j) => j !== i) })
                  : undefined
              }
            >
              <RichField
                label="Titre"
                limit={SECTION_LIMITS.stepTitle}
                value={step.title}
                onChange={(title) =>
                  onChange({ steps: section.steps.map((s, j) => (j === i ? { ...s, title } : s)) })
                }
              />
              <RichField
                label="Description"
                multiline
                minHeight="min-h-20"
                limit={SECTION_LIMITS.stepDescription}
                value={step.description}
                onChange={(description) =>
                  onChange({
                    steps: section.steps.map((s, j) => (j === i ? { ...s, description } : s)),
                  })
                }
              />
            </ListItem>
          ))}
          <AddButton
            label="Ajouter une étape"
            onClick={() => onChange({ steps: [...section.steps, { title: "", description: "" }] })}
          />
        </SectionBox>
      );

    case "faq":
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          {section.items.map((item, i) => (
            <ListItem
              key={i}
              label={`Question ${i + 1}`}
              index={i}
              count={section.items.length}
              onMove={(to) => onChange({ items: moveItem(section.items, i, to) })}
              removeLabel="Supprimer cette question"
              onRemove={
                section.items.length > 1
                  ? () => onChange({ items: section.items.filter((_, j) => j !== i) })
                  : undefined
              }
            >
              <RichField
                label="Question"
                limit={SECTION_LIMITS.faqQuestion}
                value={item.question}
                onChange={(question) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, question } : it)) })
                }
              />
              <RichField
                label="Réponse"
                multiline
                minHeight="min-h-20"
                limit={SECTION_LIMITS.faqAnswer}
                value={item.answer}
                onChange={(answer) =>
                  onChange({ items: section.items.map((it, j) => (j === i ? { ...it, answer } : it)) })
                }
              />
            </ListItem>
          ))}
          <AddButton
            label="Ajouter une question"
            onClick={() => onChange({ items: [...section.items, { question: "", answer: "" }] })}
          />
        </SectionBox>
      );

    case "contact": {
      const hours = section.hours ?? [];
      const cards = section.infoCards ?? [];
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
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
            limit={SECTION_LIMITS.note}
            value={section.note ?? ""}
            onChange={(note) => onChange({ note })}
          />
          <Note tone="info">
            La carte interactive et l&apos;encart « Le cabinet » utilisent votre fiche Google
            (onglet Paramètres) ou, à défaut, l&apos;adresse ci-dessus.
          </Note>

          <GroupTitle>Horaires</GroupTitle>
          {hours.map((slot, i) => (
            <ListItem
              key={i}
              label={`Horaire ${i + 1}`}
              index={i}
              count={hours.length}
              onMove={(to) => onChange({ hours: moveItem(hours, i, to) })}
              removeLabel="Supprimer cet horaire"
              onRemove={() => onChange({ hours: hours.filter((_, j) => j !== i) })}
            >
              <div className="grid grid-cols-2 gap-2">
                <Field label="Jours" length={visibleLength(slot.label)} limit={SECTION_LIMITS.hoursLabel}>
                  <TextInput
                    value={slot.label}
                    placeholder="Lundi – Vendredi"
                    limit={SECTION_LIMITS.hoursLabel}
                    onChange={(label) => onChange({ hours: hours.map((h, j) => (j === i ? { ...h, label } : h)) })}
                  />
                </Field>
                <Field label="Heures" length={visibleLength(slot.value)} limit={SECTION_LIMITS.hoursValue}>
                  <TextInput
                    value={slot.value}
                    placeholder="9h – 19h"
                    limit={SECTION_LIMITS.hoursValue}
                    onChange={(value) => onChange({ hours: hours.map((h, j) => (j === i ? { ...h, value } : h)) })}
                  />
                </Field>
              </div>
            </ListItem>
          ))}
          <AddButton
            label="Ajouter un horaire"
            onClick={() => onChange({ hours: [...hours, { label: "", value: "" }] })}
          />

          <GroupTitle>Cartes de rappel (expérience, accès…)</GroupTitle>
          {cards.map((card, i) => (
            <ListItem
              key={i}
              label={`Carte ${i + 1}`}
              index={i}
              count={cards.length}
              onMove={(to) => onChange({ infoCards: moveItem(cards, i, to) })}
              removeLabel="Supprimer cette carte"
              onRemove={() => onChange({ infoCards: cards.filter((_, j) => j !== i) })}
            >
              <IconField
                value={card.icon}
                onChange={(icon) => onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, icon } : c)) })}
              />
              <RichField
                label="Titre"
                limit={SECTION_LIMITS.cardTitle}
                value={card.title}
                onChange={(title) =>
                  onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, title } : c)) })
                }
              />
              <RichField
                label="Texte"
                minHeight="min-h-16"
                limit={SECTION_LIMITS.cardText}
                value={card.text}
                onChange={(text) => onChange({ infoCards: cards.map((c, j) => (j === i ? { ...c, text } : c)) })}
              />
            </ListItem>
          ))}
          <AddButton
            label="Ajouter une carte"
            onClick={() => onChange({ infoCards: [...cards, { icon: "medaille", title: "", text: "" }] })}
          />
        </SectionBox>
      );
    }

    case "richText":
      return (
        <SectionBox>
          {section.title !== undefined ? (
            <RichField
              label="Titre"
              limit={SECTION_LIMITS.title}
              value={section.title}
              onChange={(title) => onChange({ title })}
            />
          ) : null}
          <RichField
            label="Texte de la page"
            multiline
            headings
            minHeight="min-h-96"
            hint={
              <>
                <ToolRef icon={Heading}>Titre</ToolRef> transforme la ligne en titre de section.{" "}
                <FormattingHelp />
              </>
            }
            value={section.body}
            onChange={(body) => onChange({ body })}
          />
        </SectionBox>
      );

    case "cta":
      return (
        <SectionBox>
          <RichField
            label="Titre"
            limit={SECTION_LIMITS.title}
            value={section.title}
            onChange={(title) => onChange({ title })}
          />
          <RichField
            label="Texte"
            multiline
            minHeight="min-h-16"
            limit={SECTION_LIMITS.excerpt}
            value={section.body ?? ""}
            onChange={(body) => onChange({ body })}
          />
          <Field label="Texte du bouton" length={visibleLength(section.buttonLabel)} limit={SECTION_LIMITS.buttonLabel}>
            <TextInput
              value={section.buttonLabel}
              limit={SECTION_LIMITS.buttonLabel}
              onChange={(buttonLabel) => onChange({ buttonLabel })}
            />
          </Field>
        </SectionBox>
      );
  }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Le titre est porté par l'accordéon de l'éditeur (SiteEditor). */
function SectionBox({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

/** Intertitre d'un groupe d'éléments dans le formulaire d'une section (badges, horaires, cartes). */
function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="border-t border-ds-ink-200 pt-4 font-ds-display text-ds-body font-bold text-ds-ink-900">{children}</h4>
  );
}

/**
 * Mode d'emploi de la barre de mise en forme, sous un champ de texte long :
 * chaque bouton est rappelé par son pictogramme et son nom.
 */
function FormattingHelp() {
  return (
    <>
      Sélectionnez un passage, puis <ToolRef icon={Bold}>Gras</ToolRef> (Ctrl+B) ou{" "}
      <ToolRef icon={Link2}>Lien</ToolRef> (Ctrl+K). <ToolRef icon={SquareCheckBig}>Coche</ToolRef> ajoute une coche en
      début de ligne ; <ToolRef icon={List}>Puces</ToolRef> et <ToolRef icon={ListOrdered}>Numéros</ToolRef> créent une
      liste. Entrée passe à la ligne, une ligne vide sépare deux paragraphes.
    </>
  );
}

/**
 * Compteur de caractères « 52 / 60 » : repère de lisibilité (SECTION_LIMITS),
 * orange au-delà — la saisie n'est pas bloquée (maxLength = limite × 1,5).
 */
/**
 * Longueur « lue » d'un champ : sans les marqueurs de gras `**`, en
 * caractères Unicode (un emoji composé compte 1, pas 2 ou 5).
 */
export function visibleLength(value: string | undefined): number {
  return [...(value ?? "").replace(/\*\*/g, "")].length;
}

export function CharCounter({ length, limit }: { length: number; limit: number }) {
  const over = length > limit;
  return (
    <span
      aria-live="polite"
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 text-xs font-normal ds-tnum",
        // Au-delà du repère : un pictogramme et la graisse doublent la couleur
        over ? "font-semibold text-ds-warning-700" : "text-ds-ink-600",
      )}
      title={over ? `Au-delà de la longueur conseillée (${limit} caractères)` : `Longueur conseillée : ${limit} caractères`}
    >
      {over ? <TriangleAlert size={12} strokeWidth={2.5} aria-hidden /> : null}
      {length} / {limit}
    </span>
  );
}

/** `maxLength` tolérant : 1,5 × la longueur conseillée, pour ne jamais bloquer une saisie en cours. */
export function softMaxLength(limit: number): number {
  return Math.ceil(limit * 1.5);
}

/** Interrupteur accessible (role="switch") — cartes de l'accordéon, paramètres. */
export function ToggleSwitch({
  checked,
  label,
  onChange,
  size = "md",
  className,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const small = size === "sm";
  // Le bouton porte la cible (44 px au doigt) ; la piste est dessinée à l'intérieur. Trois indices
  // pour « activé » : la position du curseur, sa coche, la couleur de la section.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full ds-focus pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx("relative block rounded-full", small ? "h-6 w-10" : "h-7 w-12", checked ? "bg-ds-section-accent" : "bg-ds-ink-450")}
      >
        <span
          className={clsx(
            "absolute left-0.5 top-0.5 grid place-items-center rounded-full bg-white text-ds-section-accent shadow-sm motion-safe:transition-transform motion-safe:duration-ds-base motion-safe:ease-ds-out",
            small ? "size-5" : "size-6",
            checked && (small ? "translate-x-4" : "translate-x-5"),
          )}
        >
          {checked ? <Check size={small ? 12 : 14} strokeWidth={3} /> : null}
        </span>
      </span>
    </button>
  );
}

/** Ligne « libellé + explication + interrupteur » dans un formulaire de section. */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-ds-sm bg-ds-ink-50 px-3 py-2.5 ring-1 ring-ds-ink-200">
      <div className="min-w-0 flex-1">
        <p className={LABEL}>{label}</p>
        {hint ? <p className={clsx("mt-0.5", HINT)}>{hint}</p> : null}
      </div>
      <ToggleSwitch checked={checked} label={label} onChange={onChange} size="sm" />
    </div>
  );
}

/**
 * Élément d'une liste ordonnée (badge, point fort, étape, question, horaire,
 * carte) : en-tête avec flèches ↑↓ de réordonnancement, champs, suppression.
 */
function ListItem({
  label,
  index,
  count,
  onMove,
  removeLabel,
  onRemove,
  children,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  removeLabel?: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const arrow = clsx(ICON_BUTTON, "bg-white inset-ring inset-ring-ds-ink-300 hover:bg-ds-brand-50 disabled:hover:bg-white");
  return (
    <div className="space-y-3 rounded-ds-sm bg-ds-ink-50 p-3 ring-1 ring-ds-ink-200">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <p className="text-ds-body font-bold text-ds-ink-900">{label}</p>
        {count > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Monter : ${label}`}
              title="Monter"
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
              className={arrow}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Descendre : ${label}`}
              title="Descendre"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
              className={arrow}
            >
              <ArrowDown size={16} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      {children}
      {onRemove && removeLabel ? <RemoveButton label={removeLabel} onClick={onRemove} /> : null}
    </div>
  );
}

/** Dessin d'une icône de la bibliothèque partagée (balisage du dépôt, jamais de saisie utilisateur). */
export function IconGlyph({
  name,
  size = 20,
  className,
}: {
  name: SectionIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden
      className={className}
    >
      <g dangerouslySetInnerHTML={{ __html: sectionIconMarkup(name) }} />
    </svg>
  );
}

function isIconName(value: string | undefined): value is SectionIconName {
  return value !== undefined && (SECTION_ICONS as readonly string[]).includes(value);
}

/**
 * Choix d'une icône d'encart : bouton (icône courante + libellé) ouvrant un
 * sélecteur — recherche, catégories, grille — utilisable au clavier
 * (Échap ferme, chaque icône est un bouton nommé).
 */
export function IconField({
  value,
  onChange,
  label = "Icône",
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  label?: string;
}) {
  const current: SectionIconName = isIconName(value) ? value : "coeur";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** Ferme le sélecteur ; `restoreFocus` ramène le focus sur le bouton (clavier). */
  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <Field label={label}>
      <div
        ref={rootRef}
        className="relative"
        onBlur={(event) => {
          // Le focus quitte le sélecteur (Tab après la dernière icône) : on le ferme
          if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label} : ${SECTION_ICON_LABELS[current]} — changer`}
          onClick={() => setOpen((o) => !o)}
          className={clsx(FIELD_BOX, FIELD_FOCUS, "flex min-h-11 items-center gap-2.5 py-1.5 text-left")}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[0.625rem] bg-ds-section-tint-2 text-ds-section-accent">
            <IconGlyph name={current} size={18} />
          </span>
          <span className="min-w-0 flex-1 truncate">{SECTION_ICON_LABELS[current]}</span>
          {open ? (
            <ChevronUp size={18} aria-hidden className="shrink-0 text-ds-ink-600" />
          ) : (
            <ChevronDown size={18} aria-hidden className="shrink-0 text-ds-ink-600" />
          )}
        </button>
        {open ? (
          <IconPickerPopover
            value={current}
            onSelect={(name) => {
              onChange(name);
              close(true);
            }}
          />
        ) : null}
      </div>
    </Field>
  );
}

function IconPickerPopover({
  value,
  onSelect,
}: {
  value: SectionIconName;
  onSelect: (name: SectionIconName) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SectionIconCategory | null>(null);
  const results = searchSectionIcons(query, category);
  // Catégorie active : le fond plein, la graisse et une coche (jamais la couleur seule)
  const chip = (active: boolean) =>
    clsx(
      "inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-ds-meta ds-focus pointer-coarse:min-h-11",
      active
        ? "bg-ds-section-ink font-semibold text-white"
        : "bg-ds-ink-100 font-medium text-ds-ink-700 hover:bg-ds-ink-200 hover:text-ds-ink-900",
    );
  const chipMark = (active: boolean) => (active ? <Check size={13} strokeWidth={3} aria-hidden /> : null);

  return (
    <div
      role="dialog"
      aria-label="Choisir une icône"
      className="absolute -left-1 -right-1 top-full z-30 mt-1.5 rounded-ds-md bg-white p-3 shadow-ds-pop ring-1 ring-ds-ink-200 ds-fade-in"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher (sommeil, tarif, dos…)"
        aria-label="Rechercher une icône"
        className={INPUT}
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Catégories">
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)} className={chip(category === null)}>
          {chipMark(category === null)}
          Toutes
        </button>
        {SECTION_ICON_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? null : c.id)}
            className={chip(category === c.id)}
          >
            {chipMark(category === c.id)}
            {c.label}
          </button>
        ))}
      </div>
      {results.length > 0 ? (
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5" role="listbox" aria-label="Icônes">
          {results.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={name === value}
              aria-label={SECTION_ICON_LABELS[name]}
              title={`${SECTION_ICON_LABELS[name]} · ${SECTION_ICON_CATEGORIES.find((c) => c.id === SECTION_ICON_CATEGORY[name])?.label ?? ""}`}
              onClick={() => onSelect(name)}
              className={clsx(
                "grid aspect-square min-h-11 place-items-center rounded-ds-sm ds-focus",
                // Icône choisie : fond teinté et liseré épais à l'accent de la section
                name === value
                  ? "bg-ds-section-tint-2 text-ds-section-ink inset-ring-2 inset-ring-ds-section-accent"
                  : "text-ds-ink-700 inset-ring inset-ring-ds-ink-200 hover:bg-ds-section-tint hover:text-ds-section-ink hover:inset-ring-ds-section-line",
              )}
            >
              <IconGlyph name={name} size={22} />
            </button>
          ))}
        </div>
      ) : (
        <p className={clsx("mt-3 text-center", HINT)}>Aucune icône ne correspond à « {query.trim()} ».</p>
      )}
    </div>
  );
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
        <img src={value} alt="" className="mb-2.5 h-32 w-full rounded-ds-sm object-cover ring-1 ring-ds-ink-200" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          icon={<ImageUp size={16} aria-hidden />}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Envoi en cours…" : "Téléverser une photo"}
        </Button>
        {value ? (
          <Button type="button" variant="quiet" size="sm" icon={<X size={16} aria-hidden />} onClick={() => onChange("")}>
            Retirer
          </Button>
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
      <div className="mt-2.5">
        <TextInput
          value={value}
          placeholder="ou collez une URL https://…"
          ariaLabel={`${label} : adresse de l'image (URL)`}
          onChange={onChange}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
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
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy}
        icon={<RefreshCw size={16} aria-hidden />}
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
        className="w-full"
      >
        {busy ? "Régénération en cours…" : "Re-générer la page de spécialité"}
      </Button>
      {/* En cours : une information ; ensuite, la réussite (« Page régénérée ✓ … ») ou l'erreur rendue par le service */}
      {status ? (
        <ActionMessage tone={busy ? "info" : status.startsWith("Page régénérée") ? "success" : "error"}>{status}</ActionMessage>
      ) : null}
    </div>
  );
}

/** Lien discret de suppression d'un élément de liste (étape, question, paragraphe). */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button type="button" onClick={onClick} className={DANGER_LINK}>
        <Trash2 size={15} aria-hidden />
        {label}
      </button>
    </div>
  );
}

/** Bouton pointillé d'ajout d'un élément de liste. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={ADD_BUTTON}>
      <Plus size={18} aria-hidden />
      {label}
    </button>
  );
}

/** Identifiant du libellé du `Field` englobant : le champ qu'il contient s'en sert comme nom accessible. */
const FieldLabelContext = createContext<string | undefined>(undefined);

function Field({
  label,
  length,
  limit,
  children,
}: {
  label: string;
  /** Avec `limit` : compteur « n / limite » à droite du libellé */
  length?: number;
  limit?: number;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p id={labelId} className={LABEL}>
          {label}
        </p>
        {limit !== undefined && length !== undefined ? <CharCounter length={length} limit={limit} /> : null}
      </div>
      <FieldLabelContext.Provider value={labelId}>{children}</FieldLabelContext.Provider>
    </div>
  );
}

function TextInput({
  value,
  placeholder,
  limit,
  ariaLabel,
  onChange,
}: {
  value: string;
  placeholder?: string;
  /** Longueur conseillée : la saisie est plafonnée à 1,5 × cette valeur */
  limit?: number;
  /** Nom accessible propre au champ ; sans lui, celui du `Field` englobant */
  ariaLabel?: string;
  onChange: (value: string) => void;
}) {
  const labelId = useContext(FieldLabelContext);
  return (
    <input
      value={value}
      placeholder={placeholder}
      maxLength={limit !== undefined ? softMaxLength(limit) : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelId}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT}
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
const NUMBER_LINE = /^\d{1,2}[.)]\s+/; // 1-2 chiffres : « 1993. Année… » reste du texte

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
function textToHtml(text: string, withLists = true, withHeadings = false): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (withHeadings) {
      const heading = /^(#{2,3})\s+(.*)$/.exec(line);
      if (heading) {
        const tag = heading[1] === "##" ? "h2" : "h3";
        html.push(`<${tag}>${lineToHtml(heading[2] ?? "") || "<br>"}</${tag}>`);
        i++;
        continue;
      }
    }
    // Une liste numérotée ne démarre qu'à « 1. » : « 3) suite » ou
    // « 10. rue de la République » restent du texte ordinaire.
    const marker = !withLists
      ? null
      : BULLET_LINE.test(line)
        ? BULLET_LINE
        : /^1[.)]\s+/.test(line)
          ? NUMBER_LINE
          : null;
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
        .replace(/[[\]*]/g, "")
        .replace(/\n+/g, " ")
        .trim();
      const href = (node.getAttribute("href") ?? "")
        .trim()
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\*/g, "%2A")
        .replace(/\s/g, "%20");
      if (label && SAFE_LINK.test(href)) return `[${label}](${href})`;
      // Libellé inutilisable : on garde au moins l'adresse en texte visible
      return label || node.textContent?.trim() || href;
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
    if (child instanceof HTMLElement && /^H[1-6]$/.test(child.tagName)) {
      pushLoose();
      const level = child.tagName === "H3" || child.tagName === "H4" ? "###" : "##";
      const inner = inline(child, false).replace(/\n+/g, " ").trim();
      lines.push(inner ? `${level} ${inner}` : "");
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
  if (!el || !selectionInside(el)) return false;
  // Le gras à l'intérieur d'un lien n'est pas représentable dans le format
  // stocké : on refuse plutôt que d'afficher un état qui ne serait pas gardé.
  const selection = window.getSelection();
  const inLink = (start: Node | null): boolean => {
    let n: Node | null = start;
    while (n && n !== el) {
      if (n instanceof HTMLAnchorElement) return true;
      n = n.parentNode;
    }
    return false;
  };
  if (selection && (inLink(selection.anchorNode) || inLink(selection.focusNode))) return false;
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

/** Transforme la ligne courante en titre de section (## …) — ou l'inverse. */
function toggleHeadingCmd(el: HTMLElement | null): boolean {
  if (!el || !selectionInside(el)) return false;
  const selection = window.getSelection();
  let node: Node | null = selection?.anchorNode ?? null;
  let inHeading = false;
  while (node && node !== el) {
    if (node instanceof HTMLElement) {
      if (/^H[1-6]$/.test(node.tagName)) inHeading = true;
      if (node.tagName === "LI") return false; // pas de titre dans une liste
    }
    node = node.parentNode;
  }
  document.execCommand("formatBlock", false, inHeading ? "div" : "h2");
  return true;
}

/** Préfixe/retire « ✅ » sur la ou les lignes couvertes par la sélection. */
function toggleCheckCmd(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.children.length === 0) el.innerHTML = "<div><br></div>";
  // Reliquat d'une liste retirée : du texte flottant à la racine — on
  // l'enveloppe dans un <div> pour qu'il redevienne une ligne cochable
  // (les nœuds sont déplacés, pas recréés : la sélection reste valide).
  for (const node of Array.from(el.childNodes)) {
    if (node.parentNode !== el) continue; // déjà absorbé par un wrapper précédent
    const isBlock =
      node instanceof HTMLElement && ["DIV", "P", "UL", "OL"].includes(node.tagName);
    if (isBlock) continue;
    const wrapper = document.createElement("div");
    node.replaceWith(wrapper);
    wrapper.appendChild(node);
    // Regroupe les nœuds inline consécutifs dans la même ligne
    while (
      wrapper.nextSibling &&
      !(
        wrapper.nextSibling instanceof HTMLElement &&
        ["DIV", "P", "UL", "OL"].includes(wrapper.nextSibling.tagName)
      )
    ) {
      wrapper.appendChild(wrapper.nextSibling);
    }
  }
  // Une « ligne » est un enfant direct… ou un <li> à l'intérieur d'une liste :
  // insérer le ✅ dans le <li> (jamais directement dans le <ul>, que la
  // sérialisation ignorerait).
  const blocks: HTMLElement[] = [];
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.tagName === "UL" || child.tagName === "OL") {
      for (const li of Array.from(child.querySelectorAll("li"))) blocks.push(li);
    } else {
      blocks.push(child);
    }
  }
  const selection = window.getSelection();
  const blockOf = (start: Node | null): HTMLElement | null => {
    let n: Node | null = start;
    while (n && n !== el) {
      if (n instanceof HTMLElement && blocks.includes(n)) return n;
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

/** Styles des éléments riches à l'intérieur des zones d'édition. */
const EDITABLE_RICH_CLASSES =
  "[&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-bold [&_a]:cursor-text [&_a]:text-ds-brand-700 [&_a]:underline [&_b]:font-semibold [&_strong]:font-semibold [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5";

/** Zone d'édition (`contentEditable`) : la boîte d'un champ, interligne aéré. */
const EDITABLE_BOX = clsx(FIELD_BOX, FIELD_FOCUS, "leading-relaxed", EDITABLE_RICH_CLASSES);

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
  headings,
}: {
  getEl: () => HTMLElement | null;
  onApplied: () => void;
  lists?: boolean;
  headings?: boolean;
}) {
  const btn =
    "inline-grid h-8 w-9 shrink-0 place-items-center rounded-[0.625rem] bg-white text-ds-ink-700 inset-ring inset-ring-ds-ink-300 ds-focus ds-press hover:bg-ds-section-tint hover:text-ds-section-ink hover:inset-ring-ds-section-line pointer-coarse:size-11";
  const apply =
    (command: (el: HTMLElement | null) => boolean) =>
    (event: { preventDefault: () => void; button: number }) => {
      event.preventDefault();
      if (event.button !== 0) return; // clic gauche uniquement
      if (command(getEl())) onApplied();
    };
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Mise en forme">
      {headings ? (
        <button
          type="button"
          title="Transformer la ligne en titre de section"
          aria-label="Transformer la ligne en titre de section"
          onMouseDown={apply(toggleHeadingCmd)}
          className={btn}
        >
          <Heading size={16} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        title="Mettre la sélection en gras (Ctrl+B)"
        aria-label="Mettre la sélection en gras"
        onMouseDown={apply(toggleBoldCmd)}
        className={btn}
      >
        <Bold size={16} strokeWidth={2.75} aria-hidden />
      </button>
      {/* Le bouton porte une icône ; le caractère inséré dans le texte du site reste « ✅ » (toggleCheckCmd) */}
      <button
        type="button"
        title="Transformer la ligne en coche"
        aria-label="Transformer la ligne en coche"
        onMouseDown={apply(toggleCheckCmd)}
        className={btn}
      >
        <SquareCheckBig size={16} strokeWidth={2.25} aria-hidden />
      </button>
      <button
        type="button"
        title="Lien hypertexte sur la sélection (Ctrl+K)"
        aria-label="Ajouter ou retirer un lien hypertexte"
        onMouseDown={apply(toggleLinkCmd)}
        className={btn}
      >
        <Link2 size={16} strokeWidth={2.25} aria-hidden />
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
            <List size={16} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            title="Liste numérotée"
            aria-label="Liste numérotée"
            onMouseDown={apply((el) => toggleListCmd(el, true))}
            className={btn}
          >
            <ListOrdered size={16} strokeWidth={2.25} aria-hidden />
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
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
        <p className={LABEL}>Paragraphe</p>
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
        className={clsx("min-h-36", EDITABLE_BOX)}
      />
      <Note className="mt-2">
        <FormattingHelp />
      </Note>
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
  headings = false,
  hint,
  minHeight = "min-h-11",
  limit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  /** true : lignes « ## … » éditées comme de vrais titres (bouton Titre) */
  headings?: boolean;
  hint?: ReactNode;
  minHeight?: string;
  /** Longueur conseillée : affiche un compteur (sans bloquer la saisie) */
  limit?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);

  // Injection initiale, puis resynchronisation seulement quand la valeur
  // change ailleurs (changement de page, suppression d'un élément de liste).
  useEffect(() => {
    const el = ref.current;
    if (!el || lastEmitted.current === value) return;
    // Mono-ligne : pas de listes — « 2. Consultation » reste du texte
    el.innerHTML = textToHtml(value, multiline, headings);
    lastEmitted.current = value;
  }, [value, multiline, headings]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    let text = htmlToText(el);
    if (!multiline) text = text.replace(/\s*\n+\s*/g, " ");
    // Markdown (react-markdown) : un simple retour à la ligne dans un
    // paragraphe doit devenir un saut dur (deux espaces finaux), sinon le
    // site recolle les lignes que l'éditeur montre séparées.
    if (headings) text = text.replace(/(\S)\n(?=\S)/g, "$1  \n");
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
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
        <p className={clsx("flex flex-wrap items-baseline gap-x-2", LABEL)}>
          {label}
          {limit !== undefined ? <CharCounter length={visibleLength(value)} limit={limit} /> : null}
        </p>
        <RichToolbar getEl={() => ref.current} onApplied={emit} lists={multiline} headings={headings} />
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
        className={clsx(minHeight, EDITABLE_BOX)}
      />
      {hint ? <Note className="mt-2">{hint}</Note> : null}
    </div>
  );
}
