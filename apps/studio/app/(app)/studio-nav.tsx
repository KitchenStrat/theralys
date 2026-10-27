"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { clsx } from "clsx";

/**
 * Navigation latérale du studio (horizontale et défilable sur mobile, l'onglet
 * actif ramené en vue). L'éditeur de site n'apparaît volontairement pas ici :
 * on y accède depuis la carte « Votre site » de l'Accueil.
 */
export function StudioNav({
  showPublications = true,
  showSocial = true,
  showGoogle = true,
  showAds = true,
}: {
  showPublications?: boolean;
  /** Section « Réseaux sociaux » (démos et formule Scale) */
  showSocial?: boolean;
  /** Section « Fiche Google » (démos et formule Scale) */
  showGoogle?: boolean;
  /** Section « Google Ads » (démos et formule Scale) */
  showAds?: boolean;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Mobile : la barre déborde (6 entrées) — centrer l'onglet actif au chargement et à chaque navigation
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  const items = [
    { href: "/", label: "Accueil", active: pathname === "/" },
    ...(showPublications
      ? [
          {
            href: "/publications",
            label: "Publications",
            active: pathname.startsWith("/publications"),
          },
        ]
      : []),
    ...(showSocial
      ? [
          {
            href: "/reseaux-sociaux",
            label: "Réseaux sociaux",
            active: pathname.startsWith("/reseaux-sociaux"),
          },
        ]
      : []),
    ...(showGoogle
      ? [
          {
            href: "/fiche-google",
            label: "Fiche Google",
            active: pathname.startsWith("/fiche-google"),
          },
        ]
      : []),
    ...(showAds
      ? [
          {
            href: "/google-ads",
            label: "Google Ads",
            active: pathname.startsWith("/google-ads"),
          },
        ]
      : []),
    { href: "/academie", label: "Académie", active: pathname.startsWith("/academie") },
    { href: "/compte", label: "Compte", active: pathname.startsWith("/compte") },
  ];

  return (
    <nav
      ref={navRef}
      aria-label="Navigation"
      className="relative flex items-center gap-1 overflow-x-auto px-4 pb-3 md:flex-col md:items-stretch md:overflow-visible md:px-3 md:pb-0"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={clsx(
            "whitespace-nowrap rounded-xl px-4 py-3 text-base font-medium transition-colors",
            item.active
              ? "bg-primary-100 text-primary-800"
              : "text-ink-500 hover:bg-primary-50 hover:text-primary-700",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
