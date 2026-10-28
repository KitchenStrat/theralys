"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { conversionKindOf } from "@/lib/conversions";
import { clickedTarget, landingSource, rememberSessionSource, sendClickEvent } from "@/lib/track-client";

/** Clé sessionStorage : la provenance (referrer, `src`) n'est envoyée qu'une fois par session. */
const REFERRER_SENT_KEY = "hy_ref_sent";

/**
 * Tracking maison first-party : enregistre une page vue à chaque navigation.
 * L'identifiant visiteur (cookie) n'est posé côté serveur qu'avec consentement ;
 * sans consentement l'événement est anonyme (pas de traceur).
 *
 * Provenance : sur la première page vue de la session seulement, le
 * `document.referrer` et le `src` sont joints — paramètre du lien de bio
 * (`?src=ig`) ou, sans `src` explicite, `ads` quand l'URL porte la signature
 * d'une annonce Google (gclid…) et `meta` pour une annonce Meta (fbclid…) ; le
 * serveur en déduit la source (Instagram, Google, Google Ads, Meta Ads, accès
 * direct…). Le `src` envoyé est mémorisé
 * (sessionStorage `hy_src`) pour rattacher à la même provenance les clics RDV
 * et les appels de la session. Sans sessionStorage (navigation privée
 * stricte), chaque page vue est traitée comme une première page : au pire une
 * provenance recomptée, et des clics sans provenance.
 *
 * Appels : tout clic sur un lien `tel:` (en-tête, sections, pied de page) est
 * compté par délégation globale (`call_click`, sendBeacon).
 */
export function Tracker({ siteId }: { siteId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const payload: Record<string, string> = { siteId, type: "pageview", path: pathname };
    if (firstPageOfSession()) {
      payload.referrer = document.referrer.slice(0, 500);
      const src = landingSource(window.location.search);
      if (src) {
        payload.src = src;
        rememberSessionSource(src);
      }
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  }, [siteId, pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (conversionKindOf(clickedTarget(event.target)) === "call") sendClickEvent(siteId, "call_click");
    };
    // Phase de capture : le clic est vu même si un gestionnaire interne l'arrête
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [siteId]);

  return null;
}

/** true une seule fois par session de navigation (garde sessionStorage). */
function firstPageOfSession(): boolean {
  try {
    if (window.sessionStorage.getItem(REFERRER_SENT_KEY)) return false;
    window.sessionStorage.setItem(REFERRER_SENT_KEY, "1");
    return true;
  } catch {
    return true;
  }
}
