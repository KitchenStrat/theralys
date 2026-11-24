"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { StaffRole } from "@/lib/staff";

const TABS = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/couts", label: "API & coûts" },
  { href: "/demos", label: "Démos" },
  { href: "/clients", label: "Clients" },
  { href: "/avis", label: "Avis clients" },
  { href: "/crm", label: "CRM" },
  { href: "/equipe", label: "Équipe" },
];

/** Un commercial n'a que le CRM : les autres onglets ne lui sont pas montrés (et lui sont fermés côté serveur). */
const SALES_TABS = TABS.filter((tab) => tab.href === "/crm");

export function NavTabs({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Navigation admin"
    >
      {(role === "admin" ? TABS : SALES_TABS).map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 pointer-coarse:min-h-11",
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
