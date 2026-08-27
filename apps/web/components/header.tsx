"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#simulateur", label: "Simulateur" },
  { href: "#temoignages", label: "Témoignages" },
  { href: "#faq", label: "FAQ" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="header-in fixed inset-x-0 top-0 z-50 px-3">
      {/* Au défilement, la barre se resserre en pilule flottante translucide */}
      <div
        className={clsx(
          "mx-auto flex items-center justify-between border px-5 transition-all duration-500 ease-out",
          scrolled
            ? "mt-3 h-14 max-w-5xl rounded-full border-cream-200/80 bg-white/80 shadow-[0_18px_40px_-18px_rgb(12_74_110/0.35)] backdrop-blur-xl"
            : "mt-0 h-16 max-w-6xl rounded-3xl border-transparent bg-transparent",
        )}
      >
        <a href="#" className="font-display shrink-0 text-2xl font-bold">
          <span className="wordmark">Harmony</span>
        </a>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-2.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-primary-100/70 hover:text-primary-700 lg:px-4"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="#demo"
          className="ml-3 shrink-0 whitespace-nowrap rounded-full bg-primary-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_-10px_rgb(14_151_221/0.7)] transition hover:-translate-y-0.5 hover:bg-primary-600 sm:py-2.5 sm:text-sm lg:px-5"
        >
          Demander une démo
        </a>
      </div>
    </header>
  );
}
