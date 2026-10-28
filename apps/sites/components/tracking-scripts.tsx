"use client";

import { useEffect } from "react";
import type { SiteTracking } from "@theralys/shared";
import { ensureFbq, type FbqWindow } from "@/lib/fbq";
import { ensureGtag, type TrackingWindow as GtagWindow } from "@/lib/gtag";
import { useTrackingAllowed } from "./tracking-consent";

type TrackingWindow = GtagWindow & FbqWindow;

/**
 * Charge les traceurs configurés dans le studio (Paramètres → Tracking) :
 * Google Analytics / Ads (gtag), Google Tag Manager et Meta Pixel.
 * Bandeau cookies actif (défaut) → chargement uniquement après « Accepter »
 * (approche CNIL : les scripts tiers ne partent jamais sans consentement) ;
 * bandeau désactivé → chargement dès l'arrivée. Chaque script n'est injecté
 * qu'une fois, même si le consentement arrive après coup.
 */
export function TrackingScripts({ tracking }: { tracking: SiteTracking }) {
  const allowed = useTrackingAllowed(tracking.cookieBanner === false);

  useEffect(() => {
    if (!allowed) return;
    const w = window as TrackingWindow;
    const gaId = tracking.googleAnalyticsId;
    const adsId = tracking.googleAdsId;
    const gtmId = tracking.googleTagManagerId;
    const pixelId = tracking.metaPixelId;

    // Google Analytics + Google Ads partagent la balise gtag (amorce officielle :
    // les commandes attendent dans dataLayer sous forme d'objet `arguments`)
    if ((gaId || adsId) && !document.getElementById("tl-gtag")) {
      const gtag = ensureGtag(w);
      gtag("js", new Date());
      if (gaId) gtag("config", gaId);
      if (adsId) gtag("config", adsId);
      const script = document.createElement("script");
      script.id = "tl-gtag";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId || adsId || "")}`;
      document.head.appendChild(script);
    }

    if (gtmId && !document.getElementById("tl-gtm")) {
      w.dataLayer = w.dataLayer ?? [];
      w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      const script = document.createElement("script");
      script.id = "tl-gtm";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
      document.head.appendChild(script);
    }

    // Meta Pixel : amorce officielle partagée avec ConversionEvents (file
    // d'attente vidée par fbevents.js) ; init + PageView puis le script
    if (pixelId && !document.getElementById("tl-fbq")) {
      const fbq = ensureFbq(w);
      fbq("init", pixelId);
      fbq("track", "PageView");
      const script = document.createElement("script");
      script.id = "tl-fbq";
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
  }, [allowed, tracking]);

  return null;
}
