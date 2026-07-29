import Link from "next/link";
import type { Page, Site } from "@theralys/db";
import { RdvButton } from "./rdv-button";

/**
 * Header du template : logo + nom, nav (Spécialités ▾, À propos, Avis,
 * Déroulement, Questions, Contact, Blog), bouton « Prendre Rendez-Vous ».
 */
export function SiteHeader({
  site,
  motifPages,
  prefix,
}: {
  site: Site;
  motifPages: Page[];
  prefix: string;
}) {
  const home = `${prefix}`;
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[var(--site-bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
        <Link href={home} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--site-soft)] font-semibold text-[var(--site-primary)]"
          >
            {site.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-xl font-bold" style={{ fontFamily: "var(--site-font-heading)" }}>
            {site.name}
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-6 text-[0.95rem] lg:flex">
          {motifPages.length > 0 ? (
            <div className="group relative">
              <button type="button" className="flex items-center gap-1 hover:text-[var(--site-primary)]">
                Spécialités
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <div className="invisible absolute left-0 top-full z-50 w-72 rounded-2xl border border-black/5 bg-[var(--site-surface)] p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                {motifPages.map((page) => (
                  <Link
                    key={page.id}
                    href={`${prefix}/motifs/${page.slug}`}
                    className="block rounded-xl px-3 py-2 hover:bg-[var(--site-soft)]"
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <Link href={`${home}#a-propos`} className="hover:text-[var(--site-primary)]">À propos</Link>
          <Link href={`${home}#avis`} className="hover:text-[var(--site-primary)]">Avis</Link>
          <Link href={`${home}#deroulement`} className="hover:text-[var(--site-primary)]">Déroulement</Link>
          <Link href={`${home}#questions`} className="hover:text-[var(--site-primary)]">Questions</Link>
          <Link href={`${home}#contact`} className="hover:text-[var(--site-primary)]">Contact</Link>
          <Link href={`${prefix}/blog`} className="hover:text-[var(--site-primary)]">Blog</Link>
        </nav>

        <RdvButton
          siteId={site.id}
          bookingUrl={site.bookingUrl}
          className="hidden shrink-0 items-center justify-center btn-glow rounded-[var(--r-pill)] bg-[var(--site-primary)] px-6 py-3 text-[0.95rem] font-semibold text-white transition-colors hover:bg-[var(--site-primary-dark)] sm:inline-flex"
        />
      </div>
    </header>
  );
}
