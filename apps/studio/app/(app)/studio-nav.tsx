"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function StudioNav() {
  const pathname = usePathname();
  const tabs = [
    { href: "/", label: "Accueil", active: pathname === "/" },
    { href: "/publications", label: "Publications", active: pathname.startsWith("/publications") },
  ];

  return (
    <nav className="flex items-center gap-1" aria-label="Navigation">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            tab.active
              ? "bg-primary-500 text-white shadow-[0_6px_16px_-6px_rgb(14_151_221/0.55)]"
              : "text-ink-500 hover:bg-primary-50 hover:text-primary-700",
          )}
        >
          {tab.label}
        </Link>
      ))}
      {/* E-learning : phase ultérieure — visible mais inactif */}
      <span
        title="Bientôt disponible"
        className="cursor-not-allowed rounded-full px-4 py-1.5 text-sm font-medium text-ink-300"
      >
        E-learning
      </span>
    </nav>
  );
}
