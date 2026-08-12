import Link from "next/link";
import { Card } from "@theralys/ui";
import { hasSearchConsole } from "@theralys/db";
import { requireClient } from "@/lib/auth";
import {
  getDashboardStats,
  getGoogleConnection,
  getGoogleVisibility,
  getOnboarding,
  getSite,
  siteUrl,
  type Period,
} from "@/lib/data";
import { StatsPanel } from "./stats-panel";
import { TasksCard } from "./tasks-card";
import { GoogleVisibilityCard } from "./google-visibility-card";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ periode?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const session = await requireClient();
  const { periode } = await searchParams;
  const period: Period = periode === "30j" ? "30j" : periode === "6m" ? "6m" : "7j";

  const site = await getSite(session.siteId);
  const [stats, tasks, connection] = await Promise.all([
    getDashboardStats(site.id, period),
    getOnboarding(site.id),
    getGoogleConnection(site.id),
  ]);
  const gscAccess = hasSearchConsole(site.plan);
  const visibility = gscAccess && connection ? await getGoogleVisibility(site.id) : null;

  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card className="p-6">
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

        <GoogleVisibilityCard
          gscAccess={gscAccess}
          connected={Boolean(connection)}
          visibility={visibility}
        />
      </div>

      <div className="space-y-6">
        <TasksCard tasks={tasks} />

        <p className="px-2 text-xs text-ink-500">
          Votre site :{" "}
          <Link href={siteUrl(site)} target="_blank" className="underline">
            {siteUrl(site)}
          </Link>
        </p>
      </div>
    </div>
  );
}
