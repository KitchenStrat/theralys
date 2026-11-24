"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@theralys/db";
import { isFeedbackStatus } from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/crm/filters";
import { setFeedbackStatus } from "@/lib/feedback";
import { isMissingSchemaError } from "@/lib/pg-errors";

type Result = { ok: true } | { ok: false; error: string };

/** Marquer un avis lu, pris en compte, ou le remettre parmi les nouveaux. Réservé à l'admin. */
export async function markFeedback(id: unknown, status: unknown): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id) || !isFeedbackStatus(status)) return { ok: false, error: "Demande illisible : rechargez la page." };
  try {
    if (!(await setFeedbackStatus(getDb(), id, status))) return { ok: false, error: "Cet avis n'existe plus." };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ok: false, error: "Les avis sont en cours d'activation : ils attendent la migration 0016." };
    throw error;
  }
  revalidatePath("/avis");
  return { ok: true };
}
