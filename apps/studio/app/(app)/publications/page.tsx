import { hasBlog } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getBlogSettings, getMonthItems, getSite } from "@/lib/data";
import { PublicationsClient } from "./publications-client";

export const metadata = { title: "Publications" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ mois?: string }> };

export default async function PublicationsPage({ searchParams }: Props) {
  const session = await requireClient();
  const site = await getSite(session.siteId);

  if (!hasBlog(site.plan)) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Publications</h1>
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">Le blog automatisé n&apos;est pas inclus dans votre formule</p>
          <p className="mt-1 text-sm">
            Passez à la formule <strong>Boost</strong> (2 articles/semaine) ou{" "}
            <strong>Scale</strong> (4 articles/semaine) pour activer votre blog SEO.
          </p>
        </Card>
      </div>
    );
  }

  const { mois } = await searchParams;
  const now = new Date();
  const [yearStr, monthStr] = (mois ?? "").split("-");
  const year = Number(yearStr) || now.getUTCFullYear();
  const month = Number(monthStr) || now.getUTCMonth() + 1;

  const [items, settings] = await Promise.all([
    getMonthItems(site.id, year, month),
    getBlogSettings(site.id),
  ]);

  return (
    <PublicationsClient
      year={year}
      month={month}
      items={items}
      settings={
        settings
          ? {
              publicationMode: settings.publicationMode,
              voiceDesignation: settings.voiceDesignation,
              voiceAccord: settings.voiceAccord,
              voiceReader: settings.voiceReader,
              voiceTone: settings.voiceTone,
            }
          : null
      }
    />
  );
}
