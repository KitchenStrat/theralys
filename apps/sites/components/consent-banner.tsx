"use client";

import { useEffect, useState } from "react";

const CONSENT_COOKIE = "tl_consent";
const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 182; // choix mémorisé 6 mois (CNIL)

function readConsent(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return match?.[1] ?? null;
}

/**
 * Bandeau de consentement CNIL/RGPD : la mesure d'audience utilise un cookie,
 * posé uniquement après « Accepter ». « Continuer sans accepter » est offert
 * au même niveau, comme l'exige la CNIL. Le refus est mémorisé aussi.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  function choose(value: "granted" | "denied") {
    document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax`;
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Gestion des cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-[var(--site-surface)] p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm opacity-80">
          Ce site utilise un cookie de mesure d&apos;audience (visiteurs et clics sur la prise de
          rendez-vous). Aucune donnée n&apos;est partagée avec des tiers. Votre choix est conservé
          6&nbsp;mois.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
          >
            Continuer sans accepter
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-full bg-[var(--site-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--site-primary-dark)]"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
