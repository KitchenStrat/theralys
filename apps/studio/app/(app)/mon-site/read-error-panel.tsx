"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import { EXTERNAL_PASTE_FALLBACK_ERRORS, EXTERNAL_READ_ERRORS, type ExternalReadError } from "@theralys/shared";
import { frenchSpacing, readsRemaining, readsRemainingLabel, siteAddressLabel } from "@/lib/external-site/format";
import { disconnectExternalSiteAction, rereadExternalSite } from "./actions";
import { ConnectForm } from "./connect-form";
import { ActionMessage } from "./fields";
import { PasteForm } from "./paste-form";

/**
 * La première lecture du site a échoué : ce qui s'est passé et quoi faire
 * (messages du contrat), puis les suites possibles — coller le texte des
 * pages quand c'est la bonne issue, relancer la lecture, changer d'adresse,
 * ou renoncer à connecter ce site.
 */
export function ReadErrorPanel({
  url,
  error,
  reads,
  ownHosts,
}: {
  url: string;
  error: ExternalReadError;
  reads: { used: number; limit: number };
  ownHosts: readonly string[];
}) {
  const [changing, setChanging] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wasChanging = useRef(false);
  const { title, hint } = EXTERNAL_READ_ERRORS[error];

  // Formulaire d'adresse refermé : le focus revient au bouton qui l'avait ouvert
  useEffect(() => {
    if (wasChanging.current && !changing) document.getElementById("change-address")?.focus();
    wasChanging.current = changing;
  }, [changing]);
  const canPaste = EXTERNAL_PASTE_FALLBACK_ERRORS.includes(error);
  const canRead = readsRemaining(reads) > 0;

  function act(action: () => Promise<{ error?: string }>) {
    setFailure(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setFailure(result.error);
    });
  }

  return (
    <section aria-labelledby="read-error-title" data-testid="read-error-panel" data-error={error}>
      <Card className="p-6 md:p-7">
        <h2 id="read-error-title" className="flex items-start gap-2 text-xl font-semibold" data-testid="read-error-title">
          <span aria-hidden className="text-warning-500">
            ⚠
          </span>
          {frenchSpacing(title)}
        </h2>
        <p className="mt-1 wrap-anywhere text-base font-medium text-ink-900" data-testid="site-url">
          {siteAddressLabel(url)}
        </p>
        <p className="mt-2 max-w-2xl text-base text-ink-700">{frenchSpacing(hint)}</p>

        {canPaste ? (
          <div className="mt-6 border-t border-cream-200 pt-5">
            <h3 className="text-lg font-semibold">Coller le texte de mon site</h3>
            <p className="mt-1 max-w-2xl text-base text-ink-700">
              Ouvrez votre site, copiez le texte de vos pages (accueil, spécialités, présentation, tarifs, contact) et collez-le ci-dessous, à la suite. Nous en tirons le même
              profil que si nous avions lu votre site.
            </p>
            <div className="mt-4">
              <PasteForm idPrefix="paste" />
            </div>
          </div>
        ) : null}

        <div className="mt-6 border-t border-cream-200 pt-5">
          <h3 className="text-lg font-semibold">{canPaste ? "Ou réessayer autrement" : "Que souhaitez-vous faire\u00a0?"}</h3>
          {changing ? (
            <div className="mt-3">
              <p className="mb-3 text-base text-ink-700">Indiquez la bonne adresse, puis relancez la lecture.</p>
              <ConnectForm idPrefix="change" ownHosts={ownHosts} initialUrl={siteAddressLabel(url)} onCancel={() => setChanging(false)} />
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" variant={canPaste ? "secondary" : "primary"} disabled={pending || !canRead} onClick={() => act(rereadExternalSite)} data-testid="retry-read">
                  {pending ? <Spinner className={canPaste ? undefined : "text-white"} /> : null} Relancer la lecture
                </Button>
                <Button id="change-address" type="button" variant="secondary" disabled={pending} onClick={() => setChanging(true)} data-testid="change-address">
                  Changer d&apos;adresse
                </Button>
                <Button type="button" variant="ghost" disabled={pending} onClick={() => act(disconnectExternalSiteAction)} data-testid="abandon-site">
                  Ne plus connecter ce site
                </Button>
              </div>
              <p className="mt-3 text-sm text-ink-700" data-testid="reads-remaining">
                {frenchSpacing(readsRemainingLabel(reads))}
              </p>
            </>
          )}
          <div className="mt-3">
            <ActionMessage error={failure} testId="read-error-failure" />
          </div>
        </div>
      </Card>
    </section>
  );
}
