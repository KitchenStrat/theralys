import { hasBlog, PLANS } from "@theralys/db";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getBlogSettings, getEditablePages, getMonthItems, getSite } from "@/lib/data";
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
        <h1 className="text-3xl font-bold">Publications</h1>
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">Le blog automatisé n&apos;est pas inclus dans votre formule</p>
          <p className="mt-1 text-sm">
            Passez à la formule <strong>Boost</strong> (4 articles/semaine, 6 pages de
            spécialités et suivi des mots-clés) pour activer votre blog SEO.
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

  const [items, settings, editablePages] = await Promise.all([
    getMonthItems(site.id, year, month),
    getBlogSettings(site.id),
    getEditablePages(site.id),
  ]);
  // Thématiques par défaut du wizard : les motifs de consultation du site
  const motifTitles = editablePages.filter((p) => p.type === "motif").map((p) => p.title);
  const monthlyQuota = PLANS[site.plan].blogArticlesPerWeek * 4;

  return (
    <PublicationsClient
      year={year}
      month={month}
      items={items}
      monthlyQuota={monthlyQuota}
      defaultThemeLabels={motifTitles}
      settings={
        settings
          ? {
              publicationMode: settings.publicationMode,
              voiceDesignation: settings.voiceDesignation,
              voiceAccord: settings.voiceAccord,
              voiceReader: settings.voiceReader,
              voiceTone: settings.voiceTone,
              themes: settings.themes ?? undefined,
            }
          : null
      }
    />
  );
}
