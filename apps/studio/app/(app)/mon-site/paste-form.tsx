"use client";

import { ClipboardCheck } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { EXTERNAL_SITE_LIMITS } from "@theralys/shared";
import { Button } from "@/components/ds";
import { submitExternalSitePaste } from "./actions";
import { CONSENT_LABEL, CONSENT_MISSING } from "./connect-form";
import { ActionMessage, CheckboxField, TextAreaField } from "./fields";

const { pastedMinChars: MIN, pastedMaxChars: MAX } = EXTERNAL_SITE_LIMITS;
const count = (value: number): string => value.toLocaleString("fr-FR");

/**
 * Repli quand le site refuse la lecture automatique : le praticien colle le
 * texte de ses pages, qui tient lieu de pages lues. Mêmes bornes que le
 * service (`EXTERNAL_SITE_LIMITS`), même confirmation « ce site est le mien ».
 * Le profil est préparé pendant l'envoi : l'attente est annoncée.
 */
export function PasteForm({
  idPrefix,
  onCancel,
  onDone,
}: {
  idPrefix: string;
  onCancel?: () => void;
  /** Le profil a été préparé : pour un formulaire ouvert dans un écran qui reste affiché ensuite */
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Formulaire ouvert par un bouton (il peut alors être refermé) : le focus va à la zone de texte
  const opened = onCancel !== undefined;
  useEffect(() => {
    if (opened) formRef.current?.querySelector<HTMLElement>("textarea")?.focus();
  }, [opened]);

  // Après un envoi refusé : le premier champ en erreur reçoit le focus
  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  const length = text.trim().length;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const nextTextError =
      length < MIN
        ? `Ce texte est trop court pour en tirer un profil : collez au moins ${count(MIN)} caractères (il en compte ${count(length)}).`
        : length > MAX
          ? `Ce texte est trop long : gardez l'essentiel de vos pages, ${count(MAX)} caractères au plus (il en compte ${count(length)}).`
          : null;
    const nextConsentError = consent ? null : CONSENT_MISSING;
    setTextError(nextTextError);
    setConsentError(nextConsentError);
    if (nextTextError || nextConsentError) {
      setFocusRequest((value) => value + 1);
      return;
    }
    startTransition(async () => {
      const result = await submitExternalSitePaste({ text, consent });
      // Suite marquée comme transition elle aussi : elle arrive dans le même rendu que l'écran relu
      startTransition(() => {
        if (!result.error) {
          onDone?.();
          return;
        }
        if (result.reason === "text") setTextError(result.error);
        else if (result.reason === "consent") setConsentError(result.error);
        else setFailure(result.error);
        if (result.reason === "text" || result.reason === "consent") setFocusRequest((value) => value + 1);
      });
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" data-testid="paste-form">
      <TextAreaField
        id={`${idPrefix}-text`}
        label="Texte de vos pages"
        value={text}
        onChange={(value) => {
          setText(value);
          if (textError) setTextError(null);
        }}
        rows={12}
        disabled={pending}
        error={textError ?? undefined}
        placeholder="Collez ici le texte de votre page d'accueil, de vos pages de spécialité, de votre présentation, de vos tarifs…"
        hint={`Entre ${count(MIN)} et ${count(MAX)} caractères. Votre texte en compte ${count(length)}.`}
        testId="paste-text"
      />
      <CheckboxField
        id={`${idPrefix}-consent`}
        checked={consent}
        onChange={(checked) => {
          setConsent(checked);
          if (checked) setConsentError(null);
        }}
        label={CONSENT_LABEL}
        error={consentError ?? undefined}
        disabled={pending}
        required
        testId="paste-consent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} icon={<ClipboardCheck size={18} aria-hidden />} data-testid="paste-submit">
          Préparer mon profil avec ce texte
        </Button>
        {onCancel ? (
          <Button type="button" variant="quiet" disabled={pending} onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
      {/* Région vivante permanente : l'attente y est annoncée */}
      <p role="status" className="text-ds-body text-ds-ink-700">
        {pending ? "Nous préparons votre profil à partir de ce texte : cela prend jusqu'à une minute. Gardez cette page ouverte." : null}
      </p>
      <ActionMessage error={failure} testId="paste-error" />
    </form>
  );
}
