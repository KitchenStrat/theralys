import Link from "next/link";
import { Card } from "@theralys/ui";
import { getDb, hasBlog, hasSocialMedia } from "@theralys/db";
import { loadExternalSite } from "@theralys/jobs";
import { activeExternalSite, formatDateFr } from "@theralys/shared";
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
import { StatsPanel } from "./stats-panel";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ periode?: string }> };

const UPCOMING_LABELS: Record<string, string> = {
  scheduled: "Programmé",
  planned: "Planifié",
  draft: "Brouillon",
};

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

export default async function HomePage({ searchParams }: Props) {
  const session = await requireClient();
  const { periode } = await searchParams;
  const period: Period = periode === "30j" ? "30j" : periode === "6m" ? "6m" : "7j";

  const site = await getSite(session.siteId);
  const blog = site.type === "demo" || hasBlog(site.plan);
  const socialAccess = site.type === "demo" || hasSocialMedia(site.plan);
  // Site de référence des outils : celui du praticien s'il l'a connecté et activé (« Mon site »), sinon le site Harmony
  const ownSite = activeExternalSite(site.theme);
  const referenceUrl = publicSiteUrl(site);
  const [stats, upcoming, ownSiteState] = await Promise.all([
    // Les visites lues sont celles du site de référence : jamais les deux mesures additionnées
    getDashboardStats(site.id, period, ownSite ? "external" : "hosted"),
    blog ? getUpcoming(site.id) : Promise.resolve([]),
    ownSite ? loadExternalSite(getDb(), site) : Promise.resolve(null),
  ]);
  // Le code de mesure n'a encore envoyé aucune visite du site du praticien : rien à tracer, l'accueil dit quoi faire
  const awaitingMeasure = ownSite !== null && ownSiteState?.available === true && ownSiteState.site !== null && ownSiteState.site.measure.seenAt === null;

  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr_420px]">
      {/* `min-w-0` : une colonne ne s'élargit jamais au-delà de l'écran (titre de publication tenu sur une ligne, adresse longue) */}
      <div className="min-w-0 space-y-6">
        <Card className="p-6 md:p-7">
          <StatsPanel
            firstName={firstName}
            period={period}
            stats={{
              visitors: stats.visitors,
              rdvClicks: stats.rdvClicks,
              visitorsChangePct: stats.visitorsChangePct,
              rdvClicksChangePct: stats.rdvClicksChangePct,
              daily: stats.daily,
            }}
            sources={stats.sources}
            socialAccess={socialAccess}
            awaitingMeasure={awaitingMeasure && ownSite ? { address: siteAddressLabel(ownSite.url) } : null}
          />
        </Card>

        {/* Le site de référence. Site Harmony : accès à l'éditeur (ici et dans « Mon site », pas dans la navigation) ; site du praticien : accès à « Mon site » */}
        {ownSite ? (
          <Card className="p-6 md:p-7" data-testid="site-card" data-reference="external">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">Votre site</h2>
                <p className="mt-1 wrap-anywhere text-base font-medium text-ink-900" data-testid="site-card-url">
                  {siteAddressLabel(ownSite.url)}
                </p>
                <p className="mt-1 max-w-md text-base text-ink-500">
                  Vos outils s&apos;appuient sur votre site&nbsp;: contenus, liens et statistiques.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/mon-site"
                  data-testid="site-card-manage"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-500 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  Gérer mon site
                </Link>
                <a
                  href={referenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="site-card-view"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white/60 px-6 py-3.5 text-base font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50"
                >
                  ↗ Voir mon site
                </a>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 md:p-7" data-testid="site-card" data-reference="hosted">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Votre site</h2>
                <p className="mt-1 max-w-md text-base text-ink-500">
                  Textes, photos, horaires, tarifs : modifiez votre site en quelques clics,
                  c&apos;est en ligne immédiatement.
                </p>
                <p className="mt-2 text-sm">
                  <Link href="/mon-site" data-testid="site-card-connect-link" className="font-medium text-primary-700 hover:underline">
                    Vous avez déjà un site&nbsp;?
                  </Link>
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Link
                  href="/editor"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-500 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  ✎ Éditer mon site
                </Link>
                <a
                  href={siteUrl(site)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white/60 px-6 py-3.5 text-base font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50"
                >
                  ↗ Voir
                </a>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-6">
        {blog ? (
          <Card className="p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">Prochaines publications</h2>
              <Link
                href="/publications"
                className="whitespace-nowrap text-sm font-medium text-primary-700 hover:underline"
              >
                Tout l&apos;agenda →
              </Link>
            </div>
            {upcoming.length > 0 ? (
              <ul className="mt-4 space-y-3.5">
                {upcoming.map((item) => (
                  <li key={`${item.date}-${item.title}`} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-400"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-base font-medium text-ink-900">
                        {item.title}
                      </span>
                      <span className="block text-[13px] text-ink-500">
                        {formatDateFr(new Date(item.date))} · {UPCOMING_LABELS[item.status] ?? item.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-base text-ink-500">
                Rien de planifié pour l&apos;instant — le calendrier se remplit depuis l&apos;onglet
                Publications.
              </p>
            )}
          </Card>
        ) : null}

        <p className="px-2 text-[13px] text-ink-500">
          Votre site :{" "}
          <Link href={referenceUrl} target="_blank" className="wrap-anywhere underline">
            {referenceUrl}
          </Link>
        </p>
      </div>
    </div>
  );
}
