import { getDb, hasBlog, hasGoogleAds, hasGoogleProfile, hasMetaAds, hasSocialMedia } from "@theralys/db";
import { loadExternalSite } from "@theralys/jobs";
import { activeExternalSite } from "@theralys/shared";
import { allowedSections } from "@/components/ds";
import { availableSetupTasks, getSetupTasks, pickNextStep } from "@/lib/accueil";
import { requireClient } from "@/lib/auth";
import {
  getDashboardStats,
  getMonthItems,
  getSite,
  publicSiteUrl,
  siteUrl,
  type CalendarItem,
  type Period,
} from "@/lib/data";
import { siteAddressLabel } from "@/lib/external-site/format";
import { HomeView } from "./_accueil/home-view";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ periode?: string }> };

/** Les 3 prochains contenus du calendrier éditorial (mois courant + suivant). */
async function getUpcoming(siteId: string): Promise<CalendarItem[]> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const [current, next] = await Promise.all([
    getMonthItems(siteId, year, month),
    getMonthItems(siteId, nextYear, nextMonth),
  ]);
  const today = now.toISOString().slice(0, 10);
  return [...current, ...next]
    .filter((item) => item.date >= today && item.status !== "published" && item.status !== "withdrawn")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
}

/** Accueil du studio : lit l'état du compte, puis le confie à `HomeView` (`_accueil/home-view.tsx`), qui l'affiche. */
export default async function HomePage({ searchParams }: Props) {
  const session = await requireClient();
  const { periode } = await searchParams;
  const period: Period = periode === "30j" ? "30j" : periode === "6m" ? "6m" : "7j";

  const site = await getSite(session.siteId);
  // Mêmes règles d'accès que la navigation (`layout.tsx`) : les sections suivent la formule, une démonstration les ouvre toutes
  const demo = site.type === "demo";
  const blog = demo || hasBlog(site.plan);
  const socialAccess = demo || hasSocialMedia(site.plan);
  const googleAccess = demo || hasGoogleProfile(site.plan);
  const sections = allowedSections({
    publications: blog,
    social: socialAccess,
    google: googleAccess,
    googleAds: demo || hasGoogleAds(site.plan),
    metaAds: demo || hasMetaAds(site.plan),
  });
  // Site de référence des outils : celui du praticien s'il l'a connecté et activé (« Mon site »), sinon le site Harmony
  const ownSite = activeExternalSite(site.theme);
  const referenceUrl = publicSiteUrl(site);
  const [stats, upcoming, ownSiteState, setupTasks] = await Promise.all([
    // Les visites lues sont celles du site de référence : jamais les deux mesures additionnées
    getDashboardStats(site.id, period, ownSite ? "external" : "hosted"),
    blog ? getUpcoming(site.id) : Promise.resolve([]),
    ownSite ? loadExternalSite(getDb(), site) : Promise.resolve(null),
    getSetupTasks(site.id),
  ]);
  // Le code de mesure n'a encore envoyé aucune visite du site du praticien : rien à tracer, l'accueil dit quoi faire
  const awaitingMeasure = ownSite !== null && ownSiteState?.available === true && ownSiteState.site !== null && ownSiteState.site.measure.seenAt === null;
  const measure = awaitingMeasure && ownSite ? { address: siteAddressLabel(ownSite.url) } : null;

  // Mise en route : seulement les étapes que ce compte peut mener à bien (l'éditeur n'est proposé que pour le site Harmony)
  const setup = availableSetupTasks(setupTasks, { google: googleAccess, blog, editor: ownSite === null });

  return (
    <HomeView
      firstName={session.name.split(" ")[0] ?? session.name}
      period={period}
      stats={stats}
      // Le site de référence. Site Harmony : accès à l'éditeur (ici et dans « Mon site », pas dans la navigation) ; site du praticien : accès à « Mon site »
      site={
        ownSite
          ? { reference: "external", address: siteAddressLabel(ownSite.url), viewHref: referenceUrl }
          : { reference: "hosted", address: siteAddressLabel(siteUrl(site)), viewHref: siteUrl(site) }
      }
      awaitingMeasure={measure}
      socialAccess={socialAccess}
      upcoming={blog ? upcoming : null}
      setup={setup}
      nextStep={pickNextStep({ awaitingMeasure: measure, setup, upcoming })}
      sections={sections.filter((key) => key !== "accueil")}
    />
  );
}
