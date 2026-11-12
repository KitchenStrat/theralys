import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hasBlog, hasGoogleAds, hasGoogleProfile, hasMetaAds, hasSocialMedia } from "@theralys/db";
import { AppShell, allowedSections } from "@/components/ds";
import { destroySession, requireClient } from "@/lib/auth";
import { getSite, publicSiteUrl } from "@/lib/data";

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

/**
 * Mise en page du studio : la coquille du design system (barre latérale à
 * partir de 1 024 px, barre du haut et barre basse en dessous). Les sections
 * affichées suivent la formule ; une démonstration les montre toutes. « Mon
 * site » est toujours présent.
 */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const demo = site.type === "demo";

  return (
    <AppShell
      sections={allowedSections({
        publications: demo || hasBlog(site.plan),
        social: demo || hasSocialMedia(site.plan),
        google: demo || hasGoogleProfile(site.plan),
        googleAds: demo || hasGoogleAds(site.plan),
        metaAds: demo || hasMetaAds(site.plan),
      })}
      // Le site de référence : celui du praticien s'il l'a connecté et activé (« Mon site »), sinon le site Harmony
      siteHref={publicSiteUrl(site)}
      logoutAction={logoutAction}
      userName={session.name}
      supportName={session.impersonated ? session.name : undefined}
    >
      {children}
    </AppShell>
  );
}
