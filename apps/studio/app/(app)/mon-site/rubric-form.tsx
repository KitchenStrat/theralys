"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button, Spinner } from "@theralys/ui";
import type { ExternalSiteProfile } from "@theralys/shared";
import {
  FIELD_MAX,
  LIST_MAX,
  SOCIAL_NETWORKS,
  checkRubricDraft,
  rubricDraft,
  type PairDraft,
  type RubricDrafts,
  type RubricId,
  type TextDraft,
} from "@/lib/external-site/rubrics";
import { siteAddressLabel } from "@/lib/external-site/format";
import { saveExternalCorrection } from "./actions";
import { ActionMessage, TextAreaField, TextField } from "./fields";
import { ListEditor, newUid } from "./list-editor";

/**
 * Formulaire de correction d'une rubrique du profil, ouvert sur place. Le
 * brouillon part du profil effectif ; le contrôle (`checkRubricDraft`) signale
 * sur chaque champ ce que le service écarterait ; l'enregistrement envoie les
 * clés de la rubrique, les corrections complètes étant recomposées côté
 * serveur. Après un premier envoi refusé, le contrôle suit la saisie : une
 * erreur corrigée disparaît aussitôt.
 */

type FieldsProps<R extends RubricId> = {
  /** Préfixe des identifiants de champs : `fid("phone")`, `fid("items.e0.first")` */
  fid: (key: string) => string;
  draft: RubricDrafts[R];
  change: (next: RubricDrafts[R]) => void;
  errors: Record<string, string>;
};

const FORM_INVALID = "Vérifiez les champs signalés, puis enregistrez de nouveau.";

