"use client";

import { useEffect, useState } from "react";
import { CONSENT_COOKIE_NAME } from "@theralys/shared";

/** Valeur du cookie de consentement posé par le bandeau (`granted` / `denied`), null sans choix. */
export function readConsent(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ?? null;
}

/**
 * Les traceurs tiers (balises, conversions) sont-ils autorisés ? Bandeau
 * cookies actif (défaut) → seulement après « Accepter » (approche CNIL),
 * y compris sans rechargement grâce à l'événement `tl:consent` du bandeau ;
 * bandeau désactivé depuis le studio → dès l'arrivée.
 */
export function useTrackingAllowed(bannerOff: boolean): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = () => setAllowed(bannerOff || readConsent() === "granted");
    check();
    window.addEventListener("tl:consent", check);
    return () => window.removeEventListener("tl:consent", check);
  }, [bannerOff]);

  return allowed;
}
