"use client";

import { ChevronDown, CircleCheck, CircleDashed, ClipboardPaste, Clock, ExternalLink, FileText, Globe, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { EXTERNAL_PASTE_FALLBACK_ERRORS, EXTERNAL_READ_ERRORS, type ExternalPageKind, type ExternalReadError, type ExternalSiteSource } from "@theralys/shared";
import { Badge, Button, Card, IconBadge } from "@/components/ds";
import { PAGE_KIND_LABELS, frenchSpacing, plural, readsRemaining, readsRemainingLabel, siteAddressLabel, type DetectedItem } from "@/lib/external-site/format";
import { rereadExternalSite } from "./actions";
import { ActionMessage } from "./fields";
import { PasteForm } from "./paste-form";
import { BADGE_WRAP, CARD_TITLE, FOCUS_RING, SUB_TITLE, TEXT_LINK } from "./styles";
import { Eyebrow, Notice } from "./ui";

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
    <section id="votre-site" aria-labelledby="site-summary-title" className="scroll-mt-6" data-testid="site-summary">
      <Card padding="lg">
        <Eyebrow>Étape 1 · Connecter</Eyebrow>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3.5">
            <IconBadge icon={Globe} size="lg" className="max-sm:size-11 max-sm:rounded-ds-sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2 id="site-summary-title" className={CARD_TITLE}>
                  Votre site
                </h2>
                <Badge tone={active ? "success" : "neutral"} icon={active ? CircleCheck : CircleDashed} className={BADGE_WRAP} data-testid="reference-badge" data-active={active}>
                  {active ? "Vos outils s'appuient sur ce site" : "Vos outils ne s'appuient pas encore sur ce site"}
                </Badge>
              </div>
              <p className="mt-1.5 text-lg/7">
                <a href={url} target="_blank" rel="noopener noreferrer" className={`wrap-anywhere ${TEXT_LINK}`} data-testid="site-url">
                  {siteAddressLabel(url)}
                  <ExternalLink size={16} aria-hidden className="ml-1.5 inline-block align-[-2px]" />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              </p>
              <p className="mt-1.5 flex items-start gap-1.5 text-ds-body text-ds-ink-600" data-testid="site-read-at">
                <Clock size={16} aria-hidden className="mt-1 shrink-0" />
                <span>
                  {pasted ? "Profil préparé à partir du texte que vous avez collé" : "Dernière lecture"}
                  {readAtLabel ? ` le ${readAtLabel}` : ""}.
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button type="button" variant="secondary" disabled={pending || !canRead} loading={pending} icon={<RefreshCw size={18} aria-hidden />} onClick={reread} data-testid="reread-site">
              Relire mon site
            </Button>
            <p className="max-w-xs text-ds-meta text-ds-ink-600 sm:text-right" data-testid="reads-remaining">
              {frenchSpacing(readsRemainingLabel(reads))}
            </p>
          </div>
        </div>

        <div className="[&:not(:empty)]:mt-3">
          <ActionMessage error={failure} notice={notice} testId="summary-message" />
        </div>

        {error ? (
          <Notice tone="warning" className="mt-5" data-testid="read-warning" data-error={error}>
            <p className="font-semibold">La dernière lecture n&apos;a pas abouti&nbsp;: le profil précédent est conservé.</p>
            <p className="mt-1 text-ds-ink-800">{frenchSpacing(`${EXTERNAL_READ_ERRORS[error].title}. ${EXTERNAL_READ_ERRORS[error].hint}`)}</p>
          </Notice>
        ) : null}

        {canPaste ? (
          <div className="mt-5">
            {pasting ? (
              <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
                <h3 className={SUB_TITLE}>Coller le texte de mon site</h3>
                <p className="mt-1 mb-4 text-ds-body text-ds-ink-700">
                  Collez le texte à jour de vos pages&nbsp;: il remplace ce qui avait été lu. Vos corrections sont conservées.
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
                variant="secondary"
                size="sm"
                icon={<ClipboardPaste size={16} aria-hidden />}
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
          <div className="mt-6 space-y-5 border-t border-ds-ink-200 pt-5">
            <details className="group rounded-ds-md bg-ds-section-tint ring-1 ring-ds-section-line/70" data-testid="pages-read">
              <summary className={`flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-ds-md px-4 py-2 text-base font-semibold text-ds-section-ink [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
                <FileText size={20} aria-hidden className="shrink-0 text-ds-section-accent" />
                <span className="min-w-0 flex-1">
                  {pages.length} {plural(pages.length, "page lue", "pages lues")}
                </span>
                <ChevronDown size={20} aria-hidden className="shrink-0 text-ds-ink-600 transition-transform duration-ds-base ease-ds-out group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <ul className="space-y-3 px-4 pt-1 pb-4">
                {pages.map((page, index) => (
                  <li key={`${index}-${page.url}`} className="text-ds-body">
                    <a href={page.url} target="_blank" rel="noopener noreferrer" className={`wrap-anywhere ${TEXT_LINK}`}>
                      {page.title || siteAddressLabel(page.url)}
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                    <span className="mt-0.5 block wrap-anywhere text-ds-meta text-ds-ink-600">
                      {PAGE_KIND_LABELS[page.kind]} · {siteAddressLabel(page.url)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>

            <div data-testid="detected-list">
              <h3 className={SUB_TITLE}>Ce que nous avons repéré</h3>
              <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {detected.map((item) => (
                  // Repéré ou non : le pictogramme et le texte le disent tous les deux (jamais la couleur seule)
                  <div key={item.id} className="rounded-ds-sm bg-ds-ink-50 px-3.5 py-2.5 ring-1 ring-ds-ink-200" data-testid={`detected-${item.id}`} data-found={item.found}>
                    <dt className="flex items-start gap-2 text-ds-meta text-ds-ink-600">
                      {item.found ? (
                        <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-ds-success-700" />
                      ) : (
                        <CircleDashed size={16} aria-hidden className="mt-0.5 shrink-0 text-ds-ink-500" />
                      )}
                      <span>{item.label}&nbsp;:</span>
                    </dt>
                    <dd className={item.found ? "pl-6 text-ds-body font-semibold text-ds-ink-900" : "pl-6 text-ds-body text-ds-ink-700"}>{item.detail}</dd>
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
