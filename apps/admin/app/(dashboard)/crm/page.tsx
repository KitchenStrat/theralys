import { desc, eq } from "drizzle-orm";
import { getDb, leads, prospects } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { crmAvailable, listContacts, loadFacets, loadKpis, pipelineColumns, stageSummary, syncLeadsIntoCrm } from "@/lib/crm/data";
import { parseFilters } from "@/lib/crm/filters";
import { LeadsClient } from "../leads/leads-client";
import { CrmClient } from "./crm-client";

export const metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * CRM : tous les prospects (listes importées, saisie, demandes de la vitrine,
 * démos), filtrables, et leur avancement dans le cycle de vente.
 */
export default async function CrmPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const db = getDb();

  if (!(await crmAvailable(db))) {
    // Tant que la migration n'est pas passée, les demandes reçues restent consultables comme avant
    const rows = await db.select({ lead: leads, prospect: prospects }).from(leads).leftJoin(prospects, eq(leads.prospectId, prospects.id)).orderBy(desc(leads.createdAt));
    return (
      <div>
        <div role="status" className="mb-6 rounded-2xl border border-warning-500/40 bg-warning-100 p-5 text-sm text-ink-900">
          <p className="text-base font-semibold">Le CRM attend sa mise en place dans la base</p>
          <p className="mt-1">
            Appliquez la migration <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">0011_crm</code> (commande <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">pnpm db:migrate</code>, ou le fichier{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">packages/db/drizzle/0011_crm.sql</code> dans la console Neon). Elle ne crée que trois tables neuves. En attendant, vos demandes reçues restent ci-dessous.
          </p>
        </div>
        <LeadsClient
          rows={rows.map(({ lead, prospect }) => ({
            id: lead.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            status: lead.status,
            notes: lead.notes,
            createdAt: lead.createdAt.toISOString(),
            context: prospect ? `${prospect.profession} · ${prospect.city}` : null,
          }))}
        />
      </div>
    );
  }

  await syncLeadsIntoCrm(db);
  const filters = parseFilters(await searchParams);
  const now = new Date();
  const [kpis, facets, summary, list, columns] = await Promise.all([
    loadKpis(db, now),
    loadFacets(db),
    stageSummary(db, filters, now),
    filters.view === "liste" ? listContacts(db, filters, now) : Promise.resolve(null),
    filters.view === "pipeline" ? pipelineColumns(db, filters, now) : Promise.resolve(null),
  ]);

  return <CrmClient filters={filters} kpis={kpis} facets={facets} summary={summary} list={list} columns={columns} nowIso={now.toISOString()} />;
}
