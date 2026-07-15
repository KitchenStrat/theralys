"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Tracking maison first-party : enregistre une page vue à chaque navigation.
 * L'identifiant visiteur (cookie) n'est posé côté serveur qu'avec consentement ;
 * sans consentement l'événement est anonyme (pas de traceur).
 */
export function Tracker({ siteId }: { siteId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, type: "pageview", path: pathname }),
      keepalive: true,
    });
  }, [siteId, pathname]);

  return null;
}
