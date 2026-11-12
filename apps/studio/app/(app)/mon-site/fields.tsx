"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Input, Label } from "@theralys/ui";
import { FOCUS_RING } from "./styles";

/**
 * Champs de formulaire de l'écran « Mon site » : libellé relié au champ,
 * aide et erreur reliées par `aria-describedby`, champ en erreur signalé par
 * `aria-invalid` (et pas seulement par sa couleur).
 */

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-cream-100";

/** Bordure d'un champ en erreur (`aria-invalid`) : elle accompagne le message, elle ne le remplace pas. */
const INVALID_BORDER = "aria-invalid:border-danger-500";

const describedBy = (...ids: (string | false | undefined)[]): string | undefined => ids.filter(Boolean).join(" ") || undefined;

/** Message d'erreur d'un champ : texte précédé d'un signe, relié au champ par son identifiant. */
export function FieldError({ id, children, testId }: { id: string; children: ReactNode; testId?: string }) {
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-danger-500" data-testid={testId}>
      <span aria-hidden>⚠</span>
      <span>{children}</span>
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
      {label}
      {optional ? <span className="font-normal text-ink-500"> (facultatif)</span> : null}
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
        className={INVALID_BORDER}
        data-testid={testId}
      />
      {hint !== undefined ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
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
        <p id={`${id}-hint`} className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-ink-500">
          <span>{hint}</span>
          {maxLength !== undefined ? (
            <span className="whitespace-nowrap">
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
          className={clsx("mt-0.5 h-5 w-5 shrink-0 rounded accent-primary-500", FOCUS_RING)}
          data-testid={testId}
        />
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium text-ink-900">
            {label}
          </label>
          {hint !== undefined ? (
            <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-500">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

/** Message d'une action : échec (annoncé aussitôt) ou confirmation (annoncée poliment). Le signe double la couleur. */
export function ActionMessage({ error, notice, testId }: { error?: string | null; notice?: string | null; testId?: string }) {
  if (error) {
    return (
      <p className="flex items-start gap-1.5 text-sm font-medium text-danger-500" role="alert" data-testid={testId}>
        <span aria-hidden>⚠</span>
        <span>{error}</span>
      </p>
    );
  }
  if (notice) {
    return (
      <p className="flex items-start gap-1.5 text-sm font-medium text-ink-900" role="status" data-testid={testId}>
        <span aria-hidden className="text-success-500">
          ✓
        </span>
        <span>{notice}</span>
      </p>
    );
  }
  return null;
}
