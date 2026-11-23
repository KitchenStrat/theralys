"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { domains, getDb, hasSite, hitRateLimit, sites, subscriptions, type RateLimitRule } from "@theralys/db";
import { DEFAULT_STUDIO_BASE_URL } from "@theralys/jobs";
import { createBillingProvider } from "@theralys/providers/billing";
import {
  createRegistrar,
  VERCEL_DNS_RECORDS,
  type DomainAvailability,
} from "@theralys/providers/registrar";
import { createHostingProvider } from "@theralys/providers/hosting";
import { requireClient } from "@/lib/auth";
import { attributeApiUsage } from "@theralys/shared/usage-runtime";
import { studioOrigin } from "./studio-origin";

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?\.[a-z.]{2,10}$/, "Nom de domaine invalide");

/** Extensions commandées en un clic : les courantes, au tarif du forfait. Toute autre passe par l'équipe. */
const ORDERABLE_TLDS = new Set(["fr", "com", "net", "eu", "org"]);
/** Prix annuel au-delà duquel un nom n'est plus « au forfait » (nom premium) : pas de commande automatique. */
const MAX_PRICE_PER_YEAR_EUR = 30;
/** Recherches de disponibilité par site : chaque recherche appelle le bureau d'enregistrement. */
const DOMAIN_SEARCH_LIMIT: RateLimitRule = { scope: "domain:search", limit: 40, windowSeconds: 60 * 60 };

const NOT_ORDERABLE = "Ce nom de domaine n'est pas commandable en ligne. Contactez Harmony : nous nous en occupons avec vous.";
const REQUEST_PENDING = "Une demande de nom de domaine est déjà en cours pour votre site. Contactez Harmony pour la modifier.";

function tldOf(domainName: string): string {
  return domainName.slice(domainName.indexOf(".") + 1);
}

/** Verrou par site, tenu jusqu'à la fin de la transaction : deux commandes simultanées passent l'une après l'autre. */
async function lockSiteDomain(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], siteId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:domain`}))`);
}

/** Recherche de disponibilité (registrar OVH, mock sans clés). */
export async function searchDomain(
  raw: string,
): Promise<DomainAvailability | { error: string }> {
  const session = await requireClient();
  const parsed = domainSchema.safeParse(raw);
  if (!parsed.success) return { error: "Nom de domaine invalide (ex. mon-cabinet.fr)" };
  const decision = await hitRateLimit(getDb(), DOMAIN_SEARCH_LIMIT, session.siteId);
  if (!decision.allowed) return { error: "Trop de recherches à la suite. Réessayez dans quelques minutes." };
  return attributeApiUsage(createRegistrar(), { feature: "domains", siteId: session.siteId }).checkAvailability(parsed.data);
}

/**
 * Achat du domaine depuis le back office client :
 * commande registrar → DNS vers Vercel → rattachement au projet → SSL auto →
 * domaine rattaché au site (le middleware multi-tenant le sert immédiatement).
 *
 * La commande est payée par Harmony : elle n'est ouverte qu'à un site client
 * en formule Site dont l'abonnement est actif, pour une extension courante au
 * tarif du forfait, et une seule fois par site. La ligne `pending` est posée
 * sous verrou avant la commande : deux appels simultanés (ou un nouvel essai
 * après un échec) ne peuvent pas commander deux noms.
 */
