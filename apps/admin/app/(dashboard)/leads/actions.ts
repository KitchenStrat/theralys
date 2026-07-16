"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, leads } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";

const LEAD_STATUSES = ["new", "demo_sent", "meeting", "won", "lost"] as const;

const createLeadSchema = z.object({
  name: z.string().trim().min(2, "Nom requis"),
  email: z.string().trim().email("Email invalide").or(z.literal("")).default(""),
  phone: z.string().trim().max(30).default(""),
  source: z.enum(["landing", "demo", "referral"]).default("landing"),
  notes: z.string().trim().max(2000).default(""),
});

export async function createLead(input: unknown): Promise<{ error?: string }> {
  await requireAdmin();
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const db = getDb();
  await db.insert(leads).values({
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    source: parsed.data.source,
    status: "new",
    notes: parsed.data.notes || null,
  });
  revalidatePath("/leads");
  return {};
}

export async function updateLeadStatus(leadId: string, status: string): Promise<void> {
  await requireAdmin();
  if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) return;
  const db = getDb();
  await db
    .update(leads)
    .set({ status: status as (typeof LEAD_STATUSES)[number] })
    .where(eq(leads.id, leadId));
  revalidatePath("/leads");
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<void> {
  await requireAdmin();
  const db = getDb();
  await db
    .update(leads)
    .set({ notes: notes.trim().slice(0, 2000) || null })
    .where(eq(leads.id, leadId));
  revalidatePath("/leads");
}
