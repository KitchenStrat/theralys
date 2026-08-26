"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { domains, getDb, sites, subscriptions } from "@theralys/db";
import { createBillingProvider } from "@theralys/providers/billing";
import {
  createRegistrar,
  VERCEL_DNS_RECORDS,
  type DomainAvailability,
} from "@theralys/providers/registrar";
import { createHostingProvider } from "@theralys/providers/hosting";
import { requireClient } from "@/lib/auth";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?\.[a-z.]{2,10}$/, "Nom de domaine invalide");

/** Recherche de disponibilité (registrar OVH, mock sans clés). */
export async function searchDomain(
  raw: string,
): Promise<DomainAvailability | { error: string }> {
  await requireClient();
  const parsed = domainSchema.safeParse(raw);
  if (!parsed.success) return { error: "Nom de domaine invalide (ex. mon-cabinet.fr)" };
  return createRegistrar().checkAvailability(parsed.data);
}

/**
 * Achat du domaine depuis le back office client :
 * commande registrar → DNS vers Vercel → rattachement au projet → SSL auto →
 * domaine rattaché au site (le middleware multi-tenant le sert immédiatement).
 */
export async function purchaseDomain(raw: string): Promise<{ error?: string; domain?: string }> {
  const session = await requireClient();
  const parsed = domainSchema.safeParse(raw);
  if (!parsed.success) return { error: "Nom de domaine invalide" };
  const domainName = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  if (site.domain) return { error: `Un domaine est déjà rattaché : ${site.domain}` };
  const taken = await db.query.domains.findFirst({ where: eq(domains.name, domainName) });
  if (taken) return { error: "Ce domaine est déjà géré par Harmony" };

  const registrar = createRegistrar();
  const availability = await registrar.checkAvailability(domainName);
  if (!availability.available) return { error: "Ce domaine n'est plus disponible" };

  const [row] = await db
    .insert(domains)
    .values({ siteId: site.id, name: domainName, registrar: registrar.mode, status: "pending" })
    .returning();

  try {
    const order = await registrar.orderDomain(domainName, "contact@kitchenstrategy.fr");
    await db
      .update(domains)
      .set({ status: "registered", expiresAt: order.expiresAt })
      .where(eq(domains.id, row!.id));

    await registrar.configureDns(domainName, VERCEL_DNS_RECORDS);
    await createHostingProvider().attachDomain(domainName);

    await db.update(domains).set({ status: "configured" }).where(eq(domains.id, row!.id));
    await db
      .update(sites)
      .set({ domain: domainName, updatedAt: new Date() })
      .where(eq(sites.id, site.id));
  } catch (err) {
    await db.update(domains).set({ status: "error" }).where(eq(domains.id, row!.id));
    return { error: err instanceof Error ? err.message.slice(0, 200) : "Échec de la commande" };
  }

  revalidatePath("/compte");
  return { domain: domainName };
}

/**
 * Le client possède déjà un nom de domaine (OVH, Ionos, Gandi…) : il le
 * confie à Harmony et l'équipe s'occupe du rattachement (transfert ou DNS,
 * puis certificat). La demande est enregistrée en `pending` avec le
 * registrar « externe » et remonte dans le back office agence (page Clients).
 */
export async function requestExternalDomain(
  raw: string,
): Promise<{ error?: string; domain?: string }> {
  const session = await requireClient();
  const parsed = domainSchema.safeParse(raw);
  if (!parsed.success) return { error: "Nom de domaine invalide (ex. mon-cabinet.fr)" };
  const domainName = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  if (site.domain) return { error: `Un domaine est déjà rattaché : ${site.domain}` };

  const existing = await db.query.domains.findFirst({ where: eq(domains.name, domainName) });
  if (existing) {
    return existing.siteId === site.id
      ? { error: "Votre demande pour ce domaine est déjà enregistrée" }
      : { error: "Ce domaine est déjà géré par Harmony" };
  }

  await db
    .insert(domains)
    .values({ siteId: site.id, name: domainName, registrar: "externe", status: "pending" });

  revalidatePath("/compte");
  return { domain: domainName };
}

/** Portail de facturation Stripe (null en mode mock). */
export async function openBillingPortal(): Promise<{ url: string | null }> {
  const session = await requireClient();
  const db = getDb();
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.siteId, session.siteId),
  });
  if (!subscription?.stripeCustomerId) return { url: null };
  const url = await createBillingProvider().createPortalUrl(
    subscription.stripeCustomerId,
    "http://localhost:3002/compte",
  );
  return { url };
}
