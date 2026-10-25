import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { NOT_FOUND_SPECIALTIES } from "@theralys/shared";
import { resolveNotFound } from "@/lib/not-found";
import { getMotifPages, getSiteByKey } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: false },
};

/**
 * Page introuvable thématisée (le layout du segment [site] fournit en-tête,
 * pied de page et variables du thème). Les réglages viennent du studio
 * (`theme.notFound`) fusionnés avec les défauts. La page ne reçoit pas les
 * paramètres de route : la clé du site est lue dans l'en-tête `x-hy-site`
 * posé par le middleware ; sans site résolu, rendu neutre.
 */
export default async function SiteNotFound() {
  const siteKey = (await headers()).get("x-hy-site");
  const site = siteKey ? await getSiteByKey(siteKey) : null;

  if (!site || !siteKey) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <p className="text-sm font-medium uppercase tracking-wider opacity-60">Erreur 404</p>
          <h1 className="mt-3 text-3xl font-bold">Page introuvable</h1>
          <p className="mt-3 opacity-70">La page demandée n&apos;existe pas ou n&apos;est plus disponible.</p>
        </div>
      </main>
    );
  }

  const settings = resolveNotFound(site.theme.notFound);
  const specialties = settings.showSpecialties
    ? (await getMotifPages(site)).slice(0, NOT_FOUND_SPECIALTIES)
    : [];
  const prefix = `/${siteKey}`;

  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="wave-bg absolute inset-0" />
      <div
        aria-hidden
        className="glow h-80 w-80 opacity-40"
        style={{
          right: "-5rem",
          top: "-4rem",
          background: "radial-gradient(circle, color-mix(in srgb, var(--site-primary) 18%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center lg:py-28">
        <span className="inline-block rounded-[var(--r-pill)] bg-[var(--site-soft)] px-5 py-2 text-[0.85rem] font-medium uppercase tracking-wider text-[var(--site-primary-dark)]">
          Erreur 404
        </span>
        <h1 className="mt-6 text-[2.4rem] font-semibold leading-[1.1] text-[var(--site-primary-dark)] sm:text-[3.2rem]">
          {settings.title}
        </h1>
        {settings.message ? <p className="mt-5 max-w-xl text-xl opacity-80">{settings.message}</p> : null}
        <Link
          href={prefix}
          className="btn-glow mt-9 inline-flex items-center justify-center rounded-[var(--r-pill)] bg-[var(--site-primary)] px-7 py-3.5 text-[1.05rem] font-semibold text-white transition-colors hover:bg-[var(--site-primary-dark)]"
        >
          {settings.buttonLabel}
        </Link>
        {specialties.length > 0 ? (
          <nav aria-label="Spécialités" className="mt-14 w-full">
            <p className="text-sm font-medium uppercase tracking-wider opacity-60">Vous cherchiez peut-être</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {specialties.map((page) => (
                <li key={page.id}>
                  <Link
                    href={`${prefix}/motifs/${page.slug}`}
                    className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--site-surface)] px-5 py-4 text-left font-medium shadow-sm transition hover:-translate-y-0.5 hover:text-[var(--site-primary)] hover:shadow-md"
                  >
                    <span>{page.title}</span>
                    <span aria-hidden className="shrink-0 text-[var(--site-primary)]">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
