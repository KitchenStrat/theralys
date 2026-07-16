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

        <Card className="p-5">
          <h2 className="font-semibold">Solutions Complémentaires</h2>
          <div className="mt-4 space-y-3">
            <PartnerLink
              href="https://www.consulteo.fr"
              letter="C"
              color="bg-info-500"
              name="Consulteo"
              description="Facilitez la prise de rendez-vous"
            />
            <PartnerLink
              href="https://www.boosttoncab.fr"
              letter="β"
              color="bg-ink-900"
              name="BoostTonCab"
              description="Développez votre cabinet plus rapidement"
            />
          </div>

          <h2 className="mt-6 font-semibold">Faites découvrir Harmony</h2>
          <a
            href="mailto:contact@kitchenstrategy.fr?subject=Parrainage%20Harmony"
            className="mt-3 block rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-4 transition-colors hover:border-primary-400"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <span aria-hidden>👤+</span> Gagnez jusqu&apos;à 400 € par parrainage
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Offrez une période d&apos;essai à un thérapeute que vous connaissez.
            </p>
          </a>
        </Card>

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

function PartnerLink({
  href,
  letter,
  color,
  name,
  description,
}: {
  href: string;
  letter: string;
  color: string;
  name: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl bg-cream-100 p-3 transition-colors hover:bg-cream-200"
    >
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white ${color}`}
      >
        {letter}
      </span>
      <span>
        <span className="block text-sm font-semibold">{name}</span>
        <span className="block text-xs text-ink-500">{description}</span>
      </span>
      <span aria-hidden className="ml-auto text-ink-300">
        ↗
      </span>
    </a>
  );
}
