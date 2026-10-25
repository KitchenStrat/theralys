"use client";

import { CONSENT_COOKIE_NAME } from "@theralys/shared";

/**
 * « Gérer les cookies » (pied de page) : efface le choix mémorisé par le
 * bandeau de consentement et le réaffiche (événement `tl:consent-reset`,
 * écouté par ConsentBanner) pour que le visiteur puisse changer d'avis.
 */
export function ManageCookiesButton({ className }: { className?: string }) {
  function onClick() {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent("tl:consent-reset"));
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      Gérer les cookies
    </button>
  );
}
