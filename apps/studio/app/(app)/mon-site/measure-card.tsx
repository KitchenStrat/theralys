"use client";

import { clsx } from "clsx";
import { Ban, ChartNoAxesColumn, ChevronDown, CircleCheck, CircleDashed, Clock, Compass, Cookie, EyeOff, Radar, ScanSearch, SearchCheck, ShieldCheck, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, IconBadge, type BadgeTone } from "@/components/ds";
import { frenchSpacing } from "@/lib/external-site/format";
import { measureStatusLabel, type InstallGuide, type MeasureState } from "@/lib/external-site/measure";
import { CopyButton } from "./copy-button";
import { BADGE_WRAP, CARD_TITLE, FOCUS_RING, SUB_TITLE } from "./styles";
import { Eyebrow, NumberDot } from "./ui";

/** État de l'installation : une icône et un mot, jamais la couleur seule. */
const STATUS: Record<MeasureState, { tone: BadgeTone; icon: LucideIcon }> = {
  seen: { tone: "success", icon: CircleCheck },
  detected: { tone: "brand", icon: Radar },
  missing: { tone: "neutral", icon: CircleDashed },
};

/**
 * « Statistiques de votre site » : ce que le code de mesure compte (et ne
 * fait pas), la balise à copier, le pas-à-pas selon l'outil de création du
 * site (celui qui a été repéré d'abord, les autres repliés), l'état de
 * l'installation et le paragraphe pour la politique de confidentialité.
 *
 * `next` : c'est la prochaine étape du parcours (site activé, aucune visite
 * reçue encore) — la carte prend le liseré en dégradé et « Copier le code »
 * devient le bouton principal de l'écran.
 */
