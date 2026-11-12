"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Modal, Spinner } from "@theralys/ui";
import { siteAddressLabel } from "@/lib/external-site/format";
import { activateExternalSite, deactivateExternalSite, disconnectExternalSiteAction, setHostedSiteVisible, type MonSiteResult } from "./actions";
import { ActionMessage, CheckboxField } from "./fields";
import { TEXT_LINK } from "./styles";

const KEEP_VISIBLE_LABEL = "Garder aussi mon site Harmony visible sur Google";
const KEEP_VISIBLE_HINT = "Sans cette option, il reste en ligne mais n'apparaît plus dans les résultats de recherche, pour ne pas faire concurrence à votre site.";

/**
 * Choix du site sur lequel s'appuient les outils. Profil utilisable et site
 * pas encore actif : l'action « Utiliser ce site pour mes outils », avec ce
 * qui change. Profil incomplet : ce qui manque. Site actif : la confirmation,
 * le retour au site Harmony et la déconnexion (avec une étape de
 * confirmation : le profil lu et les corrections sont supprimés).
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
  );

  return (
    <section id="reference" aria-labelledby="activation-title" className="scroll-mt-6" data-testid="activation-card" data-active={active} data-usable={usable}>
      <Card className="p-6 md:p-7">
        {active ? (
          <>
            <h2 id="activation-title" ref={titleRef} tabIndex={-1} className="flex items-start gap-2 text-xl font-semibold focus:outline-none" data-testid="activation-confirmation">
              <span aria-hidden className="text-success-500">
                ✓
              </span>
              Vos outils s&apos;appuient sur ce site
            </h2>
            <p className="mt-1 max-w-2xl text-base text-ink-700">
              Vos contenus, vos liens et vos statistiques reposent sur <span className="wrap-anywhere font-medium text-ink-900">{address}</span>. Votre site Harmony reste en ligne.
            </p>
            {!usable ? (
              <div className="mt-4 rounded-2xl bg-warning-100 px-4 py-3 text-sm text-ink-900" data-testid="activation-gaps">
                <p className="font-semibold">
                  <span aria-hidden>⚠ </span>
                  Votre profil est incomplet : en attendant, vos contenus s&apos;appuient sur votre site Harmony.
                </p>
                <GapList gaps={gaps} />
              </div>
            ) : null}
            <div className="mt-5">{keepVisibleField}</div>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-cream-200 pt-5">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  act(deactivateExternalSite, { done: "Vos outils s'appuient de nouveau sur votre site Harmony. Votre profil et vos corrections sont conservés.", switches: true })
                }
                data-testid="deactivate-site"
              >
                {pending && !confirming ? <Spinner /> : null} Revenir au site Harmony
              </Button>
              <DisconnectButton pending={pending} onClick={() => setConfirming(true)} />
            </div>
          </>
        ) : (
          <>
            <h2 id="activation-title" ref={titleRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
              Utiliser ce site pour mes outils
            </h2>
            {usable ? (
              <>
                <p className="mt-1 max-w-2xl text-base text-ink-700">
                  Vos contenus, vos liens et vos statistiques s&apos;appuieront sur <span className="wrap-anywhere font-medium text-ink-900">{address}</span>. Votre site Harmony restera
                  accessible, mais il sera masqué des moteurs de recherche pour ne pas lui faire concurrence.
                </p>
                <div className="mt-5">{keepVisibleField}</div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      act(() => activateExternalSite({ keepHostedVisible: keepVisible }), { done: "C'est fait : vos outils s'appuient maintenant sur ce site.", switches: true })
                    }
                    data-testid="activate-site"
                  >
                    {pending && !confirming ? <Spinner className="text-white" /> : null} Utiliser ce site pour mes outils
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-1 max-w-2xl text-base text-ink-700" data-testid="activation-gaps">
                <p>Vos outils ne peuvent pas encore s&apos;appuyer sur ce site : il manque des informations à son profil.</p>
                <GapList gaps={gaps} />
                <p className="mt-3">
                  <a href="#profil" className={TEXT_LINK}>
                    Compléter le profil
                  </a>
                  , puis revenez ici.
                </p>
              </div>
            )}
            <div className="mt-5 border-t border-cream-200 pt-4">
              <DisconnectButton pending={pending} onClick={() => setConfirming(true)} flush />
            </div>
          </>
        )}

        <div className="mt-3">
          <ActionMessage error={confirming ? null : failure} notice={notice} testId="activation-message" />
        </div>
      </Card>

      <Modal
        open={confirming}
        onClose={closeConfirm}
        title="Déconnecter mon site ?"
        footer={
          <>
            <Button type="button" variant="secondary" disabled={pending} onClick={closeConfirm} data-testid="disconnect-cancel">
              Annuler
            </Button>
            <Button type="button" variant="danger" disabled={pending} onClick={() => act(disconnectExternalSiteAction)} data-testid="disconnect-confirm">
              {pending ? <Spinner className="text-white" /> : null} Oui, déconnecter mon site
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-base text-ink-700" data-testid="disconnect-dialog">
          <p>
            Le profil lu sur <span className="wrap-anywhere font-medium text-ink-900">{address}</span> et toutes vos corrections seront supprimés.
          </p>
          <p>Vos outils s&apos;appuieront de nouveau sur votre site Harmony. Rien ne change sur votre propre site.</p>
          <p className="text-sm">Vous pourrez le reconnecter plus tard : il sera relu, et les lectures déjà faites ce mois-ci restent comptées.</p>
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

function DisconnectButton({ pending, onClick, flush = false }: { pending: boolean; onClick: () => void; /** Seul sur sa ligne : son texte s'aligne sur le bord du contenu de la carte */ flush?: boolean }) {
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={onClick} className={flush ? "-ml-4" : undefined} data-testid="disconnect-site">
      Déconnecter mon site
    </Button>
  );
}
