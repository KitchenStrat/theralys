"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Button, Spinner } from "@theralys/ui";
import { normalizeExternalSiteUrl } from "@theralys/shared";
import { readingHint } from "@/lib/external-site/format";
import { connectExternalSite } from "./actions";
import { ActionMessage, CheckboxField, TextField } from "./fields";

export const CONSENT_LABEL = "Ce site est le mien et j'autorise Harmony à le lire pour préparer mes contenus";
export const CONSENT_MISSING = "Cochez cette case pour confirmer que ce site est le vôtre et que vous autorisez sa lecture.";

/**
 * Adresse du site, confirmation « ce site est le mien », bouton « Lire mon
 * site ». L'adresse est contrôlée ici avec la règle du contrat
 * (`normalizeExternalSiteUrl`) pour répondre tout de suite ; le service la
 * contrôle de nouveau. `ownHosts` : hôtes du site Harmony, refusés comme
 * « site du praticien ».
 */
export function ConnectForm({
  idPrefix,
  ownHosts,
  initialUrl = "",
  onCancel,
}: {
  idPrefix: string;
  ownHosts: readonly string[];
  initialUrl?: string;
  /** Présent : le formulaire vient d'être ouvert par un bouton (le focus va à l'adresse) et peut être refermé */
  onCancel?: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [consent, setConsent] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const check = normalizeExternalSiteUrl(url, { ownHosts });

  // Formulaire ouvert par un bouton : le focus va au champ de l'adresse
  const opened = onCancel !== undefined;
  useEffect(() => {
    if (opened) formRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [opened]);

  // Après un envoi refusé : le premier champ en erreur reçoit le focus
  useEffect(() => {
    if (focusRequest > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const nextUrlError = check.ok ? null : check.message;
    const nextConsentError = consent ? null : CONSENT_MISSING;
    setUrlError(nextUrlError);
    setConsentError(nextConsentError);
    if (nextUrlError || nextConsentError) {
      setFocusRequest((count) => count + 1);
      return;
    }
    startTransition(async () => {
      const result = await connectExternalSite({ url, consent });
      if (!result.error) return;
      // Le refus est montré sur le champ qu'il concerne, sinon sous le bouton
      if (result.reason === "url") setUrlError(result.error);
      else if (result.reason === "consent") setConsentError(result.error);
      else setFailure(result.error);
      if (result.reason === "url" || result.reason === "consent") setFocusRequest((count) => count + 1);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4" data-testid="connect-form">
      <div className="max-w-md">
        <TextField
          id={`${idPrefix}-url`}
          label="Adresse de votre site"
          value={url}
          onChange={(value) => {
            setUrl(value);
            if (urlError) setUrlError(null);
          }}
          // Retour immédiat en quittant le champ ; un champ laissé vide n'est signalé qu'à l'envoi
          onBlur={() => setUrlError(url.trim() === "" || check.ok ? null : check.message)}
          inputMode="url"
          autoComplete="url"
          placeholder="www.mon-cabinet.fr"
          maxLength={500}
          disabled={pending}
          error={urlError ?? undefined}
          // L'aide confirme l'adresse qui sera lue ; en cas d'erreur, le message (qui donne déjà l'exemple) la remplace
          hint={urlError ? undefined : check.ok ? readingHint(check.url) : "Par exemple : www.mon-cabinet.fr"}
          testId="connect-url"
        />
      </div>
      <CheckboxField
        id={`${idPrefix}-consent`}
        checked={consent}
        onChange={(checked) => {
          setConsent(checked);
          if (checked) setConsentError(null);
        }}
        label={CONSENT_LABEL}
        hint="Seules vos pages publiques sont lues, comme le ferait un visiteur. Rien n'est modifié sur votre site."
        error={consentError ?? undefined}
        disabled={pending}
        required
        testId="connect-consent"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="connect-submit">
          {pending ? <Spinner className="text-white" /> : null} Lire mon site
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
      <ActionMessage error={failure} testId="connect-error" />
    </form>
  );
}
