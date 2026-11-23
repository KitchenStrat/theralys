import { desc, eq } from "drizzle-orm";
import { getDb, leads, prospects } from "@theralys/db";
import { requireStaff } from "@/lib/auth";
import type { CrmViewer } from "@/lib/crm/access";
import { crmState, listContacts, loadFacets, loadKpis, pipelineColumns, stageSummary, syncLeadsIntoCrm } from "@/lib/crm/data";
import { parseFilters } from "@/lib/crm/filters";
import { listRepOptions } from "@/lib/crm/team";
import { LeadsClient } from "../leads/leads-client";
import { CrmClient } from "./crm-client";
import { SalesActivationNotice } from "./activation-notice";

export const metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * CRM : tous les prospects (listes importées, saisie, demandes de la vitrine,
 * démos), filtrables, et leur avancement dans le cycle de vente. L'admin les
 * voit tous ; un commercial ne voit que les siens (la portée est dans chaque
 * requête, cf. `lib/crm/scope.ts`).
 */
export default async function CrmPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const viewer: CrmViewer = { id: user.id, role: user.role };
  const db = getDb();

  const admin = viewer.role === "admin";
  const state = await crmState(db);
  if (state === "needs-sales" || (state === "needs-crm" && !admin)) return <SalesActivationNotice title="Le CRM est en cours d'activation" />;
  if (state === "needs-crm") {
    // Tant que la migration n'est pas passée, les demandes reçues restent consultables comme avant
    const rows = await db.select({ lead: leads, prospect: prospects }).from(leads).leftJoin(prospects, eq(leads.prospectId, prospects.id)).orderBy(desc(leads.createdAt));
    return (
      <div>
        <div role="status" className="mb-6 rounded-2xl border border-warning-500/40 bg-warning-100 p-5 text-sm text-ink-900">
          <p className="text-base font-semibold">Le CRM attend sa mise en place dans la base</p>
          <p className="mt-1">
            Appliquez les migrations <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">0011_crm</code> et <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">0012_crm_sales</code> (commande{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">pnpm db:migrate</code>, ou les fichiers de <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px]">packages/db/drizzle/</code> dans la console Neon). En attendant, vos demandes reçues restent
            ci-dessous.
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

  // Les demandes de la vitrine et les démos entrent dans le CRM sans propriétaire : c'est l'admin qui les reçoit et les attribue
  if (admin) await syncLeadsIntoCrm(db);
  const parsed = parseFilters(await searchParams);
  // Le filtre « Commercial » n'existe que pour l'admin
  const filters = admin ? parsed : { ...parsed, owner: "" };
  const now = new Date();
  const [kpis, facets, summary, list, columns, reps] = await Promise.all([
    loadKpis(db, viewer, now),
    loadFacets(db, viewer),
    stageSummary(db, viewer, filters, now),
    filters.view === "liste" ? listContacts(db, viewer, filters, now) : Promise.resolve(null),
    filters.view === "pipeline" ? pipelineColumns(db, viewer, filters, now) : Promise.resolve(null),
    admin ? listRepOptions(db) : Promise.resolve([]),
  ]);

  return <CrmClient role={viewer.role} filters={filters} kpis={kpis} facets={facets} summary={summary} list={list} columns={columns} reps={reps} nowIso={now.toISOString()} />;
}
