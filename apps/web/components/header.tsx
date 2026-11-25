"use client";

import { useEffect, useId, useState } from "react";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { Brand } from "./brand";

const LINKS = [
  { href: "#solution", label: "La solution" },
  { href: "#outils", label: "Les outils" },
  { href: "#methode", label: "Méthode" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#faq", label: "Questions" },
];

/** Sur les pages de contenu (blog, pages par métier) : le retour à l'accueil d'abord, puis l'essentiel, et le blog. */
const INNER_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/#solution", label: "La solution" },
  { href: "/#outils", label: "Les outils" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/blog", label: "Blog" },
];

/** Espace client du studio (application séparée). */
const STUDIO_URL = "https://app.harmony-web.fr";

/**
 * `home` : sur l'accueil, les liens mènent aux sections de la page. Ailleurs
 * (blog, pages par métier), les mêmes liens ramènent à l'accueil, section
 * comprise.
 */
export function Header({ home = true }: { home?: boolean }) {
  const to = (anchor: string) => (home ? anchor : `/${anchor}`);
  const links = home ? LINKS : INNER_LINKS;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menu du téléphone : Échap le referme, et il ne survit pas au passage en grand écran
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const floating = scrolled || open;
  // En haut de page, la barre est posée sur la vidéo : ses textes passent en blanc
  const onDark = !floating;

  return (
    <header className="header-in fixed inset-x-0 top-0 z-50 px-3">
      {/* Au défilement, la barre se resserre en pilule flottante translucide */}
      <div
        className={clsx(
          "mx-auto border transition-[background-color,border-color,box-shadow] duration-300",
          floating
            ? "mt-3 max-w-5xl border-cream-200/80 bg-white/85 shadow-[0_18px_40px_-18px_rgb(12_74_110/0.35)] backdrop-blur-xl"
            : "mt-0 max-w-6xl border-transparent bg-transparent",
          open ? "rounded-3xl" : floating ? "rounded-[1.75rem]" : "rounded-3xl",
        )}
      >
        <div className={clsx("flex items-center justify-between gap-2 px-4 sm:px-5", floating ? "h-14" : "h-16")}>
          <a href={home ? "#" : "/"} className="focus-ring inline-flex min-h-11 shrink-0 items-center rounded-lg text-2xl" aria-label={home ? "Harmony, retour en haut de page" : "Harmony, retour à l'accueil"}>
            <Brand onDark={onDark} />
          </a>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navigation principale">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={clsx(
                  "inline-flex min-h-11 items-center rounded-full px-3.5 py-2 text-sm font-medium transition",
                  onDark ? "focus-ring-dark text-white/90 hover:bg-white/15 hover:text-white" : "focus-ring text-ink-700 hover:bg-primary-100/70 hover:text-primary-700",
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <a
              href={STUDIO_URL}
              className={clsx(
                "hidden min-h-11 items-center rounded-full px-3.5 py-2 text-sm font-medium transition sm:inline-flex",
                onDark ? "focus-ring-dark text-white/90 hover:bg-white/15 hover:text-white" : "focus-ring text-ink-700 hover:bg-primary-100/70 hover:text-primary-700",
              )}
            >
              Espace client
            </a>
            <a
              href={to("#demo")}
              className="cta focus-ring inline-flex min-h-11 shrink-0 items-center rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-md shadow-black/15 transition-[background-color,border-color,color,scale] active:scale-[0.98] hover:bg-primary-700 lg:px-5"
            >
              {/* Sur un petit téléphone, la barre garde la place du menu */}
              <span className="sm:hidden">Ma démo</span>
              <span className="hidden sm:inline">Demander une démo</span>
            </a>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
              className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-full transition lg:hidden", onDark ? "focus-ring-dark text-white hover:bg-white/15" : "focus-ring text-ink-700 hover:bg-primary-100/70")}
            >
              <span className="sr-only">{open ? "Fermer le menu" : "Ouvrir le menu"}</span>
              {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
            </button>
          </div>
        </div>

        {/* Menu du téléphone et de la tablette */}
        <nav
          id={menuId}
          aria-label="Navigation principale"
          hidden={!open}
          className="border-t border-cream-200 px-3 pt-2 pb-3 lg:hidden"
        >
          <ul className="grid gap-0.5">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="focus-ring block rounded-xl px-3 py-3 text-base font-medium text-ink-900 transition hover:bg-primary-100/70"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={STUDIO_URL}
                className="focus-ring block rounded-xl px-3 py-3 text-base font-medium text-primary-700 transition hover:bg-primary-100/70"
              >
                Espace client
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
