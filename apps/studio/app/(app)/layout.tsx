import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hasBlog, hasGoogleAds, hasGoogleProfile, hasMetaAds, hasSite, hasSocialMedia } from "@theralys/db";
import { activeExternalSite } from "@theralys/shared";
import { AppShell, allowedSections } from "@/components/ds";
import { TourProvider } from "@/components/visite";
import { destroySession, requireClient } from "@/lib/auth";
import { getSite, publicSiteUrl } from "@/lib/data";
import { readSeenTours } from "@/lib/visite/data";

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
 *
 * La coquille est enveloppée par le chef d'orchestre des visites guidées : il
 * reçoit les visites déjà vues par ce site, et ne propose rien de lui-même à
 * l'équipe en mode support.
 */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireClient();
  const [site, seenTours] = await Promise.all([getSite(session.siteId), readSeenTours(session.siteId)]);
  const demo = site.type === "demo";

  return (
    <TourProvider siteKey={site.id} seen={seenTours} support={session.impersonated} firstName={session.name.split(" ")[0] || undefined}>
    <AppShell
      sections={allowedSections({
        publications: demo || hasBlog(site.plan),
        social: demo || hasSocialMedia(site.plan),
        google: demo || hasGoogleProfile(site.plan),
        googleAds: demo || hasGoogleAds(site.plan),
        metaAds: demo || hasMetaAds(site.plan),
      })}
      // Le site de référence : celui du praticien s'il l'a connecté et activé (« Mon site »), sinon le site Harmony.
      // Formule Scale seule, site pas encore connecté : aucun site à voir.
      siteHref={demo || hasSite(site.plan) || activeExternalSite(site.theme) !== null ? publicSiteUrl(site) : null}
      logoutAction={logoutAction}
      userName={session.name}
      supportName={session.impersonated ? session.name : undefined}
    >
      {children}
    </AppShell>
    </TourProvider>
  );
}
