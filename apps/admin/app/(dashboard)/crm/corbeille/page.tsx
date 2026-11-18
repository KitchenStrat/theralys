import { redirect } from "next/navigation";
import { getDb } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { crmAvailable } from "@/lib/crm/data";
import { stageOf } from "@/lib/crm/model";
import { TRASH_LIMIT, listTrash } from "@/lib/crm/trash";
import { TrashClient } from "./trash-client";

export const metadata = { title: "Corbeille du CRM" };
export const dynamic = "force-dynamic";

/** Corbeille : tout ce qui a été supprimé du CRM, à restaurer ou à effacer pour de bon. */
export default async function TrashPage() {
  await requireAdmin();
  const db = getDb();
  if (!(await crmAvailable(db))) redirect("/crm");
  const { rows, total } = await listTrash(db);
  return (
    <TrashClient rows={rows.map(({ updatedAt, ...row }) => ({ ...row, stage: stageOf(row.stage), deletedAt: updatedAt.toISOString() }))} total={total} limit={TRASH_LIMIT} />
  );
}
