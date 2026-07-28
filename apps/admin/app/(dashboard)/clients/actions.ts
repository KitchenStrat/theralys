"use server";

import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { getDb, users } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { createClientInvitation } from "@/lib/invitations";

/**
 * Impersonation : URL signée courte durée (2 min) ouvrant le studio dans la
 * session du client — pour le support agence. Le studio marque la session
 * « mode support » et l'affiche en bannière.
 */
export async function getImpersonationUrl(
  siteId: string,
): Promise<{ url: string } | { error: string }> {
  const admin = await requireAdmin();
  const db = getDb();
  const clientUser = await db.query.users.findFirst({
    where: and(eq(users.siteId, siteId), eq(users.role, "client")),
  });
  if (!clientUser) return { error: "Aucun compte client pour ce site" };

  const secret = process.env.AUTH_SECRET;
  if (!secret) return { error: "AUTH_SECRET manquante" };

  const token = await new SignJWT({
    purpose: "studio-impersonation",
    impersonator: admin.id,
    name: clientUser.name,
    siteId: clientUser.siteId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(clientUser.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 120)
    .sign(new TextEncoder().encode(secret));

  const base = (process.env.STUDIO_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
  return { url: `${base}/impersonate?token=${encodeURIComponent(token)}` };
}

/**
 * Renvoie une invitation « créer votre mot de passe » (7 jours) — uniquement
 * tant que le client n'a pas encore activé son compte.
 */
export async function resendClientInvitation(
  siteId: string,
): Promise<{ setupUrl: string; emailSent: boolean } | { error: string }> {
  await requireAdmin();
  const db = getDb();
  const clientUser = await db.query.users.findFirst({
    where: and(eq(users.siteId, siteId), eq(users.role, "client")),
  });
  if (!clientUser) return { error: "Aucun compte client pour ce site" };
  if (!clientUser.passwordHash.startsWith("invite:")) {
    return { error: "Compte déjà activé — le client a déjà son mot de passe" };
  }
  const invitation = await createClientInvitation({
    userId: clientUser.id,
    email: clientUser.email,
    name: clientUser.name,
  });
  return { setupUrl: invitation.setupUrl, emailSent: invitation.emailSent };
}
