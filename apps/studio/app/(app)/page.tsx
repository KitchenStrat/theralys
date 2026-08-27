import Link from "next/link";
import { Card } from "@theralys/ui";
import { hasBlog } from "@theralys/db";
import { formatDateFr } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import {
  getDashboardStats,
  getMonthItems,
  getOnboarding,
  getSite,
  siteUrl,
  type CalendarItem,
  type Period,
} from "@/lib/data";
import { StatsPanel } from "./stats-panel";
import { TasksCard } from "./tasks-card";

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
  const [stats, tasks, upcoming] = await Promise.all([
    getDashboardStats(site.id, period),
    getOnboarding(site.id),
    blog ? getUpcoming(site.id) : Promise.resolve([]),
  ]);

  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <div className="grid gap-7 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6">
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
          />
        </Card>

        {/* Accès à l'éditeur : uniquement ici, plus dans la navigation */}
        <Card className="p-6 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Votre site</h2>
              <p className="mt-1 max-w-md text-base text-ink-500">
                Textes, photos, horaires, tarifs : modifiez votre site en quelques clics,
                c&apos;est en ligne immédiatement.
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
      </div>

      <div className="space-y-6">
        <TasksCard tasks={tasks} />

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
          <Link href={siteUrl(site)} target="_blank" className="underline">
            {siteUrl(site)}
          </Link>
        </p>
      </div>
    </div>
  );
}
