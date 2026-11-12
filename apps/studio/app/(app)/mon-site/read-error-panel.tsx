"use client";

import { ClipboardPaste, PenLine, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { EXTERNAL_PASTE_FALLBACK_ERRORS, EXTERNAL_READ_ERRORS, type ExternalReadError } from "@theralys/shared";
import { Button, Card, IconBadge } from "@/components/ds";
import { frenchSpacing, readsRemaining, readsRemainingLabel, siteAddressLabel } from "@/lib/external-site/format";
import { disconnectExternalSiteAction, rereadExternalSite } from "./actions";
import { ConnectForm } from "./connect-form";
import { ActionMessage } from "./fields";
import { PasteForm } from "./paste-form";
import { SUB_TITLE } from "./styles";

/**
 * La première lecture du site a échoué : ce qui s'est passé et quoi faire
 * (messages du contrat), puis les suites possibles — coller le texte des
 * pages quand c'est la bonne issue, relancer la lecture, changer d'adresse,
 * ou renoncer à connecter ce site.
 *
 * Un panneau en deux temps : le constat sur un bandeau d'attention (ni rouge
 * ni alarmant : rien n'est cassé), puis les issues, la plus utile d'abord et
 * elle seule en bouton principal.
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
  const [busy, setBusy] = useState<"retry" | "abandon" | null>(null);
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

  function act(name: "retry" | "abandon", action: () => Promise<{ error?: string }>) {
    setFailure(null);
    setBusy(name);
    startTransition(async () => {
      const result = await action();
      if (result.error) setFailure(result.error);
    });
  }

  return (
    <section aria-labelledby="read-error-title" data-testid="read-error-panel" data-error={error}>
      <Card padding="none" className="overflow-hidden">
        <div className="bg-ds-warning-100 px-5 py-5 sm:px-8 sm:py-6">
          <p className="text-ds-meta font-semibold text-ds-warning-900">Étape 1 · Connecter</p>
          <div className="mt-2.5 flex items-start gap-3.5">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-ds-sm bg-white text-ds-warning-700 shadow-sm">
              <TriangleAlert size={22} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 id="read-error-title" className="font-ds-display text-lg/7 font-bold text-balance text-ds-warning-900 sm:text-xl/7" data-testid="read-error-title">
                {frenchSpacing(title)}
              </h2>
              <p className="mt-0.5 wrap-anywhere text-base font-semibold text-ds-ink-900" data-testid="site-url">
                {siteAddressLabel(url)}
              </p>
              <p className="mt-2 max-w-[62ch] text-base text-ds-ink-800">{frenchSpacing(hint)}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-7">
          {canPaste ? (
            <div className="mb-7 border-b border-ds-ink-200 pb-7">
              <div className="flex items-start gap-3.5">
                <IconBadge icon={ClipboardPaste} tone="soft" size="sm" />
                <div className="min-w-0">
                  <h3 className={SUB_TITLE}>Coller le texte de mon site</h3>
                  <p className="mt-1 max-w-[62ch] text-base text-ds-ink-700">
                    Ouvrez votre site, copiez le texte de vos pages (accueil, spécialités, présentation, tarifs, contact) et collez-le ci-dessous, à la suite. Nous en tirons le même
                    profil que si nous avions lu votre site.
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <PasteForm idPrefix="paste" />
              </div>
            </div>
          ) : null}

          <h3 className={SUB_TITLE}>{canPaste ? "Ou réessayer autrement" : "Que souhaitez-vous faire\u00a0?"}</h3>
          {changing ? (
            <div className="mt-3">
              <p className="mb-4 text-base text-ds-ink-700">Indiquez la bonne adresse, puis relancez la lecture.</p>
              <ConnectForm
                idPrefix="change"
                ownHosts={ownHosts}
                initialUrl={siteAddressLabel(url)}
                onCancel={() => setChanging(false)}
                submitVariant={canPaste ? "secondary" : "primary"}
              />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={canPaste ? "secondary" : "primary"}
                  disabled={pending || !canRead}
                  loading={pending && busy === "retry"}
                  icon={<RefreshCw size={18} aria-hidden />}
                  onClick={() => act("retry", rereadExternalSite)}
                  data-testid="retry-read"
                >
                  Relancer la lecture
                </Button>
                <Button id="change-address" type="button" variant="secondary" disabled={pending} icon={<PenLine size={18} aria-hidden />} onClick={() => setChanging(true)} data-testid="change-address">
                  Changer d&apos;adresse
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending}
                  loading={pending && busy === "abandon"}
                  icon={<Unplug size={18} aria-hidden />}
                  onClick={() => act("abandon", disconnectExternalSiteAction)}
                  data-testid="abandon-site"
                >
                  Ne plus connecter ce site
                </Button>
              </div>
              <p className="mt-3 text-ds-body text-ds-ink-600" data-testid="reads-remaining">
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
