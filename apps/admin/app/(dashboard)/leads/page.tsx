import { desc, eq } from "drizzle-orm";
import { getDb, leads, prospects } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { LeadsClient } from "./leads-client";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

/** Pipeline commercial : prospects issus des démos, de la landing et du parrainage. */
export default async function LeadsPage() {
  await requireAdmin();
  const db = getDb();

  const rows = await db
    .select({ lead: leads, prospect: prospects })
    .from(leads)
    .leftJoin(prospects, eq(leads.prospectId, prospects.id))
    .orderBy(desc(leads.createdAt));

  return (
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
  );
}
