import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb, sites, subscriptions } from "@theralys/db";
import { canAttachSubscription, handleStripeEvent, subscriptionEffect, type StripeEventLike } from "@theralys/providers/billing";

export const dynamic = "force-dynamic";

/**
 * Webhooks Stripe Billing : paiement terminé → abonnement rattaché, impayés →
 * past_due, annulation → canceled + site archivé. La logique de traduction
 * (`handleStripeEvent`, `subscriptionEffect`) est pure et testée unitairement.
 *
 * Authenticité : en production, un événement n'est accepté que signé par
 * Stripe (`STRIPE_WEBHOOK_SECRET`). Sans ce secret la route refuse tout — elle
 * est publique, et un événement fabriqué pourrait archiver le site d'un
 * client. Le JSON non signé n'est lu qu'en développement.
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
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 503 });
  } else {
    // Développement sans secret : accepte le JSON brut
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

  // Paiement terminé : la ligne créée à la conversion (elle ne porte que le client Stripe) reçoit son abonnement
  if (action.kind === "link") {
    const linked = await db
      .update(subscriptions)
      .set({ stripeSubscriptionId: action.stripeSubscriptionId })
      .where(
        and(
          eq(subscriptions.stripeCustomerId, action.stripeCustomerId),
          or(isNull(subscriptions.stripeSubscriptionId), eq(subscriptions.stripeSubscriptionId, ""), eq(subscriptions.stripeSubscriptionId, action.stripeSubscriptionId)),
        ),
      )
      .returning({ id: subscriptions.id });
    return NextResponse.json(linked.length > 0 ? { received: true } : { received: true, ignored: "abonnement inconnu" });
  }

  // Par identifiant d'abonnement ; à défaut par client Stripe (premier événement avant le rattachement, réabonnement)
  let subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, action.stripeSubscriptionId),
  });
  if (!subscription && action.stripeCustomerId) {
    const byCustomer = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeCustomerId, action.stripeCustomerId),
    });
    if (byCustomer && canAttachSubscription(byCustomer, action.stripeSubscriptionId)) subscription = byCustomer;
  }
  if (!subscription) {
    return NextResponse.json({ received: true, ignored: "abonnement inconnu" });
  }

  const effect = subscriptionEffect(subscription, action);
  if (effect.kind === "ignore") {
    return NextResponse.json({ received: true, ignored: effect.reason });
  }

  await db.update(subscriptions).set(effect.subscription).where(eq(subscriptions.id, subscription.id));

  // Le site suit l'abonnement : archivé à l'annulation, republié à la reprise d'un abonnement terminé
  if (effect.site) {
    await db
      .update(sites)
      .set({ status: effect.site, updatedAt: new Date() })
      .where(effect.site === "published" ? and(eq(sites.id, subscription.siteId), eq(sites.status, "archived")) : eq(sites.id, subscription.siteId));
  }

  return NextResponse.json({ received: true });
}
