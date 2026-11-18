"use server";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
  PLANS,
  getDb,
  leads,
  planPrice,
  prospects,
  sites,
  subscriptions,
  users,
  type BillingPeriod,
} from "@theralys/db";
import { purgeMockLibrary } from "@theralys/jobs";
import { createBillingProvider } from "@theralys/providers/billing";
import { requireAdmin } from "@/lib/auth";
import { markProspectWon } from "@/lib/crm/write";
import { createClientInvitation } from "@/lib/invitations";

const convertSchema = z.object({
  siteId: z.string().uuid(),
  plan: z.enum(["starter", "scale"]),
  period: z.enum(BILLING_PERIODS),
  clientEmail: z.string().trim().email("Email invalide"),
});

export type ConversionResult =
  | { error: string }
  | {
      email: string;
      /** Lien de création du mot de passe (7 jours) */
      setupUrl: string;
      /** true si l'e-mail d'invitation est parti (Resend configuré) */
      emailSent: boolean;
      /** Lien de paiement Stripe à transmettre (null en mode mock : actif direct) */
      checkoutUrl: string | null;
      billingMode: "stripe" | "mock";
    };

/**
 * Les durées « trimestriel » et « 3 ans » demandent la migration 0010 (deux
 * valeurs de plus dans le type `billing_period`). On le vérifie avant de
 * créer quoi que ce soit : un refus de la base en cours de conversion
 * laisserait un compte sans abonnement.
 */
async function periodStorable(period: BillingPeriod): Promise<boolean> {
  if (period === "monthly" || period === "annual") return true;
  const result = await getDb().execute(
    sql`select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'billing_period' and e.enumlabel = ${period} limit 1`,
  );
  return result.rows.length > 0;
}

/**
 * Conversion démo → site client (activation manuelle par l'admin) :
 * compte client + formule + abonnement Stripe + site publié.
 * Le lien de démo devient l'URL de production en attendant le domaine custom.
 */
export async function convertDemoToClient(input: unknown): Promise<ConversionResult> {
  await requireAdmin();
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { siteId, plan, period, clientEmail } = parsed.data;
  if (planPrice(plan, period) === null) {
    return { error: `La formule ${PLANS[plan].label} n'est pas proposée sur la durée « ${BILLING_PERIOD_LABELS[period]} ».` };
  }
  if (!(await periodStorable(period))) {
    return {
      error: `La durée « ${BILLING_PERIOD_LABELS[period]} » demande la migration 0010 (packages/db/drizzle/0010_billing_periods.sql) : appliquez-la à la base, puis recommencez.`,
    };
  }

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site || site.type !== "demo") return { error: "Démo introuvable" };
  if (await db.query.users.findFirst({ where: eq(users.email, clientEmail) })) {
    return { error: "Un compte existe déjà avec cet email" };
  }
  const prospect = site.prospectId
    ? await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
    : null;

  const billing = createBillingProvider();
  const subscription = await billing.startSubscription({
    siteId,
    plan,
    period,
    customerEmail: clientEmail,
    customerName: prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name,
  });

  // Compte créé SANS mot de passe utilisable : le client choisit le sien via
  // le lien d'invitation (sentinelle « invite: » — verifyPassword échoue toujours).
  const [clientUser] = await db
    .insert(users)
    .values({
      email: clientEmail,
      passwordHash: `invite:${randomBytes(16).toString("hex")}`,
      role: "client",
      name: prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name,
      siteId,
    })
    .returning();

  await db
    .insert(subscriptions)
    .values({
      siteId,
      plan,
      billingPeriod: period,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.siteId,
      set: {
        plan,
        billingPeriod: period,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
    });

  await db
    .update(sites)
    .set({
      type: "client",
      status: "published",
      plan,
      demoExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, siteId));

  // Jamais de données simulées chez un client : les exemples gardés pendant la démo sur une veille de démonstration sont retirés
  try {
    const purged = await purgeMockLibrary(db, siteId);
    if (purged > 0) console.info("[conversion] exemples Meta Ads de démonstration retirés", { siteId, purged });
  } catch (err) {
    console.error("[conversion] purge de la bibliothèque Meta Ads en échec", { siteId, err });
  }

  // Pipeline commercial : le lead de ce prospect est gagné
  if (site.prospectId) {
    await db.update(leads).set({ status: "won" }).where(eq(leads.prospectId, site.prospectId));
    await markProspectWon(db, site.prospectId, siteId);
  }

  const invitation = await createClientInvitation({
    userId: clientUser!.id,
    email: clientEmail,
    name: clientUser!.name,
  });

  // Pas de revalidatePath ici : la page d'édition de la démo n'existe plus
  // après conversion (elle deviendrait un 404 sous la modale d'invitation).
  // /demos et /clients sont rendues dynamiquement à chaque visite.
  return {
    email: clientEmail,
    setupUrl: invitation.setupUrl,
    emailSent: invitation.emailSent,
    checkoutUrl: subscription.checkoutUrl,
    billingMode: billing.mode,
  };
}
