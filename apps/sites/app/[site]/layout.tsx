import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConsentBanner } from "@/components/consent-banner";
import { EditorBridge } from "@/components/editor-bridge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Tracker } from "@/components/tracker";
import { TrackingScripts } from "@/components/tracking-scripts";
import { navAnchors } from "@/lib/nav";
import { findSection } from "@/lib/page-sections";
import { getHomePage, getMotifPages, getProspect, getSiteByKey, isDemoExpired } from "@/lib/site-data";
import { themeCssVars } from "@/lib/theme";

type Props = { children: ReactNode; params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  // Icône du navigateur : choisie dans le studio, sinon logo Harmony
  const faviconUrl =
    site.theme.faviconUrl && /^(https?:\/\/|\/)/.test(site.theme.faviconUrl)
      ? site.theme.faviconUrl
      : "/favicons/harmony.svg";
  return {
    title: { default: site.name, template: `%s — ${site.name}` },
    icons: { icon: [{ url: faviconUrl }] },
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

  // Aperçu depuis l'éditeur du studio (jeton signé vérifié par le middleware) :
  // la démo reste affichée même expirée — le public, lui, voit le message.
  const editorPreview = (await headers()).get("x-hy-preview") === site.id;
  if (isDemoExpired(site) && !editorPreview) {
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

  // Accueil, fiche Google et pages de spécialité chargés une fois pour
  // l'en-tête (ancres des sections visibles, téléphone) et le pied de page
  const [motifPages, home, prospect] = await Promise.all([
    getMotifPages(site),
    getHomePage(site.id),
    getProspect(site.prospectId),
  ]);
  const prefix = `/${siteKey}`;
  const anchors = navAnchors(home?.sections);
  const contact = findSection(home?.sections, "contact");
  const phone = contact?.phone?.trim() || null;

  return (
    <div
      // La police du corps s'applique ici (et pas seulement sur <body>) : les
      // variables du thème sont définies sur ce conteneur, pas sur la racine.
      style={{ ...themeCssVars(site.theme), fontFamily: "var(--site-font-body)" }}
      data-ambiance={site.theme.ambiance ?? "naturel"}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      <SiteHeader site={site} motifPages={motifPages} prefix={prefix} anchors={anchors} phone={phone} />
      {children}
      <SiteFooter
        site={site}
        prefix={prefix}
        motifPages={motifPages}
        google={
          prospect
            ? {
                name: prospect.googleBusinessName,
                address: prospect.googleAddress,
                placeId: prospect.googlePlaceId,
              }
            : null
        }
        phone={phone}
      />
      {/* Bandeau retirable depuis le studio (Paramètres → Tracking) */}
      {site.theme.tracking?.cookieBanner === false ? null : <ConsentBanner />}
      <Tracker siteId={site.id} />
      <TrackingScripts tracking={site.theme.tracking ?? {}} />
      {/* Pont avec l'éditeur : seulement dans l'aperçu authentifié (jeton signé) */}
      {editorPreview ? <EditorBridge /> : null}
      <ScrollReveal />
    </div>
  );
}
