"use client";

/**
 * Bouton « Prendre Rendez-Vous » : chaque clic est compté (tracking maison,
 * sans identifiant — les clics sont comptés même sans consentement).
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

  function onClick() {
    const payload = JSON.stringify({
      siteId,
      type: "rdv_click",
      path: window.location.pathname,
    });
    try {
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
    } catch {
      void fetch("/api/track", { method: "POST", body: payload, keepalive: true });
    }
  }

  return (
    <a
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={
        className ??
        "inline-flex items-center justify-center rounded-[var(--r-pill)] bg-[var(--site-primary)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--site-primary-dark)]"
      }
    >
      {label}
    </a>
  );
}
