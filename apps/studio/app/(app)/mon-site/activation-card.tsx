"use client";

import { ChartNoAxesColumn, Check, Clock, Compass, FileText, Link2, PenLine, Undo2, Unplug } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Modal } from "@theralys/ui";
import { Badge, Button, Card, GreetingChip } from "@/components/ds";
import { siteAddressLabel } from "@/lib/external-site/format";
import { activateExternalSite, deactivateExternalSite, disconnectExternalSiteAction, setHostedSiteVisible, type MonSiteResult } from "./actions";
import { ActionMessage, CheckboxField } from "./fields";
import { stepLabel } from "./journey";
import { CARD_TITLE } from "./styles";
import { AnchorButton, Eyebrow, Notice } from "./ui";

const KEEP_VISIBLE_LABEL = "Garder aussi mon site Harmony visible sur Google";
const KEEP_VISIBLE_HINT = "Sans cette option, il reste en ligne mais n'apparaît plus dans les résultats de recherche, pour ne pas faire concurrence à votre site.";

/**
 * Choix du site sur lequel s'appuient les outils. Profil utilisable et site
 * pas encore actif : l'action « Utiliser ce site pour mes outils », avec ce
 * qui change. Profil incomplet : ce qui manque. Site actif : la confirmation,
 * le retour au site Harmony et la déconnexion (avec une étape de
 * confirmation : le profil lu et les corrections sont supprimés).
 *
 * Avant l'activation, la carte est « la prochaine étape » de l'écran (liseré
 * en dégradé, seul bouton principal). Après, elle devient le moment de
 * réussite : un bandeau au dégradé profond de la section, la coche qui
 * surgit, et le titre qui reçoit le focus.
 */
