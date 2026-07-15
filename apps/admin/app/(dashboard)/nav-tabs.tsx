"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/demos", label: "Démos" },
  { href: "/clients", label: "Clients" },
  { href: "/leads", label: "Leads" },
];

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Navigation admin">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-cream-200 text-ink-900" : "text-ink-500 hover:text-ink-900",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
