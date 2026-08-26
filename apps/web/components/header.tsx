"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
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
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-cream-200/80 bg-white/75 shadow-[0_8px_30px_-18px_rgb(12_74_110/0.25)] backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#" className="font-display text-2xl font-bold">
          <span className="wordmark">Harmony</span>
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-primary-100/70 hover:text-primary-700"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="#demo"
          className="rounded-full bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgb(14_151_221/0.7)] transition hover:-translate-y-0.5 hover:bg-primary-600"
        >
          Demander une démo
        </a>
      </div>
    </header>
  );
}