export function ActivationCard({
  url,
  active,
  usable,
  gaps,
  keepHostedIndexed,
}: {
  url: string;
  active: boolean;
  usable: boolean;
  gaps: string[];
  keepHostedIndexed: boolean;
}) {
  const [keepVisible, setKeepVisible] = useState(keepHostedIndexed);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitle = useRef(false);
  const address = siteAddressLabel(url);

  // Le choix enregistré a changé (ici ou dans un autre onglet) : la case le reflète
  useEffect(() => setKeepVisible(keepHostedIndexed), [keepHostedIndexed]);

  // Après l'activation ou le retour au site Harmony, le bouton utilisé a disparu : le focus va au titre, qui dit le nouvel état
  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    titleRef.current?.focus();
  }, [active]);

  function act(action: () => Promise<MonSiteResult>, opts: { done?: string; onError?: () => void; switches?: boolean } = {}) {
    setNotice(null);
    setFailure(null);
    // Posé avant l'appel : la page relue peut arriver avant la suite de cette fonction
    focusTitle.current = opts.switches === true;
    startTransition(async () => {
      const result = await action();
      // Suite marquée comme transition elle aussi : le message arrive dans le même rendu que l'écran relu
      startTransition(() => {
        if (result.error) {
          focusTitle.current = false;
          setFailure(result.error);
          opts.onError?.();
          return;
        }
        setNotice(opts.done ?? null);
      });
    });
  }

  function closeConfirm() {
    if (pending) return;
    setConfirming(false);
    setFailure(null);
  }

  function toggleVisible(checked: boolean) {
    setKeepVisible(checked);
    // Site déjà actif : le choix s'applique tout de suite ; sinon il part avec l'activation
    if (!active) return;
    act(() => setHostedSiteVisible(checked), {
      done: checked ? "C'est noté : votre site Harmony reste visible sur Google." : "C'est noté : votre site Harmony est masqué des moteurs de recherche.",
      onError: () => setKeepVisible(!checked),
    });
  }

  const keepVisibleField = (
    <div className="rounded-ds-md bg-ds-ink-50 px-4 py-3.5 ring-1 ring-ds-ink-200">
      <CheckboxField
        id="keep-hosted-visible"
        checked={keepVisible}
        onChange={toggleVisible}
        label={KEEP_VISIBLE_LABEL}
        // Avant l'activation, la phrase qui précède la case dit déjà ce qu'il advient du site Harmony
        hint={active ? KEEP_VISIBLE_HINT : undefined}
        disabled={pending}
        testId="keep-hosted-visible"
      />
    </div>
  );

  // La coche du bandeau fête l'activation : le message, lui, reste posé (un seul moment de réussite par action)
  const message = <ActionMessage error={confirming ? null : failure} notice={notice} testId="activation-message" calm />;
  const disconnect = (
    <Button type="button" variant="quiet" disabled={pending} icon={<Unplug size={18} aria-hidden />} onClick={() => setConfirming(true)} data-testid="disconnect-site">
      Déconnecter mon site
    </Button>
  );

  return (
    <section id="reference" aria-labelledby="activation-title" className="scroll-mt-6" data-testid="activation-card" data-active={active} data-usable={usable}>
      {active ? (
        <Card padding="none" className="overflow-hidden">
          <div className="relative isolate overflow-hidden bg-ds-section-gradient-deep px-5 py-6 text-ds-section-on-deep sm:px-8 sm:py-8">
            <span aria-hidden className="ds-band-art-deep -z-10" />
            <div className="flex items-start gap-4">
              <span aria-hidden className="relative grid size-12 shrink-0 place-items-center rounded-full bg-white text-ds-success-700 ds-pop">
                <span className="ds-success-ripple" />
                <Check size={28} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-ds-meta font-semibold">{stepLabel("activer")}</p>
                <h2
                  id="activation-title"
                  ref={titleRef}
                  tabIndex={-1}
                  className="mt-0.5 rounded-md font-ds-display text-2xl/8 font-bold text-balance ds-focus-inverse sm:text-[1.75rem]/9"
                  data-testid="activation-confirmation"
                >
                  Vos outils s&apos;appuient sur ce site
                </h2>
                <p className="mt-2 max-w-[60ch] text-base text-pretty">
                  Vos contenus, vos liens et vos statistiques reposent sur <strong className="wrap-anywhere font-semibold">{address}</strong>. Votre site Harmony reste en ligne.
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  <li>
                    <GreetingChip icon={FileText}>Vos contenus</GreetingChip>
                  </li>
                  <li>
                    <GreetingChip icon={Link2}>Vos liens</GreetingChip>
                  </li>
                  <li>
                    <GreetingChip icon={ChartNoAxesColumn}>Vos statistiques</GreetingChip>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="px-5 py-6 sm:px-8">
            {!usable ? (
              <Notice tone="warning" className="mb-5" data-testid="activation-gaps">
                <p className="font-semibold">Votre profil est incomplet&nbsp;: en attendant, vos contenus s&apos;appuient sur votre site Harmony.</p>
                <GapList gaps={gaps} />
                <p className="mt-3">
                  <AnchorButton href="#profil" icon={<PenLine size={16} aria-hidden />}>
                    Compléter le profil
                  </AnchorButton>
                </p>
              </Notice>
            ) : null}
            {keepVisibleField}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ds-ink-200 pt-5">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                loading={pending && !confirming}
                icon={<Undo2 size={18} aria-hidden />}
                onClick={() =>
                  act(deactivateExternalSite, { done: "Vos outils s'appuient de nouveau sur votre site Harmony. Votre profil et vos corrections sont conservés.", switches: true })
                }
                data-testid="deactivate-site"
              >
                Revenir au site Harmony
              </Button>
              {disconnect}
            </div>
            <div className="[&:not(:empty)]:mt-4">{message}</div>
          </div>
        </Card>
      ) : usable ? (
        // « La prochaine étape » : liseré en dégradé (une seule carte par écran) et seul bouton principal de la page
        <div className="rounded-ds-card p-5 shadow-ds-pop ds-border-gradient sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow icon={Compass}>{stepLabel("activer")}</Eyebrow>
            <Badge tone="sun" icon={Clock}>
              Un clic
            </Badge>
          </div>
          <h2 id="activation-title" ref={titleRef} tabIndex={-1} className={`mt-2.5 rounded-md ds-focus ${CARD_TITLE}`}>
            Utiliser ce site pour mes outils
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-base text-ds-ink-700">
            Vos contenus, vos liens et vos statistiques s&apos;appuieront sur <span className="wrap-anywhere font-semibold text-ds-ink-900">{address}</span>. Votre site Harmony restera
            accessible, mais il sera masqué des moteurs de recherche pour ne pas lui faire concurrence.
          </p>
          <div className="mt-5">{keepVisibleField}</div>
          <div className="mt-5">
            <Button
              type="button"
              size="lg"
              disabled={pending}
              loading={pending && !confirming}
              icon={<Check size={20} strokeWidth={2.5} aria-hidden />}
              onClick={() => act(() => activateExternalSite({ keepHostedVisible: keepVisible }), { done: "C'est fait : vos outils s'appuient maintenant sur ce site.", switches: true })}
              data-testid="activate-site"
            >
              Utiliser ce site pour mes outils
            </Button>
          </div>
          <div className="[&:not(:empty)]:mt-4">{message}</div>
          <div className="mt-5 border-t border-ds-ink-200 pt-3">{disconnect}</div>
        </div>
      ) : (
        <Card padding="lg">
          <Eyebrow>{stepLabel("activer")}</Eyebrow>
          <h2 id="activation-title" ref={titleRef} tabIndex={-1} className={`mt-2.5 rounded-md ds-focus ${CARD_TITLE}`}>
            Utiliser ce site pour mes outils
          </h2>
          <Notice tone="warning" className="mt-4" data-testid="activation-gaps">
            <p className="font-semibold">Vos outils ne peuvent pas encore s&apos;appuyer sur ce site&nbsp;: il manque des informations à son profil.</p>
            <GapList gaps={gaps} />
            <p className="mt-3 text-ds-ink-800">Complétez le profil, puis revenez ici.</p>
            <p className="mt-2.5">
              <AnchorButton href="#profil" icon={<PenLine size={16} aria-hidden />}>
                Compléter le profil
              </AnchorButton>
            </p>
          </Notice>
          <div className="[&:not(:empty)]:mt-4">{message}</div>
          <div className="mt-5 border-t border-ds-ink-200 pt-3">{disconnect}</div>
        </Card>
      )}

      <Modal
        open={confirming}
        onClose={closeConfirm}
        title={"Déconnecter mon site\u00a0?"}
        footer={
          // Un seul bloc dans le pied de la fenêtre : sur un téléphone, les deux boutons passent l'un sous l'autre au lieu de déborder
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={closeConfirm} data-testid="disconnect-cancel">
              Annuler
            </Button>
            <Button type="button" variant="danger" disabled={pending} loading={pending} icon={<Unplug size={18} aria-hidden />} onClick={() => act(disconnectExternalSiteAction)} data-testid="disconnect-confirm">
              Oui, déconnecter mon site
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-base text-ds-ink-700" data-testid="disconnect-dialog">
          <p>
            Le profil lu sur <span className="wrap-anywhere font-semibold text-ds-ink-900">{address}</span> et toutes vos corrections seront supprimés.
          </p>
          <p>Vos outils s&apos;appuieront de nouveau sur votre site Harmony. Rien ne change sur votre propre site.</p>
          <p className="text-ds-body text-ds-ink-600">Vous pourrez le reconnecter plus tard&nbsp;: il sera relu, et les lectures déjà faites ce mois-ci restent comptées.</p>
          <ActionMessage error={failure} testId="disconnect-error" />
        </div>
      </Modal>
    </section>
  );
}

function GapList({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return null;
  return (
    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
      {gaps.map((gap) => (
        <li key={gap}>{gap}</li>
      ))}
    </ul>
  );
}
