"use server";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
  FORMULAS,
  PLANS,
  getDb,
  leads,
  planFromFormulas,
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
  /** Formules souscrites : Site, Scale, ou les deux */
  formulas: z.array(z.enum(FORMULAS)).min(1, "Choisissez au moins une formule"),
  period: z.enum(BILLING_PERIODS),
  // En minuscules : une adresse ne donne qu'un compte, quelle que soit la casse saisie
  clientEmail: z.string().trim().toLowerCase().email("Email invalide"),
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
 * Conversion démo → compte client (activation manuelle par l'admin) :
 * compte client + formules + abonnement Stripe. Avec la formule Site, le site
 * de la démo est publié et son lien devient l'URL de production en attendant
 * le domaine custom ; avec la formule Scale seule, le client n'a pas de site
 * hébergé (les pages publiques ne le servent pas) et connecte le sien dans le
 * studio.
 */
export async function convertDemoToClient(input: unknown): Promise<ConversionResult> {
  const admin = await requireAdmin();
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { siteId, period, clientEmail } = parsed.data;
  const plan = planFromFormulas(parsed.data.formulas);
  if (!plan) return { error: "Choisissez au moins une formule" };
  if (planPrice(plan, period) === null) {
    return { error: `La formule ${PLANS[plan].label} n'est pas proposée sur la durée « ${BILLING_PERIOD_LABELS[period]} ».` };
  }
  if (!(await periodStorable(period))) {
    return {
      error: `La durée « ${BILLING_PERIOD_LABELS[period]} » demande la migration 0010 (packages/db/drizzle/0010_billing_periods.sql) : appliquez-la à la base, puis recommencez.`,
    };
  }

  const db = getDb();
  const billing = createBillingProvider();

  // Tout ou rien, et une seule conversion à la fois pour une démo : le verrou (tenu jusqu'à la fin de la
  // transaction) fait attendre un second clic, qui trouve ensuite la démo déjà convertie. Si une écriture
  // échoue, rien n'est gardé — pas de compte créé sans abonnement, pas de démo bloquée par un compte orphelin.
  const converted = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`convert:${siteId}`}))`);
    const site = await tx.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site || site.type !== "demo") return { ok: false as const, error: "Démo introuvable" };
    const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${clientEmail}`).limit(1);
    if (taken) return { ok: false as const, error: "Un compte existe déjà avec cet email" };
    const prospect = site.prospectId
      ? await tx.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : null;
    const clientName = prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name;

    const subscription = await billing.startSubscription({ siteId, plan, period, customerEmail: clientEmail, customerName: clientName });

    // Compte créé SANS mot de passe utilisable : le client choisit le sien via
    // le lien d'invitation (sentinelle « invite: » — verifyPassword échoue toujours).
    const [clientUser] = await tx
      .insert(users)
      .values({
        email: clientEmail,
        passwordHash: `invite:${randomBytes(16).toString("hex")}`,
        role: "client",
        name: clientName,
        siteId,
      })
      .returning();

    const billingState = {
      plan,
      billingPeriod: period,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
    await tx
      .insert(subscriptions)
      .values({ siteId, ...billingState })
      .onConflictDoUpdate({ target: subscriptions.siteId, set: billingState });

    await tx
      .update(sites)
      .set({
        type: "client",
        status: "published",
        plan,
        demoExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(sites.id, siteId));

    // Pipeline commercial : le lead de ce prospect est gagné
    if (site.prospectId) await tx.update(leads).set({ status: "won" }).where(eq(leads.prospectId, site.prospectId));

    return { ok: true as const, site, clientUser: clientUser!, subscription };
  });
  if (!converted.ok) return { error: converted.error };
  const { site, clientUser, subscription } = converted;

  // Jamais de données simulées chez un client : les exemples gardés pendant la démo sur une veille de démonstration sont retirés
  try {
    const purged = await purgeMockLibrary(db, siteId);
    if (purged > 0) console.info("[conversion] exemples Meta Ads de démonstration retirés", { siteId, purged });
  } catch (err) {
    console.error("[conversion] purge de la bibliothèque Meta Ads en échec", { siteId, err });
  }

  // Fiche du CRM : passée en « gagné » (hors transaction : un incident ici ne défait pas la conversion)
  if (site.prospectId) {
    try {
      await markProspectWon(db, { id: admin.id, role: admin.role }, site.prospectId, siteId);
    } catch (err) {
      console.error("[conversion] fiche CRM non mise à jour", { siteId, erreur: err instanceof Error ? err.name : "erreur" });
    }
  }

  const invitation = await createClientInvitation({
    userId: clientUser.id,
    email: clientEmail,
    name: clientUser.name,
    passwordHash: clientUser.passwordHash,
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
