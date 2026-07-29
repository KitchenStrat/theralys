import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/consent-banner";
import { EditorBridge } from "@/components/editor-bridge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Tracker } from "@/components/tracker";
import { getMotifPages, getSiteByKey, isDemoExpired } from "@/lib/site-data";
import { themeCssVars } from "@/lib/theme";

type Props = { children: ReactNode; params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  return {
    title: { default: site.name, template: `%s — ${site.name}` },
    // Les démos ne sont jamais indexées (noindex + robots.txt)
    robots: site.type === "demo" ? { index: false, follow: false } : undefined,
  };
}

export default async function SiteLayout({ children, params }: Props) {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();

  // Abonnement annulé → site archivé, plus servi publiquement
  if (site.status === "archived") {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold">Ce site n&apos;est plus disponible</h1>
          <p className="mt-3 opacity-70">
            Le site que vous cherchez a été désactivé. Si vous en êtes le propriétaire,
            contactez Harmony pour le réactiver.
          </p>
        </div>
      </main>
    );
  }

  if (isDemoExpired(site)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-bold">Cette démonstration a expiré</h1>
          <p className="mt-3 opacity-70">
            Le lien de ce site de démonstration n&apos;est plus actif. Contactez Harmony pour le
            réactiver.
          </p>
        </div>
      </main>
    );
  }

  const motifPages = await getMotifPages(site);
  const prefix = `/${siteKey}`;

  return (
    <div
      style={themeCssVars(site.theme)}
      data-ambiance={site.theme.ambiance ?? "naturel"}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <SiteHeader site={site} motifPages={motifPages} prefix={prefix} />
      {children}
      <SiteFooter site={site} />
      <ConsentBanner />
      <Tracker siteId={site.id} />
      <EditorBridge />
      <ScrollReveal />
    </div>
  );
}
