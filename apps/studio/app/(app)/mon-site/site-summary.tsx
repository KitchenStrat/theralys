"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import { EXTERNAL_PASTE_FALLBACK_ERRORS, EXTERNAL_READ_ERRORS, type ExternalPageKind, type ExternalReadError, type ExternalSiteSource } from "@theralys/shared";
import { PAGE_KIND_LABELS, plural, readsRemaining, readsRemainingLabel, siteAddressLabel, type DetectedItem } from "@/lib/external-site/format";
import { rereadExternalSite } from "./actions";
import { ActionMessage } from "./fields";
import { PasteForm } from "./paste-form";
import { Pill } from "./pill";
import { FOCUS_RING, TEXT_LINK } from "./styles";

/**
 * En-tête du site connecté et lu : son adresse, la date de la dernière
 * lecture, « Relire mon site » avec les lectures restantes du mois, l'échec
 * éventuel de la dernière lecture (le profil précédent est conservé), les
 * pages lues et ce qui a été repéré dans leur code.
 */
export function SiteSummary({
  url,
  source,
  readAtLabel,
  error,
  reads,
  active,
  pages,
  detected,
}: {
  url: string;
  source: ExternalSiteSource;
  /** Date de la dernière lecture aboutie, déjà mise en forme */
  readAtLabel: string | null;
  /** Échec de la dernière lecture : le profil montré est celui de la lecture précédente */
  error: ExternalReadError | null;
  reads: { used: number; limit: number };
  /** Les outils s'appuient sur ce site */
  active: boolean;
  pages: { url: string; kind: ExternalPageKind; title: string }[];
  detected: DetectedItem[];
}) {
  const [pasting, setPasting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wasPasting = useRef(false);
  const pasted = source === "pasted";

  // Formulaire refermé : le focus revient au bouton qui l'avait ouvert
  useEffect(() => {
    if (wasPasting.current && !pasting) document.getElementById("open-paste")?.focus();
    wasPasting.current = pasting;
  }, [pasting]);
  const canRead = readsRemaining(reads) > 0;
  // Coller un texte est proposé quand c'est la suite utile : le profil vient déjà d'un texte collé, ou le site vient de refuser la lecture
  const canPaste = pasted || (error !== null && EXTERNAL_PASTE_FALLBACK_ERRORS.includes(error));

  function reread() {
    setNotice(null);
    setFailure(null);
    startTransition(async () => {
      const result = await rereadExternalSite();
      if (result.error) setFailure(result.error);
    });
  }

  return (
    <section aria-labelledby="site-summary-title" data-testid="site-summary">
      <Card className="p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 id="site-summary-title" className="text-xl font-semibold">
                Votre site
              </h2>
              <Pill tone={active ? "success" : "neutral"} data-testid="reference-badge" data-active={active}>
                {active ? (
                  <>
                    <span aria-hidden className="text-success-500">
                      ✓
                    </span>
                    Vos outils s&apos;appuient sur ce site
                  </>
                ) : (
                  "Vos outils ne s'appuient pas encore sur ce site"
                )}
              </Pill>
            </div>
            <p className="mt-1.5 text-base">
              <a href={url} target="_blank" rel="noopener noreferrer" className={`break-all ${TEXT_LINK}`} data-testid="site-url">
                {siteAddressLabel(url)}
                <span aria-hidden> ↗</span>
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            </p>
            <p className="mt-1 text-sm text-ink-700" data-testid="site-read-at">
              {pasted ? "Profil préparé à partir du texte que vous avez collé" : "Dernière lecture"}
              {readAtLabel ? ` le ${readAtLabel}` : ""}.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button type="button" variant="secondary" disabled={pending || !canRead} onClick={reread} data-testid="reread-site">
              {pending ? <Spinner /> : null} Relire mon site
            </Button>
            <p className="max-w-xs text-sm text-ink-700 sm:text-right" data-testid="reads-remaining">
              {readsRemainingLabel(reads)}
            </p>
          </div>
        </div>

        <div className="mt-2">
          <ActionMessage error={failure} notice={notice} testId="summary-message" />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-warning-100 px-4 py-3 text-sm text-ink-900" data-testid="read-warning" data-error={error}>
            <p className="font-semibold">
              <span aria-hidden>⚠ </span>
              La dernière lecture n&apos;a pas abouti : le profil précédent est conservé.
            </p>
            <p className="mt-1">
              {EXTERNAL_READ_ERRORS[error].title}. {EXTERNAL_READ_ERRORS[error].hint}
            </p>
          </div>
        ) : null}

        {canPaste ? (
          <div className="mt-4">
            {pasting ? (
              <div className="rounded-2xl border border-cream-300 p-4">
                <h3 className="text-base font-semibold">Coller le texte de mon site</h3>
                <p className="mb-3 mt-1 text-sm text-ink-700">
                  Collez le texte à jour de vos pages : il remplace ce qui avait été lu. Vos corrections sont conservées.
                </p>
                <PasteForm
                  idPrefix="repaste"
                  onCancel={() => setPasting(false)}
                  onDone={() => {
                    setPasting(false);
                    setNotice("Votre profil a été préparé à partir de ce texte. Relisez-le ci-dessous.");
                  }}
                />
              </div>
            ) : (
              <Button
                id="open-paste"
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-3"
                onClick={() => {
                  setNotice(null);
                  setPasting(true);
                }}
                data-testid="open-paste"
              >
                Coller le texte de mon site
              </Button>
            )}
          </div>
        ) : null}

        {pasted ? null : (
          <div className="mt-5 grid gap-5 border-t border-cream-200 pt-5 md:grid-cols-2">
            <details className="group" data-testid="pages-read">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-base font-semibold text-ink-900 ${FOCUS_RING}`}>
                <span>
                  {pages.length} {plural(pages.length, "page lue", "pages lues")}
                </span>
                <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <ul className="mt-3 space-y-2.5">
                {pages.map((page, index) => (
                  <li key={`${index}-${page.url}`} className="text-sm">
                    <a href={page.url} target="_blank" rel="noopener noreferrer" className={`break-words ${TEXT_LINK}`}>
                      {page.title || siteAddressLabel(page.url)}
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                    <span className="block break-all text-xs text-ink-700">
                      {PAGE_KIND_LABELS[page.kind]} · {siteAddressLabel(page.url)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>

            <div data-testid="detected-list">
              <h3 className="text-base font-semibold text-ink-900">Ce que nous avons repéré</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                {detected.map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-x-2" data-testid={`detected-${item.id}`} data-found={item.found}>
                    <dt className="text-ink-700">{item.label} :</dt>
                    <dd className={item.found ? "font-medium text-ink-900" : "text-ink-700"}>{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
