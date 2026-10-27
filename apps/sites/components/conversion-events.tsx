"use client";

import { useEffect } from "react";
import { hasConversionLabels, type SiteTracking } from "@theralys/shared";
import { conversionKindOf, conversionSendTo } from "@/lib/conversions";
import { ensureGtag, type TrackingWindow } from "@/lib/gtag";
import { clickedTarget } from "@/lib/track-client";
import { useTrackingAllowed } from "./tracking-consent";

/**
 * Conversions Google Ads : après consentement (même mécanique que
 * TrackingScripts : cookie du bandeau, événement `tl:consent`, bandeau
 * désactivé = autorisé), chaque clic sur « Prendre rendez-vous »
 * (`data-track="rdv"`), un numéro (`tel:`) ou une adresse (`mailto:`) envoie
 * `gtag("event", "conversion", { send_to: "AW-…/<libellé>" })` — un seul envoi
 * par clic, seulement pour les actions dont le libellé est renseigné dans le
 * studio (Google Ads → Paramétrage & suivi). Tant que gtag.js n'est pas
 * chargé, la commande attend dans `dataLayer` comme avec la balise officielle.
 * Jamais sans consentement ; jamais dans l'aperçu de l'éditeur (non monté).
 */
export function ConversionEvents({ tracking }: { tracking: SiteTracking }) {
  const allowed = useTrackingAllowed(tracking.cookieBanner === false);
  const adsId = tracking.googleAdsId;
  const labels = tracking.googleAdsConversions;
  const active = Boolean(allowed && adsId && hasConversionLabels(labels));

  useEffect(() => {
    if (!active || !adsId) return;
    const onClick = (event: MouseEvent) => {
      const kind = conversionKindOf(clickedTarget(event.target));
      if (!kind) return;
      const sendTo = conversionSendTo(adsId, labels, kind);
      if (!sendTo) return;
      ensureGtag(window as TrackingWindow)("event", "conversion", { send_to: sendTo });
    };
    // Phase de capture : le clic est vu même si un gestionnaire interne l'arrête
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, adsId, labels]);

  return null;
}
