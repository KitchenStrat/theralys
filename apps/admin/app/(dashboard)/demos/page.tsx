import { eq } from "drizzle-orm";
import { crmContacts, getDb } from "@theralys/db";
import { isMissingTableError } from "@/lib/api-usage";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/crm/filters";
import { listDemos } from "@/lib/demos";
import { DemosPageClient } from "./demos-page-client";

export const metadata = { title: "Démos" };
export const dynamic = "force-dynamic";
// La génération IA (job après réponse) fait ~10 appels Claude (jusqu'à ~5 min) :
// sur Vercel, la fonction doit vivre assez longtemps (plan Pro + Fluid compute requis, cf. DEPLOY.md)
export const maxDuration = 800;

type Props = { searchParams: Promise<{ q?: string; page?: string; prospect?: string }> };

/** Fiche du CRM depuis laquelle on vient créer une démo (« Créer sa démo »), pour préremplir la fenêtre. */
async function demoPrefill(contactId: string | undefined) {
  if (!isUuid(contactId)) return null;
  try {
    const [contact] = await getDb()
      .select({ id: crmContacts.id, firstName: crmContacts.firstName, lastName: crmContacts.lastName, profession: crmContacts.profession, city: crmContacts.city })
      .from(crmContacts)
      .where(eq(crmContacts.id, contactId))
      .limit(1);
    return contact ? { crmContactId: contact.id, firstName: contact.firstName, lastName: contact.lastName, profession: contact.profession, city: contact.city } : null;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export default async function DemosPage({ searchParams }: Props) {
  await requireAdmin();
  const { q, page, prospect } = await searchParams;
  const [result, prefill] = await Promise.all([listDemos({ query: q, page: page ? Number(page) : 1 }), demoPrefill(prospect)]);

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
      prefill={prefill}
    />
  );
}