function FormShell<R extends RubricId>({
  rubric,
  title,
  profile,
  siteUrl,
  onClose,
  children,
}: {
  rubric: R;
  title: string;
  profile: ExternalSiteProfile;
  siteUrl: string;
  /** `saved` : la correction est enregistrée */
  onClose: (saved: boolean) => void;
  children: (fields: FieldsProps<R>) => ReactNode;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<RubricDrafts[R]>(() => rubricDraft(rubric, profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // À l'ouverture, le focus va au premier champ (ou au premier bouton d'une rubrique encore vide)
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
  }, []);

  // Après un envoi refusé, au premier champ en erreur
  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function change(next: RubricDrafts[R]) {
    setDraft(next);
    if (!submitted) return;
    const check = checkRubricDraft(rubric, next, siteUrl);
    setErrors(check.ok ? {} : check.errors);
    if (check.ok) setFailure(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const check = checkRubricDraft(rubric, draft, siteUrl);
    if (!check.ok) {
      setErrors(check.errors);
      setFailure(FORM_INVALID);
      setFocusRequest((count) => count + 1);
      return;
    }
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      const result = await saveExternalCorrection({ rubric, value: check.value });
      if (result.error) setFailure(result.error);
      else onClose(true);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label={`Modifier la rubrique ${title}`} className="mt-4 space-y-5" data-testid={`rubric-${rubric}-form`}>
      {/* Champs figés pendant l'enregistrement ; `role="none"` : ce regroupement technique n'est pas annoncé comme un groupe */}
      <fieldset role="none" disabled={pending} className="min-w-0 space-y-5">
        {children({ fid: (key) => `${formId}-${key}`, draft, change, errors })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid={`rubric-${rubric}-save`}>
          {pending ? <Spinner className="text-white" /> : null} Enregistrer
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => onClose(false)} data-testid={`rubric-${rubric}-cancel`}>
          Annuler
        </Button>
      </div>
      <ActionMessage error={failure} testId={`rubric-${rubric}-error`} />
    </form>
  );
}

// ─── Listes ──────────────────────────────────────────────────────────────────

function TextList({
  id,
  legend,
  hint,
  itemName,
  items,
  onChange,
  max,
  maxLength,
  rows,
  addLabel,
  maxLabel,
}: {
  id: string;
  legend: string;
  hint?: string;
  /** « Paragraphe » */
  itemName: string;
  items: TextDraft[];
  onChange: (items: TextDraft[]) => void;
  max: number;
  maxLength: number;
  /** Présent : zone de texte de cette hauteur ; absent : champ sur une ligne */
  rows?: number;
  addLabel: string;
  maxLabel: string;
}) {
  const fieldId = (item: TextDraft) => `${id}-${item.uid}`;
  return (
    <ListEditor
      id={id}
      legend={legend}
      hint={hint}
      items={items}
      onChange={onChange}
      max={max}
      addLabel={addLabel}
      maxLabel={maxLabel}
      itemLabel={(index) => `${itemName} ${index + 1}`}
      blank={() => ({ uid: newUid(), text: "" })}
      fieldId={fieldId}
    >
      {(item, index, update) =>
        rows ? (
          <TextAreaField id={fieldId(item)} label={`${itemName} ${index + 1}`} value={item.text} onChange={(text) => update({ ...item, text })} maxLength={maxLength} rows={rows} />
        ) : (
          <TextField id={fieldId(item)} label={`${itemName} ${index + 1}`} value={item.text} onChange={(text) => update({ ...item, text })} maxLength={maxLength} />
        )
      }
    </ListEditor>
  );
}

type PairField = { label: string; maxLength: number; placeholder?: string; optional?: boolean; rows?: number };

function PairList({
  id,
  name,
  legend,
  hint,
  itemName,
  items,
  onChange,
  errors,
  max,
  first,
  second,
  addLabel,
  maxLabel,
}: {
  id: string;
  /** Nom de la liste dans les clés d'erreur (`items`, `highlights`, `hours`) */
  name: string;
  legend: string;
  hint?: string;
  itemName: string;
  items: PairDraft[];
  onChange: (items: PairDraft[]) => void;
  errors: Record<string, string>;
  max: number;
  first: PairField;
  second: PairField;
  addLabel: string;
  maxLabel: string;
}) {
  const fieldId = (item: PairDraft, part: "first" | "second" = "first") => `${id}.${item.uid}.${part}`;
  return (
    <ListEditor
      id={id}
      legend={legend}
      hint={hint}
      items={items}
      onChange={onChange}
      max={max}
      addLabel={addLabel}
      maxLabel={maxLabel}
      itemLabel={(index) => `${itemName} ${index + 1}`}
      blank={() => ({ uid: newUid(), first: "", second: "" })}
      fieldId={fieldId}
    >
      {(item, _index, update) => (
        <>
          <TextField
            id={fieldId(item)}
            label={first.label}
            value={item.first}
            onChange={(value) => update({ ...item, first: value })}
            maxLength={first.maxLength}
            placeholder={first.placeholder}
            error={errors[`${name}.${item.uid}.first`]}
          />
          {second.rows ? (
            <TextAreaField
              id={fieldId(item, "second")}
              label={second.label}
              value={item.second}
              onChange={(value) => update({ ...item, second: value })}
              maxLength={second.maxLength}
              rows={second.rows}
              optional={second.optional}
              placeholder={second.placeholder}
              error={errors[`${name}.${item.uid}.second`]}
            />
          ) : (
            <TextField
              id={fieldId(item, "second")}
              label={second.label}
              value={item.second}
              onChange={(value) => update({ ...item, second: value })}
              maxLength={second.maxLength}
              optional={second.optional}
              placeholder={second.placeholder}
              error={errors[`${name}.${item.uid}.second`]}
            />
          )}
        </>
      )}
    </ListEditor>
  );
}

// ─── Champs par rubrique ─────────────────────────────────────────────────────

function PresentationFields({ fid, draft, change, errors }: FieldsProps<"presentation">) {
  return (
    <>
      <TextField
        id={fid("headline")}
        label="Phrase d'accroche"
        value={draft.headline}
        onChange={(headline) => change({ ...draft, headline })}
        maxLength={FIELD_MAX.headline}
        hint={`La phrase qui résume votre activité (${FIELD_MAX.headline} caractères au plus).`}
      />
      <TextList
        id={fid("intro")}
        legend="Présentation de votre activité"
        itemName="Paragraphe"
        items={draft.intro}
        onChange={(intro) => change({ ...draft, intro })}
        max={LIST_MAX.intro}
        maxLength={FIELD_MAX.paragraph}
        rows={4}
        addLabel="Ajouter un paragraphe"
        maxLabel={`${LIST_MAX.intro} paragraphes au plus.`}
      />
      <PairList
        id={fid("highlights")}
        name="highlights"
        legend="Points forts"
        hint="Ce qui vous distingue, en quelques mots : séances en visio, cabinet accessible…"
        itemName="Point fort"
        items={draft.highlights}
        onChange={(highlights) => change({ ...draft, highlights })}
        errors={errors}
        max={LIST_MAX.highlights}
        first={{ label: "Titre", maxLength: FIELD_MAX.highlightTitle }}
        second={{ label: "Précision", maxLength: FIELD_MAX.highlightText, optional: true }}
        addLabel="Ajouter un point fort"
        maxLabel={`${LIST_MAX.highlights} points forts au plus.`}
      />
    </>
  );
}

function SpecialtiesFields({ fid, draft, change, errors, siteUrl }: FieldsProps<"specialties"> & { siteUrl: string }) {
  const id = fid("items");
  const fieldId = (uid: string, part: "title" | "excerpt" | "url") => `${id}.${uid}.${part}`;
  return (
    <ListEditor
      id={id}
      legend="Vos spécialités"
      hint="Ce pour quoi l'on vient vous voir. Vos contenus et vos sujets d'articles en découlent."
      items={draft.items}
      onChange={(items) => change({ ...draft, items })}
      max={LIST_MAX.specialties}
      addLabel="Ajouter une spécialité"
      maxLabel={`${LIST_MAX.specialties} spécialités au plus.`}
      itemLabel={(index) => `Spécialité ${index + 1}`}
      blank={() => ({ uid: newUid(), title: "", excerpt: "", url: "", kept: null })}
      fieldId={(item) => fieldId(item.uid, "title")}
    >
      {(item, _index, update) => (
        <>
          <TextField
            id={fieldId(item.uid, "title")}
            label="Nom de la spécialité"
            value={item.title}
            onChange={(title) => update({ ...item, title })}
            maxLength={FIELD_MAX.specialtyTitle}
            placeholder="Gestion du stress"
            error={errors[`items.${item.uid}.title`]}
          />
          <TextAreaField
            id={fieldId(item.uid, "excerpt")}
            label="Description courte"
            value={item.excerpt}
            onChange={(excerpt) => update({ ...item, excerpt })}
            maxLength={FIELD_MAX.specialtyExcerpt}
            rows={2}
            optional
          />
          <TextField
            id={fieldId(item.uid, "url")}
            label="Page de votre site sur cette spécialité"
            value={item.url}
            onChange={(url) => update({ ...item, url })}
            maxLength={FIELD_MAX.link}
            inputMode="url"
            optional
            placeholder={`${siteAddressLabel(siteUrl)}/gestion-du-stress`}
            hint="Si une page de votre site lui est consacrée : vos liens y mèneront."
            error={errors[`items.${item.uid}.url`]}
          />
        </>
      )}
    </ListEditor>
  );
}

function AboutFields({ fid, draft, change }: FieldsProps<"about">) {
  return (
    <>
      <TextList
        id={fid("paragraphs")}
        legend="Votre parcours, votre approche"
        itemName="Paragraphe"
        items={draft.paragraphs}
        onChange={(paragraphs) => change({ ...draft, paragraphs })}
        max={LIST_MAX.aboutParagraphs}
        maxLength={FIELD_MAX.paragraph}
        rows={4}
        addLabel="Ajouter un paragraphe"
        maxLabel={`${LIST_MAX.aboutParagraphs} paragraphes au plus.`}
      />
      <TextList
        id={fid("credentials")}
        legend="Diplômes et formations"
        itemName="Diplôme ou formation"
        items={draft.credentials}
        onChange={(credentials) => change({ ...draft, credentials })}
        max={LIST_MAX.credentials}
        maxLength={FIELD_MAX.credential}
        addLabel="Ajouter un diplôme ou une formation"
        maxLabel={`${LIST_MAX.credentials} lignes au plus.`}
      />
    </>
  );
}

function PracticalFields({ fid, draft, change, errors }: FieldsProps<"practical">) {
  return (
    <PairList
      id={fid("items")}
      name="items"
      legend="Infos pratiques"
      hint="Durée d'une séance, tarifs, remboursement, moyens de paiement…"
      itemName="Info pratique"
      items={draft.items}
      onChange={(items) => change({ ...draft, items })}
      errors={errors}
      max={LIST_MAX.practical}
      first={{ label: "Intitulé", maxLength: FIELD_MAX.pairTitle, placeholder: "Durée d'une séance" }}
      second={{ label: "Détail", maxLength: FIELD_MAX.pairText, placeholder: "1 heure" }}
      addLabel="Ajouter une info pratique"
      maxLabel={`${LIST_MAX.practical} infos pratiques au plus.`}
    />
  );
}

function ProcessFields({ fid, draft, change, errors }: FieldsProps<"process">) {
  return (
    <PairList
      id={fid("items")}
      name="items"
      legend="Les étapes d'une séance"
      itemName="Étape"
      items={draft.items}
      onChange={(items) => change({ ...draft, items })}
      errors={errors}
      max={LIST_MAX.process}
      first={{ label: "Nom de l'étape", maxLength: FIELD_MAX.pairTitle, placeholder: "Temps d'échange" }}
      second={{ label: "Ce qui se passe", maxLength: FIELD_MAX.pairText, rows: 2 }}
      addLabel="Ajouter une étape"
      maxLabel={`${LIST_MAX.process} étapes au plus.`}
    />
  );
}

function FaqFields({ fid, draft, change, errors }: FieldsProps<"faq">) {
  return (
    <PairList
      id={fid("items")}
      name="items"
      legend="Questions et réponses"
      itemName="Question"
      items={draft.items}
      onChange={(items) => change({ ...draft, items })}
      errors={errors}
      max={LIST_MAX.faq}
      first={{ label: "Question", maxLength: FIELD_MAX.question }}
      second={{ label: "Réponse", maxLength: FIELD_MAX.answer, rows: 3 }}
      addLabel="Ajouter une question"
      maxLabel={`${LIST_MAX.faq} questions au plus.`}
    />
  );
}

function ContactFields({ fid, draft, change, errors }: FieldsProps<"contact">) {
  return (
    <>
      <TextField id={fid("address")} label="Adresse du cabinet" value={draft.address} onChange={(address) => change({ ...draft, address })} maxLength={FIELD_MAX.address} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={fid("phone")}
          label="Téléphone"
          value={draft.phone}
          onChange={(phone) => change({ ...draft, phone })}
          maxLength={FIELD_MAX.phone}
          type="tel"
          inputMode="tel"
          error={errors.phone}
        />
        <TextField
          id={fid("email")}
          label="Adresse e-mail"
          value={draft.email}
          onChange={(email) => change({ ...draft, email })}
          maxLength={FIELD_MAX.email}
          inputMode="email"
          error={errors.email}
        />
      </div>
      <PairList
        id={fid("hours")}
        name="hours"
        legend="Horaires"
        itemName="Horaire"
        items={draft.hours}
        onChange={(hours) => change({ ...draft, hours })}
        errors={errors}
        max={LIST_MAX.hours}
        first={{ label: "Jours", maxLength: FIELD_MAX.hoursLabel, placeholder: "Lundi au vendredi" }}
        second={{ label: "Heures", maxLength: FIELD_MAX.hoursValue, placeholder: "9 h – 19 h" }}
        addLabel="Ajouter un horaire"
        maxLabel={`${LIST_MAX.hours} lignes d'horaires au plus.`}
      />
      <TextField
        id={fid("note")}
        label="Précision"
        value={draft.note}
        onChange={(note) => change({ ...draft, note })}
        maxLength={FIELD_MAX.note}
        optional
        placeholder="Sur rendez-vous uniquement"
      />
    </>
  );
}

function BookingFields({ fid, draft, change, errors }: FieldsProps<"booking">) {
  return (
    <div className="max-w-xl">
      <TextField
        id={fid("link")}
        label="Lien de votre page de rendez-vous, ou numéro de téléphone"
        value={draft.link}
        onChange={(link) => change({ ...draft, link })}
        maxLength={FIELD_MAX.link}
        placeholder="https://www.doctolib.fr/…"
        hint="Votre page Doctolib, Resalib, Calendly… ou votre numéro, si les rendez-vous se prennent par téléphone. Laissez vide si vous n'en avez pas."
        error={errors.link}
      />
    </div>
  );
}

function SocialFields({ fid, draft, change, errors }: FieldsProps<"social">) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SOCIAL_NETWORKS.map((network) => (
        <TextField
          key={network.key}
          id={fid(`links.${network.key}`)}
          label={network.label}
          value={draft.links[network.key]}
          onChange={(value) => change({ ...draft, links: { ...draft.links, [network.key]: value } })}
          maxLength={FIELD_MAX.link}
          inputMode="url"
          optional
          placeholder={`https://www.${network.host}/…`}
          error={errors[`links.${network.key}`]}
        />
      ))}
    </div>
  );
}

