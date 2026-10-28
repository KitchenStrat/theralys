"use client";

import { useEffect } from "react";
import { hasConversionLabels, type SiteTracking } from "@theralys/shared";
import { conversionKindOf, conversionSendTo, pixelEventOf } from "@/lib/conversions";
import { ensureFbq, type FbqWindow } from "@/lib/fbq";
import { ensureGtag, type TrackingWindow } from "@/lib/gtag";
import { clickedTarget } from "@/lib/track-client";
import { useTrackingAllowed } from "./tracking-consent";

/**
 * Conversions publicitaires : après consentement (même mécanique que
 * TrackingScripts : cookie du bandeau, événement `tl:consent`, bandeau
 * désactivé = autorisé), chaque clic sur « Prendre rendez-vous »
 * (`data-track="rdv"`), un numéro (`tel:`) ou une adresse (`mailto:`) envoie,
 * depuis un seul gestionnaire et une seule fois par clic :
 * - Google Ads : `gtag("event", "conversion", { send_to: "AW-…/<libellé>" })`,
 *   seulement pour les actions dont le libellé est renseigné dans le studio
 *   (Google Ads → Paramétrage & suivi) ; tant que gtag.js n'est pas chargé, la
 *   commande attend dans `dataLayer` comme avec la balise officielle ;
 * - Meta Pixel (identifiant renseigné dans Meta Ads → Paramétrage & suivi) :
 *   `fbq("track", "Schedule")` pour le rendez-vous, `fbq("track", "Contact")`
 *   pour le téléphone et l'e-mail ; tant que fbevents.js n'est pas chargé, la
 *   commande attend dans `fbq.queue` (amorce partagée avec TrackingScripts, qui
 *   a déjà émis `init` et `PageView`).
 * Jamais sans consentement ; jamais dans l'aperçu de l'éditeur (non monté).
 */
export function ConversionEvents({ tracking }: { tracking: SiteTracking }) {
  const allowed = useTrackingAllowed(tracking.cookieBanner === false);
  const adsId = tracking.googleAdsId;
  const labels = tracking.googleAdsConversions;
  const googleActive = Boolean(adsId && hasConversionLabels(labels));
  const metaActive = Boolean(tracking.metaPixelId);
  const active = allowed && (googleActive || metaActive);

  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      const kind = conversionKindOf(clickedTarget(event.target));
      if (!kind) return;
      if (googleActive && adsId) {
        const sendTo = conversionSendTo(adsId, labels, kind);
        if (sendTo) ensureGtag(window as TrackingWindow)("event", "conversion", { send_to: sendTo });
      }
      if (metaActive) ensureFbq(window as FbqWindow)("track", pixelEventOf(kind));
    };
    // Phase de capture : le clic est vu même si un gestionnaire interne l'arrête
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, googleActive, metaActive, adsId, labels]);

  return null;
}
