import { desc } from "drizzle-orm";
import { crmContacts, getDb } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { buildWhere } from "@/lib/crm/data";
import { exportCsv } from "@/lib/crm/export";
import { parseFilters } from "@/lib/crm/filters";

export const dynamic = "force-dynamic";

/** Export CSV des prospects qui répondent aux filtres de l'adresse (tous, sans pagination). */
export async function GET(request: Request) {
  await requireAdmin();
  const filters = parseFilters(new URL(request.url).searchParams);
  const now = new Date();
  const rows = await getDb()
    .select({
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      company: crmContacts.company,
      profession: crmContacts.profession,
      email: crmContacts.email,
      phone: crmContacts.phone,
      address: crmContacts.address,
      postalCode: crmContacts.postalCode,
      city: crmContacts.city,
      website: crmContacts.website,
      stage: crmContacts.stage,
      source: crmContacts.source,
      tags: crmContacts.tags,
      plan: crmContacts.plan,
      billingPeriod: crmContacts.billingPeriod,
      nextAction: crmContacts.nextAction,
      nextActionAt: crmContacts.nextActionAt,
      lastContactAt: crmContacts.lastContactAt,
      doNotContact: crmContacts.doNotContact,
      notes: crmContacts.notes,
      createdAt: crmContacts.createdAt,
    })
    .from(crmContacts)
    .where(buildWhere(filters, now))
    .orderBy(desc(crmContacts.createdAt))
    .limit(50_000);
  const stamp = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(now);
  return new Response(exportCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="prospects-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