/** Formulaire de la rubrique demandée. */
export function RubricForm({
  rubric,
  title,
  profile,
  siteUrl,
  onClose,
}: {
  rubric: RubricId;
  title: string;
  profile: ExternalSiteProfile;
  siteUrl: string;
  onClose: (saved: boolean) => void;
}) {
  const shell = { title, profile, siteUrl, onClose };
  switch (rubric) {
    case "presentation":
      return (
        <FormShell rubric="presentation" {...shell}>
          {(fields) => <PresentationFields {...fields} />}
        </FormShell>
      );
    case "specialties":
      return (
        <FormShell rubric="specialties" {...shell}>
          {(fields) => <SpecialtiesFields {...fields} siteUrl={siteUrl} />}
        </FormShell>
      );
    case "about":
      return (
        <FormShell rubric="about" {...shell}>
          {(fields) => <AboutFields {...fields} />}
        </FormShell>
      );
    case "practical":
      return (
        <FormShell rubric="practical" {...shell}>
          {(fields) => <PracticalFields {...fields} />}
        </FormShell>
      );
    case "process":
      return (
        <FormShell rubric="process" {...shell}>
          {(fields) => <ProcessFields {...fields} />}
        </FormShell>
      );
    case "faq":
      return (
        <FormShell rubric="faq" {...shell}>
          {(fields) => <FaqFields {...fields} />}
        </FormShell>
      );
    case "contact":
      return (
        <FormShell rubric="contact" {...shell}>
          {(fields) => <ContactFields {...fields} />}
        </FormShell>
      );
    case "booking":
      return (
        <FormShell rubric="booking" {...shell}>
          {(fields) => <BookingFields {...fields} />}
        </FormShell>
      );
    case "social":
      return (
        <FormShell rubric="social" {...shell}>
          {(fields) => <SocialFields {...fields} />}
        </FormShell>
      );
  }
}
