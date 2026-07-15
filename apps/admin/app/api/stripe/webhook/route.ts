import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, sites, subscriptions } from "@theralys/db";
import { handleStripeEvent, type StripeEventLike } from "@theralys/providers/billing";

export const dynamic = "force-dynamic";

/**
 * Webhooks Stripe Billing : impayés → past_due, annulation → canceled + site
 * archivé, changements de formule → gating synchronisé. La logique de
 * traduction (handleStripeEvent) est pure et testée unitairement.
 */
export async function POST(request: NextRequest) {
  const payload = await request.text();

  let event: StripeEventLike;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });
    try {
      event = (await new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_none").webhooks.constructEventAsync(
        payload,
        signature,
        secret,
      )) as unknown as StripeEventLike;
    } catch {
      return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }
  } else {
    // Sans secret configuré (dev/mock), accepte le JSON brut
    try {
      event = JSON.parse(payload) as StripeEventLike;
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
  }

  const action = handleStripeEvent(event);
  if (action.kind === "ignore") {
    return NextResponse.json({ received: true, ignored: action.reason });
  }

  const db = getDb();
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, action.stripeSubscriptionId),
  });
  if (!subscription) {
    return NextResponse.json({ received: true, ignored: "abonnement inconnu" });
  }

  await db
    .update(subscriptions)
    .set({
      status: action.status,
      ...(action.plan ? { plan: action.plan } : {}),
      ...(action.currentPeriodEnd ? { currentPeriodEnd: action.currentPeriodEnd } : {}),
    })
    .where(eq(subscriptions.id, subscription.id));

  // Le gating des fonctionnalités suit l'abonnement
  const siteUpdates: Partial<{ plan: typeof action.plan; status: "archived" | "published" }> = {};
  if (action.plan) siteUpdates.plan = action.plan;
  if (action.archiveSite) siteUpdates.status = "archived";
  else if (action.status === "active") siteUpdates.status = "published";
  if (Object.keys(siteUpdates).length > 0) {
    await db
      .update(sites)
      .set({ ...siteUpdates, updatedAt: new Date() } as never)
      .where(eq(sites.id, subscription.siteId));
  }

  return NextResponse.json({ received: true });
}
