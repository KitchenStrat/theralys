"use client";

import { sendClickEvent } from "@/lib/track-client";

/**
 * Bouton « Prendre Rendez-Vous » : chaque clic est compté (tracking maison,
 * sans identifiant — les clics sont comptés même sans consentement), avec la
 * provenance de la session (lien de bio, annonce Google). `data-track="rdv"`
 * sert aussi aux conversions Google Ads (ConversionEvents), après consentement.
 */
export function RdvButton({
  siteId,
  bookingUrl,
  label = "Prendre Rendez-Vous",
  className,
}: {
  siteId: string;
  bookingUrl: string | null;
  label?: string;
  className?: string;
}) {
  const href = bookingUrl ?? "#contact";
  const external = Boolean(bookingUrl && !bookingUrl.startsWith("#"));

  return (
    <a
      href={href}
      onClick={() => sendClickEvent(siteId, "rdv_click")}
      data-track="rdv"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={
        className ??
        "btn-glow inline-flex items-center justify-center rounded-[var(--r-pill)] bg-[var(--site-primary)] px-7 py-3.5 text-[1.05rem] font-semibold text-white transition-colors hover:bg-[var(--site-primary-dark)]"
      }
    >
      {label}
    </a>
  );
}
