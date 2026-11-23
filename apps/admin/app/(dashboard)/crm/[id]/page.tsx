import { notFound, redirect } from "next/navigation";
import { getDb } from "@theralys/db";
import { currentStaff, requireStaff } from "@/lib/auth";
import type { CrmViewer } from "@/lib/crm/access";
import { crmAvailable, loadContact } from "@/lib/crm/data";
import { isUuid } from "@/lib/crm/filters";
import { displayName } from "@/lib/crm/model";
import { listRepOptions } from "@/lib/crm/team";
import { ContactDetailClient } from "./contact-detail";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Prospect" };
  try {
    // Le titre de l'onglet suit la même portée que la page : la fiche d'un autre ne donne pas son nom
    const user = await currentStaff();
    const detail = user ? await loadContact(getDb(), { id: user.id, role: user.role }, id) : null;
    return { title: detail ? displayName(detail.contact) : "Prospect" };
  } catch {
    return { title: "Prospect" };
  }
}

/**
 * Fiche d'un prospect : ses coordonnées, son étape, ses tâches et tout son
 * historique. Pour un commercial, la fiche d'un autre (ou une fiche à la
 * corbeille) est introuvable.
 */
export default async function ContactPage({ params }: { params: Params }) {
  const user = await requireStaff();
  const viewer: CrmViewer = { id: user.id, role: user.role };
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  if (!(await crmAvailable(db))) redirect("/crm");
  const detail = await loadContact(db, viewer, id);
  if (!detail) notFound();
  const reps = viewer.role === "admin" ? await listRepOptions(db) : [];
  return <ContactDetailClient detail={detail} viewer={viewer} reps={reps} nowIso={new Date().toISOString()} sitesBaseUrl={(process.env.SITES_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")} />;
}
