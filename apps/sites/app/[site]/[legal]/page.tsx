import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildLegalPage, isLegalPageSlug, LEGAL_PAGES } from "@theralys/shared";
import { Markdown } from "@/components/markdown";
import { buildLegalInput } from "@/lib/legal-input";
import { NOT_FOUND_METADATA } from "@/lib/not-found";
import { getHomePage, getProspect, getSiteByKey, siteBaseUrl } from "@/lib/site-data";

type Props = { params: Promise<{ site: string; legal: string }> };

/**
 * Pages légales générées (mentions légales, confidentialité, cookies) à partir
 * des informations du praticien et des réglages du site — cf.
 * `buildLegalPage` (@theralys/shared). Tout autre slug à ce niveau → 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: siteKey, legal: slug } = await params;
  // Slug inconnu à ce niveau (ex. /<site>/ancienne-page) : métadonnées de la 404
  if (!isLegalPageSlug(slug)) return NOT_FOUND_METADATA;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  const meta = LEGAL_PAGES.find((p) => p.slug === slug)!;
  return {
    // Le layout du site applique le modèle « %s — <nom du site> »
    title: meta.title,
    description: `${meta.title} du site ${site.name}.`,
    alternates: { canonical: `${siteBaseUrl(site)}/${slug}` },
    // Pages indexables (sauf démos, jamais indexées)
    robots: site.type === "demo" ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function LegalPage({ params }: Props) {
  const { site: siteKey, legal: slug } = await params;
  if (!isLegalPageSlug(slug)) notFound();
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();

  const [prospect, home] = await Promise.all([getProspect(site.prospectId), getHomePage(site.id)]);
  const page = buildLegalPage(
    slug,
    buildLegalInput({
      site,
      siteUrl: siteBaseUrl(site),
      practitioner: prospect,
      homeSections: home?.sections,
    }),
  );
  const others = LEGAL_PAGES.filter((p) => p.slug !== slug);
  const prefix = `/${siteKey}`;

  return (
    <main className="legal-page relative overflow-hidden">
      <div aria-hidden className="wave-bg absolute inset-0" />
      <article className="relative mx-auto max-w-3xl px-4 pb-20 pt-12 lg:pb-28 lg:pt-16">
        <span className="inline-block rounded-[var(--r-pill)] bg-[var(--site-soft)] px-5 py-2 text-[0.85rem] font-medium uppercase tracking-wider text-[var(--site-primary-dark)]">
          Informations légales
        </span>
        <h1 className="mt-6 text-[2.4rem] font-semibold leading-[1.1] text-[var(--site-primary-dark)] sm:text-[3rem]">
          {page.title}
        </h1>
        <div className="mt-8 text-[1.05rem] leading-relaxed">
          <Markdown content={page.body} />
        </div>
        <nav aria-label="Autres pages légales" className="mt-14 border-t border-[var(--site-text)]/10 pt-6 text-sm">
          <span className="opacity-60">Voir aussi : </span>
          {others.map((other, i) => (
            <span key={other.slug}>
              {i > 0 ? <span className="opacity-60"> · </span> : null}
              <Link
                href={`${prefix}/${other.slug}`}
                className="font-medium text-[var(--site-primary)] underline decoration-current/40 underline-offset-2 hover:opacity-80"
              >
                {other.title}
              </Link>
            </span>
          ))}
        </nav>
      </article>
    </main>
  );
}
