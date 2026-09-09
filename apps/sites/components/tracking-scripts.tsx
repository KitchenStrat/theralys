"use client";

import { useEffect, useState } from "react";
import type { SiteTracking } from "@theralys/shared";

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

type TrackingWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: FbqFn;
  _fbq?: FbqFn;
};

function readConsent(): string | null {
  const match = document.cookie.match(/(?:^|; )tl_consent=([^;]*)/);
  return match?.[1] ?? null;
}

/**
 * Charge les traceurs configurés dans le studio (Paramètres → Tracking) :
 * Google Analytics / Ads (gtag), Google Tag Manager et Meta Pixel.
 * Bandeau cookies actif (défaut) → chargement uniquement après « Accepter »
 * (approche CNIL : les scripts tiers ne partent jamais sans consentement) ;
 * bandeau désactivé → chargement dès l'arrivée. Chaque script n'est injecté
 * qu'une fois, même si le consentement arrive après coup.
 */
export function TrackingScripts({ tracking }: { tracking: SiteTracking }) {
  const [allowed, setAllowed] = useState(false);
  const bannerOff = tracking.cookieBanner === false;

  useEffect(() => {
    const check = () => setAllowed(bannerOff || readConsent() === "granted");
    check();
    // Le bandeau émet cet événement quand le visiteur fait son choix
    window.addEventListener("tl:consent", check);
    return () => window.removeEventListener("tl:consent", check);
  }, [bannerOff]);

  useEffect(() => {
    if (!allowed) return;
    const w = window as TrackingWindow;
    const gaId = tracking.googleAnalyticsId;
    const adsId = tracking.googleAdsId;
    const gtmId = tracking.googleTagManagerId;
    const pixelId = tracking.metaPixelId;

    // Google Analytics + Google Ads partagent la balise gtag
    if ((gaId || adsId) && !document.getElementById("tl-gtag")) {
      w.dataLayer = w.dataLayer ?? [];
      const gtag = (...args: unknown[]) => {
        w.dataLayer?.push(args);
      };
      w.gtag = gtag;
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

    // Meta Pixel : amorce officielle (file d'attente vidée par fbevents.js)
    if (pixelId && !w.fbq) {
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
      } as FbqFn;
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.push = fbq;
      w.fbq = fbq;
      w._fbq = fbq;
      const script = document.createElement("script");
      script.id = "tl-fbq";
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
      fbq("init", pixelId);
      fbq("track", "PageView");
    }
  }, [allowed, tracking]);

  return null;
}
