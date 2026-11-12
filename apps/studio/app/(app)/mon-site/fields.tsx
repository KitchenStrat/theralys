"use client";

import { clsx } from "clsx";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Input, Label } from "@theralys/ui";
import { frenchSpacing } from "@/lib/external-site/format";
import { FOCUS_RING } from "./styles";
import { SuccessMark } from "./ui";

/**
 * Champs de formulaire de l'écran « Mon site » : libellé relié au champ,
 * aide et erreur reliées par `aria-describedby`, champ en erreur signalé par
 * `aria-invalid` (et pas seulement par sa couleur). Les champs eux-mêmes
 * restent ceux de `@theralys/ui`, que la coquille du studio restyle.
 */

/** 44 px de haut (cible au doigt) et texte en 16 px : un téléphone ne zoome pas sur le champ à la saisie. */
const FIELD_SIZE = "min-h-11 text-base! disabled:bg-ds-ink-100 disabled:text-ds-ink-600";

const TEXTAREA_CLASS =
  "block w-full rounded-xl border border-ink-300 bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-ds-ink-100 disabled:text-ds-ink-600";

/** Bordure d'un champ en erreur (`aria-invalid`) : elle accompagne le message, elle ne le remplace pas. */
const INVALID_BORDER = "aria-invalid:border-danger-500";

/** Aide sous un champ : 13 px, encre lisible sur blanc comme sur une teinte. */
const HINT = "mt-1.5 text-ds-meta text-ds-ink-600";

const describedBy = (...ids: (string | false | undefined)[]): string | undefined => ids.filter(Boolean).join(" ") || undefined;

/** Texte d'interface reçu en propriété (libellé, aide, message du service) : mis à la typographie française. */
const typeset = (content: ReactNode): ReactNode => (typeof content === "string" ? frenchSpacing(content) : content);

/** Message d'erreur d'un champ : texte précédé d'un pictogramme, relié au champ par son identifiant. */
export function FieldError({ id, children, testId }: { id: string; children: ReactNode; testId?: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-ds-danger-700" data-testid={testId}>
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>{typeset(children)}</span>
    </p>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Ajoute « (facultatif) » au libellé */
  optional?: boolean;
  maxLength?: number;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
};

function FieldLabel({ id, label, optional }: { id: string; label: string; optional?: boolean }) {
  return (
    <Label htmlFor={id}>
      {frenchSpacing(label)}
      {optional ? <span className="font-normal text-ds-ink-600"> (facultatif)</span> : null}
    </Label>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  optional,
  maxLength,
  hint,
  error,
  placeholder,
  disabled,
  testId,
  type = "text",
  inputMode,
  autoComplete = "off",
  onBlur,
}: FieldProps & {
  type?: "text" | "email" | "tel";
  inputMode?: "text" | "url" | "email" | "tel";
  autoComplete?: string;
  onBlur?: () => void;
}) {
  return (
    <div>
      <FieldLabel id={id} label={label} optional={optional} />
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        autoCapitalize={inputMode === "url" || inputMode === "email" ? "none" : undefined}
        spellCheck={inputMode === "url" || inputMode === "email" || inputMode === "tel" ? false : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint !== undefined && `${id}-hint`, error && `${id}-error`)}
        className={clsx(FIELD_SIZE, INVALID_BORDER)}
        data-testid={testId}
      />
      {hint !== undefined ? (
        <p id={`${id}-hint`} className={HINT}>
          {typeset(hint)}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  optional,
  maxLength,
  hint,
  error,
  placeholder,
  disabled,
  testId,
  rows = 3,
}: FieldProps & { rows?: number }) {
  return (
    <div>
      <FieldLabel id={id} label={label} optional={optional} />
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy((hint !== undefined || maxLength !== undefined) && `${id}-hint`, error && `${id}-error`)}
        className={clsx(TEXTAREA_CLASS, INVALID_BORDER)}
        data-testid={testId}
      />
      {hint !== undefined || maxLength !== undefined ? (
        <p id={`${id}-hint`} className={clsx(HINT, "flex flex-wrap justify-between gap-x-3")}>
          <span>{typeset(hint)}</span>
          {maxLength !== undefined ? (
            <span className="whitespace-nowrap ds-tnum">
              {value.length} sur {maxLength} caractères
            </span>
          ) : null}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function CheckboxField({
  id,
  checked,
  onChange,
  label,
  hint,
  error,
  disabled,
  required,
  testId,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hint !== undefined && `${id}-hint`, error && `${id}-error`)}
          className={clsx("size-6 shrink-0 rounded accent-ds-brand-600", FOCUS_RING)}
          data-testid={testId}
        />
        <div className="min-w-0">
          {/* Le libellé cliquable fait au moins la hauteur de la case : la cible au doigt est la ligne entière */}
          <label htmlFor={id} className="block min-h-6 text-ds-body font-medium text-ds-ink-900">
            {typeset(label)}
          </label>
          {hint !== undefined ? (
            <p id={`${id}-hint`} className="mt-0.5 text-ds-meta text-ds-ink-600">
              {typeset(hint)}
            </p>
          ) : null}
        </div>
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * Message d'une action : échec (annoncé aussitôt) ou confirmation (annoncée
 * poliment). Le pictogramme double la couleur. `calm` : confirmation sans
 * mouvement, quand la réussite est déjà fêtée ailleurs à l'écran.
 */
export function ActionMessage({ error, notice, testId, calm = false }: { error?: string | null; notice?: string | null; testId?: string; calm?: boolean }) {
  if (error) {
    return (
      <p className="flex items-start gap-2 text-sm font-medium text-ds-danger-700" role="alert" data-testid={testId}>
        <TriangleAlert size={18} aria-hidden className="mt-px shrink-0" />
        <span>{frenchSpacing(error)}</span>
      </p>
    );
  }
  if (notice) {
    return (
      <p className="flex items-center gap-2.5 text-ds-body font-semibold text-ds-success-900" role="status" data-testid={testId}>
        <SuccessMark calm={calm} />
        <span>{frenchSpacing(notice)}</span>
      </p>
    );
  }
  return null;
}
