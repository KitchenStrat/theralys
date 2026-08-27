"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

/**
 * Navigation latérale du studio (horizontale et défilable sur mobile).
 * L'éditeur de site n'apparaît volontairement pas ici : on y accède
 * depuis la carte « Votre site » de l'Accueil.
 */
export function StudioNav({ showPublications = true }: { showPublications?: boolean }) {
  const pathname = usePathname();
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
    { href: "/mots-cles", label: "Mots-clés", active: pathname.startsWith("/mots-cles") },
    { href: "/academie", label: "Académie", active: pathname.startsWith("/academie") },
    { href: "/compte", label: "Compte", active: pathname.startsWith("/compte") },
  ];

  return (
    <nav
      aria-label="Navigation"
      className="flex items-center gap-1 overflow-x-auto px-4 pb-3 md:flex-col md:items-stretch md:overflow-visible md:px-3 md:pb-0"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={clsx(
            "whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
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
