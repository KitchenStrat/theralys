"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NavAnchor } from "@/lib/nav";
import { RdvButton } from "./rdv-button";

export type MobileNavProps = {
  siteId: string;
  bookingUrl: string | null;
  /** Préfixe des liens internes (segment [site]) */
  prefix: string;
  /** Ancres de l'accueil (sections existantes et visibles) */
  anchors: NavAnchor[];
  /** Pages de spécialité activées */
  motifPages: { slug: string; title: string }[];
  /** Rubrique blog accessible (formule) */
  blog: boolean;
  /** Téléphone de la section Contact de l'accueil */
  phone: string | null;
};

/**
 * Menu mobile de l'en-tête (< lg) : bouton hamburger + panneau plein écran
 * avec les mêmes liens que la navigation desktop, la liste des spécialités,
 * le blog, le bouton de prise de rendez-vous et le téléphone.
 * Accessible : `aria-expanded`/`aria-controls`, Échap ferme, le focus entre
 * dans le panneau à l'ouverture et revient sur le bouton à la fermeture, le
 * défilement de la page est bloqué tant que le menu est ouvert.
 * Le panneau est rendu dans un portail sur <body> : l'en-tête (sticky,
 * `backdrop-blur`) est un bloc conteneur pour ses descendants `fixed`, le
 * panneau y resterait sinon confiné à la hauteur de la barre.
 */
export function MobileNav({ siteId, bookingUrl, prefix, anchors, motifPages, blog, phone }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const home = prefix || "/";

  // Navigation interne (lien du menu) : le panneau se referme
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      toggle?.focus();
    };
  }, [open]);

  const linkClass =
    "block rounded-[var(--r-md)] px-3 py-3 text-lg font-medium transition-colors hover:bg-[var(--site-soft)] hover:text-[var(--site-primary)]";

  // Cible du portail : le conteneur thémé du site (variables CSS et police du
  // thème y sont définies, pas sur <body>) — il n'est pas un bloc conteneur
  // pour `fixed`, le panneau couvre donc bien tout l'écran.
  function portalTarget(): HTMLElement {
    return document.querySelector<HTMLElement>("[data-ambiance]") ?? document.body;
  }

  const panel = (
    <div
      id={panelId}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-medium uppercase tracking-wider opacity-60">Menu</span>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
          className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-colors hover:bg-[var(--site-soft)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav aria-label="Navigation principale (mobile)" className="flex-1 px-4 pb-8">
        <ul className="space-y-0.5">
          <li>
            <Link href={home} className={linkClass} onClick={() => setOpen(false)}>
              Accueil
            </Link>
          </li>
          {anchors.map((anchor) => (
            <li key={anchor.href}>
              <Link href={`${home}${anchor.href}`} className={linkClass} onClick={() => setOpen(false)}>
                {anchor.label}
              </Link>
            </li>
          ))}
          {blog ? (
            <li>
              <Link href={`${prefix}/blog`} className={linkClass} onClick={() => setOpen(false)}>
                Blog
              </Link>
            </li>
          ) : null}
        </ul>

        {motifPages.length > 0 ? (
          <div className="mt-6 border-t border-[var(--site-text)]/10 pt-5">
            <p className="px-3 text-[0.8rem] font-medium uppercase tracking-wider opacity-60">Spécialités</p>
            <ul className="mt-2 space-y-0.5">
              {motifPages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`${prefix}/motifs/${page.slug}`}
                    className="block rounded-[var(--r-md)] px-3 py-2.5 text-base transition-colors hover:bg-[var(--site-soft)] hover:text-[var(--site-primary)]"
                    onClick={() => setOpen(false)}
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 border-t border-[var(--site-text)]/10 pt-6">
          <RdvButton
            siteId={siteId}
            bookingUrl={bookingUrl}
            className="btn-glow inline-flex items-center justify-center rounded-[var(--r-pill)] bg-[var(--site-primary)] px-7 py-3.5 text-[1.05rem] font-semibold text-white transition-colors hover:bg-[var(--site-primary-dark)]"
          />
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] border border-[var(--site-primary)]/50 px-7 py-3.5 text-[1.05rem] font-medium text-[var(--site-primary)] transition-colors hover:bg-[var(--site-soft)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              Appeler au {phone}
            </a>
          ) : null}
        </div>
      </nav>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Ouvrir le menu"
        className="flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] transition-colors hover:bg-[var(--site-soft)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {open ? createPortal(panel, portalTarget()) : null}
    </div>
  );
}
