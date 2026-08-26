"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/demos", label: "Démos" },
  { href: "/clients", label: "Clients" },
  { href: "/leads", label: "Leads" },
];

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Navigation admin">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary-500 text-white shadow-[0_6px_16px_-6px_rgb(14_151_221/0.55)]"
                : "text-ink-500 hover:bg-primary-50 hover:text-primary-700",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
