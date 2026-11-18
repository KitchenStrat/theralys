import { notFound, redirect } from "next/navigation";
import { getDb } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { crmAvailable, loadContact } from "@/lib/crm/data";
import { isUuid } from "@/lib/crm/filters";
import { displayName } from "@/lib/crm/model";
import { ContactDetailClient } from "./contact-detail";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Prospect" };
  try {
    const detail = await loadContact(getDb(), id);
    return { title: detail ? displayName(detail.contact) : "Prospect" };
  } catch {
    return { title: "Prospect" };
  }
}

/** Fiche d'un prospect : ses coordonnées, son étape, ses tâches et tout son historique. */
export default async function ContactPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  if (!(await crmAvailable(db))) redirect("/crm");
  const detail = await loadContact(db, id);
  if (!detail) notFound();
  return <ContactDetailClient detail={detail} nowIso={new Date().toISOString()} sitesBaseUrl={(process.env.SITES_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")} />;
}
