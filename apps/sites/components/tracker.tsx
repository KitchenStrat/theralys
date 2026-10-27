"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Clé sessionStorage : la provenance (referrer, `src`) n'est envoyée qu'une fois par session. */
const REFERRER_SENT_KEY = "hy_ref_sent";

/**
 * Tracking maison first-party : enregistre une page vue à chaque navigation.
 * L'identifiant visiteur (cookie) n'est posé côté serveur qu'avec consentement ;
 * sans consentement l'événement est anonyme (pas de traceur).
 *
 * Provenance : sur la première page vue de la session seulement, le
 * `document.referrer` et le paramètre `src` du lien de bio (`?src=ig`) sont
 * joints ; le serveur en déduit la source (Instagram, Google, accès direct…).
 * Sans sessionStorage (navigation privée stricte), chaque page vue est
 * traitée comme une première page : au pire une provenance recomptée.
 */
export function Tracker({ siteId }: { siteId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const payload: Record<string, string> = { siteId, type: "pageview", path: pathname };
    if (firstPageOfSession()) {
      payload.referrer = document.referrer.slice(0, 500);
      const src = new URLSearchParams(window.location.search).get("src");
      if (src) payload.src = src.slice(0, 20);
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  }, [siteId, pathname]);

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