export function MeasureCard({
  tag,
  state,
  seenLabel,
  guides,
  privacyText,
  next = false,
}: {
  /** Balise à coller sur le site du praticien */
  tag: string;
  state: MeasureState;
  /** Date de la première visite reçue, déjà mise en forme */
  seenLabel: string | null;
  guides: { detected: InstallGuide | null; others: InstallGuide[] };
  /** Paragraphe pour la politique de confidentialité du site */
  privacyText: string;
  next?: boolean;
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
      {/* Le même élément dans les deux cas (et non `Card` d'un côté, un bloc de l'autre) : la carte ne se remonte pas quand elle devient la prochaine étape */}
      <div className={clsx("rounded-ds-card p-6 sm:p-8", next ? "shadow-ds-pop ds-border-gradient" : "bg-white shadow-ds-card ring-1 ring-ds-ink-900/5")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow icon={next ? Compass : undefined}>Étape 4 · Mesurer</Eyebrow>
          {next ? (
            <Badge tone="sun" icon={Clock}>
              Quelques minutes
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 flex items-start gap-3.5">
          <IconBadge icon={ChartNoAxesColumn} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 id="measure-title" className={CARD_TITLE}>
                Statistiques de votre site
              </h2>
              <Badge tone={STATUS[state].tone} icon={STATUS[state].icon} className={BADGE_WRAP} data-testid="measure-status" data-state={state}>
                {status}
              </Badge>
            </div>
            <p className="mt-2 max-w-[62ch] text-base text-ds-ink-700">
              Pour suivre ici les visites de votre site, collez-y le petit code ci-dessous. Il compte les visites, le site d&apos;où viennent vos visiteurs, et les clics sur vos liens de
              rendez-vous et sur votre numéro de téléphone. Il ne dépose aucun cookie et ne fait aucun suivi publicitaire&nbsp;: il ne demande donc pas de bandeau de consentement.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              <li>
                <Badge tone="section" icon={Cookie}>
                  Aucun cookie
                </Badge>
              </li>
              <li>
                <Badge tone="section" icon={EyeOff}>
                  Aucun suivi publicitaire
                </Badge>
              </li>
              <li>
                <Badge tone="section" icon={ShieldCheck} className={BADGE_WRAP}>
                  Pas de bandeau de consentement à ajouter
                </Badge>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-7">
          <h3 className={clsx("flex items-center gap-3", SUB_TITLE)}>
            <NumberDot>1</NumberDot>
            Copiez ce code
          </h3>
          <div className="mt-3 sm:pl-10">
            {/* Le code passe à la ligne plutôt que de déborder : il se lit et se sélectionne en entier, même sur un téléphone */}
            <pre className="rounded-ds-sm bg-ds-section-tint px-4 py-3 font-mono text-sm break-all whitespace-pre-wrap text-ds-ink-900 ring-1 ring-ds-section-line">
              <code data-testid="measure-tag">{tag}</code>
            </pre>
            <div className="mt-3">
              <CopyButton text={tag} label="Copier le code" copiedLabel="Code copié" testId="copy-measure-tag" variant={next ? "primary" : "secondary"} />
            </div>
          </div>
        </div>

        <div className="mt-7">
          <h3 className={clsx("flex items-center gap-3", SUB_TITLE)}>
            <NumberDot>2</NumberDot>
            Collez-le sur votre site
          </h3>
          <div className="mt-3 sm:pl-10">
            {detected ? (
              <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70" data-testid={`install-guide-${detected.id}`} data-detected="true">
                <p className="flex items-center gap-1.5 text-ds-meta font-semibold text-ds-section-accent">
                  <ScanSearch size={15} strokeWidth={2.25} aria-hidden />
                  Repéré à la lecture de vos pages
                </p>
                <p className="mt-1 text-base font-semibold text-ds-ink-900">Votre site a été créé avec {detected.label}</p>
                <GuideBody guide={detected} />
              </div>
            ) : (
              <p className="text-ds-body text-ds-ink-700">Choisissez l&apos;outil avec lequel votre site a été créé.</p>
            )}
            <div className="mt-4">
              {detected ? <p className="text-ds-body font-medium text-ds-ink-700">Avec un autre outil&nbsp;:</p> : null}
              <ul className="mt-2 space-y-2">
                {others.map((guide) => (
                  <li key={guide.id}>
                    <details className="group rounded-ds-sm bg-white ring-1 ring-ds-ink-200" data-testid={`install-guide-${guide.id}`}>
                      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-ds-sm px-4 py-2 text-base font-medium text-ds-ink-900 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                          {guide.label}
                          {guide.possible ? null : (
                            <Badge tone="neutral" icon={Ban}>
                              installation impossible
                            </Badge>
                          )}
                        </span>
                        <ChevronDown size={20} aria-hidden className="shrink-0 text-ds-ink-600 transition-transform duration-ds-base ease-ds-out group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <div className="px-4 pb-4">
                        <GuideBody guide={guide} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <h3 className={clsx("flex items-center gap-3", SUB_TITLE)}>
            <NumberDot>3</NumberDot>
            Vérifiez que cela fonctionne
          </h3>
          <div className="mt-2 sm:pl-10">
            <p className="max-w-[62ch] text-ds-body text-ds-ink-700">
              Une fois le code en place, ouvrez votre site dans un nouvel onglet, puis revenez ici et cliquez sur «&nbsp;Vérifier&nbsp;». Si votre navigateur est réglé sur «&nbsp;Ne pas me pister&nbsp;», votre
              propre visite n&apos;est pas comptée&nbsp;: c&apos;est voulu.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" loading={checking} icon={<SearchCheck size={16} aria-hidden />} onClick={() => startChecking(() => router.refresh())} data-testid="measure-check">
                Vérifier
              </Button>
              {/* Région vivante permanente : le résultat de la vérification y est annoncé */}
              <p className="text-ds-body font-medium text-ds-ink-900" role="status" data-testid="measure-check-result">
                {checking ? "Vérification en cours…" : checked ? `Vérifié à l'instant\u00a0: ${status.charAt(0).toLowerCase()}${status.slice(1)}.` : null}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7 border-t border-ds-ink-200 pt-6">
          <div className="flex items-start gap-3">
            <IconBadge icon={ShieldCheck} tone="soft" size="sm" />
            <div className="min-w-0">
              <h3 className={SUB_TITLE}>À ajouter à votre politique de confidentialité</h3>
              <p className="mt-1 max-w-[62ch] text-ds-body text-ds-ink-700">
                Vos visiteurs doivent être informés de cette mesure et pouvoir la refuser. Copiez ce paragraphe dans la page «&nbsp;Politique de confidentialité&nbsp;» (ou «&nbsp;Mentions légales&nbsp;») de
                votre site&nbsp;: il donne l&apos;adresse à ouvrir pour refuser la mesure.
              </p>
            </div>
          </div>
          <blockquote
            className="mt-4 max-w-3xl rounded-ds-sm border-l-4 border-ds-section-accent bg-ds-ink-50 px-4 py-3.5 text-ds-body wrap-anywhere whitespace-pre-line text-ds-ink-800"
            data-testid="privacy-paragraph"
          >
            {privacyText}
          </blockquote>
          <div className="mt-3">
            <CopyButton text={privacyText} label="Copier le paragraphe" copiedLabel="Paragraphe copié" testId="copy-privacy-paragraph" />
          </div>
        </div>
      </div>
    </section>
  );
}

function GuideBody({ guide }: { guide: InstallGuide }) {
  return (
    <div className="mt-2 max-w-[62ch] text-ds-body text-ds-ink-700">
      {guide.requirement ? <p className="mb-2">{frenchSpacing(guide.requirement)}</p> : null}
      {guide.steps.length > 0 ? (
        <ol className="list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-ds-section-accent">
          {guide.steps.map((step) => (
            <li key={step} className="pl-1">
              {frenchSpacing(step)}
            </li>
          ))}
        </ol>
      ) : null}
      {guide.note ? <p className={guide.steps.length > 0 ? "mt-2" : undefined}>{frenchSpacing(guide.note)}</p> : null}
    </div>
  );
}