export async function purchaseDomain(raw: string): Promise<{ error?: string; domain?: string }> {
  const session = await requireClient();
  const parsed = domainSchema.safeParse(raw);
  if (!parsed.success) return { error: "Nom de domaine invalide" };
  const domainName = parsed.data;
  if (!ORDERABLE_TLDS.has(tldOf(domainName))) return { error: NOT_ORDERABLE };

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  if (site.type !== "client" || !hasSite(site.plan)) {
    return { error: "Le nom de domaine fait partie de la formule Site." };
  }
  const subscription = await db.query.subscriptions.findFirst({ where: eq(subscriptions.siteId, site.id) });
  if (subscription?.status !== "active") {
    return { error: "La commande d'un nom de domaine s'ouvre dès que votre abonnement est actif. Contactez Harmony si vous pensez que c'est une erreur." };
  }
  if (site.domain) return { error: `Un domaine est déjà rattaché : ${site.domain}` };

  // Registre des appels API : vérification, commande et rattachement du domaine de ce site
  const registrar = attributeApiUsage(createRegistrar(), { feature: "domains", siteId: site.id });
  const availability = await registrar.checkAvailability(domainName);
  if (!availability.available) return { error: "Ce domaine n'est plus disponible" };
  if (availability.pricePerYear === null || availability.pricePerYear > MAX_PRICE_PER_YEAR_EUR) return { error: NOT_ORDERABLE };

  // Réservation sous verrou : un seul nom par site, quel que soit l'état de la ligne existante
  const reserved = await db.transaction(async (tx) => {
    await lockSiteDomain(tx, site.id);
    const fresh = await tx.query.sites.findFirst({ where: eq(sites.id, site.id), columns: { domain: true } });
    if (fresh?.domain) return { error: `Un domaine est déjà rattaché : ${fresh.domain}` };
    const own = await tx.query.domains.findFirst({ where: eq(domains.siteId, site.id) });
    if (own) return { error: REQUEST_PENDING };
    const taken = await tx.query.domains.findFirst({ where: eq(domains.name, domainName) });
    if (taken) return { error: "Ce domaine est déjà géré par Harmony" };
    const [row] = await tx
      .insert(domains)
      .values({ siteId: site.id, name: domainName, registrar: registrar.mode, status: "pending" })
      .returning({ id: domains.id });
    return { id: row!.id };
  });
  if ("error" in reserved) return { error: reserved.error };

  try {
    const order = await registrar.orderDomain(domainName, "contact@kitchenstrategy.fr");
    await db
      .update(domains)
      .set({ status: "registered", expiresAt: order.expiresAt })
      .where(eq(domains.id, reserved.id));

    await registrar.configureDns(domainName, VERCEL_DNS_RECORDS);
    await attributeApiUsage(createHostingProvider(), { feature: "domains", siteId: site.id }).attachDomain(domainName);

    await db.update(domains).set({ status: "configured" }).where(eq(domains.id, reserved.id));
    await db
      .update(sites)
      .set({ domain: domainName, updatedAt: new Date() })
      .where(eq(sites.id, site.id));
  } catch (err) {
    await db.update(domains).set({ status: "error" }).where(eq(domains.id, reserved.id));
    // Le détail (réponse du bureau d'enregistrement ou de l'hébergeur) reste dans les journaux
    console.error("[domains] commande ou configuration en échec", err instanceof Error ? err.message.slice(0, 300) : "erreur");
    return { error: "La mise en place du nom de domaine n'a pas abouti. Ne relancez pas la commande : contactez Harmony, nous terminons la configuration avec vous." };
  }

  revalidatePath("/compte");
  return { domain: domainName };
}

/**
 * Le client possède déjà un nom de domaine (OVH, Ionos, Gandi…) : il le
 * confie à Harmony et l'équipe s'occupe du rattachement (transfert ou DNS,
 * puis certificat). La demande est enregistrée en `pending` avec le
 * registrar « externe » et remonte dans le back office agence (page Clients).
 * Une demande par site : on ne « réserve » pas plusieurs noms.
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
  if (site.type !== "client" || !hasSite(site.plan)) return { error: "Le nom de domaine fait partie de la formule Site." };
  if (site.domain) return { error: `Un domaine est déjà rattaché : ${site.domain}` };

  const outcome = await db.transaction(async (tx) => {
    await lockSiteDomain(tx, site.id);
    const existing = await tx.query.domains.findFirst({ where: eq(domains.name, domainName) });
    if (existing) {
      return existing.siteId === site.id
        ? { error: "Votre demande pour ce domaine est déjà enregistrée" }
        : { error: "Ce domaine est déjà géré par Harmony" };
    }
    const own = await tx.query.domains.findFirst({ where: eq(domains.siteId, site.id) });
    if (own) return { error: REQUEST_PENDING };
    await tx
      .insert(domains)
      .values({ siteId: site.id, name: domainName, registrar: "externe", status: "pending" });
    return {};
  });
  if ("error" in outcome) return { error: outcome.error };

  revalidatePath("/compte");
  return { domain: domainName };
}

/**
 * Portail de facturation Stripe (null en mode mock). Le praticien en revient
 * sur la page « Mon compte » du studio : à l'adresse publique du studio
 * (`STUDIO_BASE_URL`), sinon à l'origine de la requête en cours — jamais à une
 * adresse locale écrite en dur, qui ne mène nulle part en production.
 */
export async function openBillingPortal(): Promise<{ url: string | null }> {
  const session = await requireClient();
  const db = getDb();
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.siteId, session.siteId),
  });
  if (!subscription?.stripeCustomerId) return { url: null };
  const requestHeaders = await headers();
  const base = studioOrigin(
    process.env.STUDIO_BASE_URL,
    {
      origin: requestHeaders.get("origin"),
      host: requestHeaders.get("host"),
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
    },
    DEFAULT_STUDIO_BASE_URL,
  );
  const url = await createBillingProvider().createPortalUrl(subscription.stripeCustomerId, `${base}/compte`);
  return { url };
}
