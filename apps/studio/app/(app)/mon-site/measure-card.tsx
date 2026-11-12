"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Spinner } from "@theralys/ui";
import { measureStatusLabel, type InstallGuide, type MeasureState } from "@/lib/external-site/measure";
import { CopyButton } from "./copy-button";
import { Pill } from "./pill";
import { FOCUS_RING } from "./styles";

/**
 * « Statistiques de votre site » : ce que le code de mesure compte (et ne
 * fait pas), la balise à copier, le pas-à-pas selon l'outil de création du
 * site (celui qui a été repéré d'abord, les autres repliés), l'état de
 * l'installation et le paragraphe pour la politique de confidentialité.
 */
export function MeasureCard({
  tag,
  state,
  seenLabel,
  guides,
  privacyText,
}: {
  /** Balise à coller sur le site du praticien */
  tag: string;
  state: MeasureState;
  /** Date de la première visite reçue, déjà mise en forme */
  seenLabel: string | null;
  guides: { detected: InstallGuide | null; others: InstallGuide[] };
  /** Paragraphe pour la politique de confidentialité du site */
  privacyText: string;
}) {
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  const [checked, setChecked] = useState(false);
  const wasChecking = useRef(false);
  const { detected, others } = guides;
  const status = measureStatusLabel(state, seenLabel);

  // La vérification vient de se terminer : l'état relu est annoncé, même s'il n'a pas changé
  useEffect(() => {
    if (wasChecking.current && !checking) setChecked(true);
    wasChecking.current = checking;
  }, [checking]);

  return (
    <section id="statistiques" aria-labelledby="measure-title" className="scroll-mt-6" data-testid="measure-card">
      <Card className="p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id="measure-title" className="text-xl font-semibold">
            Statistiques de votre site
          </h2>
          <Pill tone={state === "seen" ? "success" : "neutral"} data-testid="measure-status" data-state={state}>
            {state === "seen" ? (
              <span aria-hidden className="text-success-500">
                ✓
              </span>
            ) : null}
            {status}
          </Pill>
        </div>
        <p className="mt-2 max-w-2xl text-base text-ink-700">
          Pour suivre ici les visites de votre site, collez-y le petit code ci-dessous. Il compte les visites, le site d&apos;où viennent vos visiteurs, et les clics sur vos liens de
          rendez-vous et sur votre numéro de téléphone. Il ne dépose aucun cookie et ne fait aucun suivi publicitaire : il ne demande donc pas de bandeau de consentement.
        </p>

        <div className="mt-5">
          <h3 className="text-base font-semibold text-ink-900">1. Copiez ce code</h3>
          {/* Le code passe à la ligne plutôt que de déborder : il se lit et se sélectionne en entier, même sur un téléphone */}
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-xl border border-cream-300 bg-cream-50 px-3 py-2.5 font-mono text-sm text-ink-900">
            <code data-testid="measure-tag">{tag}</code>
          </pre>
          <div className="mt-2">
            <CopyButton text={tag} label="Copier le code" copiedLabel="Code copié" testId="copy-measure-tag" />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-base font-semibold text-ink-900">2. Collez-le sur votre site</h3>
          {detected ? (
            <div className="mt-2 rounded-2xl border border-cream-300 p-4" data-testid={`install-guide-${detected.id}`} data-detected="true">
              <p className="text-base font-semibold text-ink-900">Votre site a été créé avec {detected.label}</p>
              <GuideBody guide={detected} />
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-700">Choisissez l&apos;outil avec lequel votre site a été créé.</p>
          )}
          <div className="mt-3">
            {detected ? <p className="text-sm font-medium text-ink-700">Avec un autre outil :</p> : null}
            <ul className="mt-1 divide-y divide-cream-200 border-y border-cream-200">
              {others.map((guide) => (
                <li key={guide.id}>
                  <details className="group py-2.5" data-testid={`install-guide-${guide.id}`}>
                    <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-base font-medium text-ink-900 ${FOCUS_RING}`}>
                      <span>
                        {guide.label}
                        {guide.possible ? null : <span className="font-normal text-ink-700"> (installation impossible)</span>}
                      </span>
                      <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-180">
                        ⌄
                      </span>
                    </summary>
                    <GuideBody guide={guide} />
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-base font-semibold text-ink-900">3. Vérifiez que cela fonctionne</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-700">
            Une fois le code en place, ouvrez votre site dans un nouvel onglet, puis revenez ici et cliquez sur « Vérifier ». Si votre navigateur est réglé sur « Ne pas me pister », votre
            propre visite n&apos;est pas comptée : c&apos;est voulu.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" disabled={checking} onClick={() => startChecking(() => router.refresh())} data-testid="measure-check">
              {checking ? <Spinner /> : null} Vérifier
            </Button>
            {/* Région vivante permanente : le résultat de la vérification y est annoncé */}
            <p className="text-sm font-medium text-ink-900" role="status" data-testid="measure-check-result">
              {checking ? "Vérification en cours…" : checked ? `Vérifié à l'instant : ${status.charAt(0).toLowerCase()}${status.slice(1)}.` : null}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-cream-200 pt-5">
          <h3 className="text-base font-semibold text-ink-900">À ajouter à votre politique de confidentialité</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-700">
            Vos visiteurs doivent être informés de cette mesure et pouvoir la refuser. Copiez ce paragraphe dans la page « Politique de confidentialité » (ou « Mentions légales ») de
            votre site : il donne l&apos;adresse à ouvrir pour refuser la mesure.
          </p>
          <blockquote className="mt-2 max-w-3xl whitespace-pre-line break-words rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 text-sm text-ink-900" data-testid="privacy-paragraph">
            {privacyText}
          </blockquote>
          <div className="mt-2">
            <CopyButton text={privacyText} label="Copier le paragraphe" copiedLabel="Paragraphe copié" testId="copy-privacy-paragraph" />
          </div>
        </div>
      </Card>
    </section>
  );
}

function GuideBody({ guide }: { guide: InstallGuide }) {
  return (
    <div className="mt-2 max-w-2xl text-sm text-ink-700">
      {guide.requirement ? <p className="mb-2">{guide.requirement}</p> : null}
      {guide.steps.length > 0 ? (
        <ol className="list-decimal space-y-1.5 pl-5">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {guide.note ? <p className={guide.steps.length > 0 ? "mt-2" : undefined}>{guide.note}</p> : null}
    </div>
  );
}
