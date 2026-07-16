import { listDemos } from "@/lib/demos";
import { DemosPageClient } from "./demos-page-client";

export const metadata = { title: "Démos" };
export const dynamic = "force-dynamic";
// La génération IA (job après réponse) fait ~10 appels Claude (jusqu'à ~5 min) :
// sur Vercel, la fonction doit vivre assez longtemps (plan Pro requis, cf. DEPLOY.md)
export const maxDuration = 300;

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function DemosPage({ searchParams }: Props) {
  const { q, page } = await searchParams;
  const result = await listDemos({ query: q, page: page ? Number(page) : 1 });

  const rows = result.rows.map(({ site, prospect }) => ({
    id: site.id,
    slug: site.slug,
    status: site.status,
    progress: site.generationProgress,
    generationError: site.generationError,
    prospectName: prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name,
    profession: prospect?.profession ?? "",
    city: prospect?.city ?? "",
    linkActive: !site.demoExpiresAt || site.demoExpiresAt.getTime() > Date.now(),
    demoExpiresAt: site.demoExpiresAt?.toISOString() ?? null,
    createdAt: site.createdAt.toISOString(),
  }));

  return (
    <DemosPageClient
      rows={rows}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      query={q ?? ""}
      sitesBaseUrl={(process.env.SITES_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}
    />
  );
}
