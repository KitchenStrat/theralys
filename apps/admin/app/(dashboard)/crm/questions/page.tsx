import { getDb } from "@theralys/db";
import { requireStaff } from "@/lib/auth";
import type { CrmViewer } from "@/lib/crm/access";
import { parseKnowledgeFilters } from "@/lib/crm/knowledge/model";
import { KNOWLEDGE_PAGE_LIMIT, askActivity, knowledgeCounts, knowledgeState, listKnowledge } from "@/lib/crm/knowledge/store";
import { KnowledgeClient } from "./knowledge-client";

export const metadata = { title: "Questions et objections" };
export const dynamic = "force-dynamic";
// Une réponse de l'assistant prend de quelques secondes à plus d'une minute : l'action de cette page doit pouvoir l'attendre
export const maxDuration = 120;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const CODE = "rounded bg-white px-1.5 py-0.5 font-mono text-[13px]";
const DAY = 86_400_000;

/**
 * La base de connaissances de l'équipe commerciale : questions et objections
 * entendues au téléphone, avec leur réponse. Commune à l'admin et à tous les
 * commerciaux ; seul l'admin corrige, valide et supprime.
 */
export default async function KnowledgePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireStaff();
  const viewer: CrmViewer = { id: user.id, role: user.role };
  const admin = viewer.role === "admin";
  const db = getDb();

  if ((await knowledgeState(db)) === "missing") {
    return (
      <div role="status" className="rounded-2xl border border-warning-500/40 bg-warning-100 p-5 text-sm text-ink-900">
        <p className="text-base font-semibold">La base de questions est en cours d&apos;activation</p>
        <p className="mt-1">
          {admin ? (
            <>
              Cette page attend une mise à jour de la base : appliquez la migration <code className={CODE}>0014_crm_knowledge</code> (commande <code className={CODE}>pnpm db:migrate</code>, ou le fichier <code className={CODE}>packages/db/drizzle/0014_crm_knowledge.sql</code> dans la console
              Neon). Le CRM et le reste de l&apos;admin fonctionnent normalement.
            </>
          ) : (
            "Elle sera disponible très bientôt. Le reste du CRM fonctionne normalement."
          )}
        </p>
      </div>
    );
  }

  const filters = parseKnowledgeFilters(await searchParams);
  const now = new Date();
  const [entries, counts, activity] = await Promise.all([listKnowledge(db, viewer, filters), knowledgeCounts(db), admin ? askActivity(db, new Date(now.getTime() - 30 * DAY)) : Promise.resolve(null)]);

  return <KnowledgeClient admin={admin} filters={filters} entries={entries} counts={counts} truncated={entries.length >= KNOWLEDGE_PAGE_LIMIT} activity={activity} nowIso={now.toISOString()} />;
}
