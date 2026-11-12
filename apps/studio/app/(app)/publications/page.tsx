import { and, eq } from "drizzle-orm";
import { blogArticles, editorialCalendarEntries, getDb, hasBlog, PLANS } from "@theralys/db";
import { loadExternalReference } from "@theralys/jobs";
import { activeExternalSite, externalSpecialties, isHostedSiteHidden } from "@theralys/shared";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { parseMonthParam } from "@/lib/calendar";
import { getBlogSettings, getEditablePages, getMonthItems, getSite } from "@/lib/data";
import { withReferenceSpecialties, type MotifSlugs } from "@/lib/social/blog-specialties";
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
        <h1 className="text-4xl font-bold">Publications</h1>
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">Le blog automatisé n&apos;est pas inclus dans votre formule</p>
          <p className="mt-1 text-sm">
            Passez à la formule <strong>Scale</strong> (208 articles/an, 6 pages de
            spécialités dédiées, suivi et recherche de mots-clés, Académie, contenus réseaux
            sociaux) pour activer votre blog SEO.
          </p>
        </Card>
      </div>
    );
  }

  const { mois } = await searchParams;
  // Année 2000..2100 et mois 1..12, sinon mois courant (helper partagé avec Réseaux sociaux)
  const { year, month } = parseMonthParam(mois, new Date());

  const [items, settings, editablePages, reference] = await Promise.all([
    getMonthItems(site.id, year, month),
    getBlogSettings(site.id),
    getEditablePages(site.id),
    // Site du client en référence : son profil ; sinon `null`, sans aucune lecture
    loadExternalReference(getDb(), site),
  ]);
  // Spécialités dont le blog tire ses sujets : celles du site du client quand il est la référence
  // (même règle que la planification, `editorialMotifs` côté jobs), sinon les pages de spécialité du site hébergé
  const specialties = reference ? externalSpecialties(reference.profile) : null;
  // Thématiques par défaut du wizard : les spécialités (motifs de consultation) du site de référence
  const defaultThemeLabels = specialties
    ? specialties.map((specialty) => specialty.title)
    : editablePages.filter((p) => p.type === "motif").map((p) => p.title);
  // Libellés de spécialité du calendrier : `getMonthItems` les lit sur le site hébergé
  const calendarItems = specialties ? withReferenceSpecialties(items, await loadMotifSlugs(site.id), specialties) : items;
  const monthlyQuota = PLANS[site.plan].blogArticlesPerWeek * 4;
  // Les articles paraissent sur le blog hébergé ; dès que le site du client est la référence, le praticien les reprend chez lui
  const ownSite = activeExternalSite(site.theme);

  return (
    <PublicationsClient
      year={year}
      month={month}
      items={calendarItems}
      monthlyQuota={monthlyQuota}
      defaultThemeLabels={defaultThemeLabels}
      ownSite={ownSite ? { address: ownSite.url.replace(/^https?:\/\//, ""), hostedHidden: isHostedSiteHidden(site.theme) } : null}
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

/**
 * Spécialité (identifiant) de chaque article et de chaque sujet planifié du
 * site. `getMonthItems` ne rend que le titre de la spécialité, lu sur les
 * pages du site hébergé : pour le remplacer par celui du site du client, il
 * faut l'identifiant. Lu seulement quand le site du client est la référence.
 */
async function loadMotifSlugs(siteId: string): Promise<MotifSlugs> {
  const db = getDb();
  const [articles, entries] = await Promise.all([
    db.query.blogArticles.findMany({ where: eq(blogArticles.siteId, siteId), columns: { id: true, motifSlug: true } }),
    db.query.editorialCalendarEntries.findMany({
      where: and(eq(editorialCalendarEntries.siteId, siteId), eq(editorialCalendarEntries.status, "planned")),
      columns: { id: true, motifSlug: true },
    }),
  ]);
  return {
    articles: new Map(articles.map((article) => [article.id, article.motifSlug])),
    entries: new Map(entries.map((entry) => [entry.id, entry.motifSlug])),
  };
}
