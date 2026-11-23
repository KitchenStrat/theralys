"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb, hitRateLimit, type RateLimitRule } from "@theralys/db";
import { DEFAULT_STUDIO_BASE_URL } from "@theralys/jobs";
import { createMailProvider } from "@theralys/providers/mail";
import { requestIp } from "@theralys/shared";
import { withApiUsage } from "@theralys/shared/usage-runtime";
import { findUserByEmail, passwordFingerprint } from "@/lib/auth";
import { signPasswordResetToken } from "@/lib/password-links";
import { studioOrigin } from "../(app)/compte/studio-origin";

/** Demandes de lien par adresse d'origine et par compte : un e-mail part à chaque fois, la boîte du praticien n'est pas une cible. */
const RESET_BY_IP: RateLimitRule = { scope: "password:reset:ip", limit: 6, windowSeconds: 60 * 60 };
const RESET_BY_EMAIL: RateLimitRule = { scope: "password:reset:email", limit: 3, windowSeconds: 60 * 60 };

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type ResetRequestState = { done?: boolean; error?: string };

/**
 * Demande d'un lien de réinitialisation. La réponse est la même qu'un compte
 * existe ou non à cette adresse : la page ne sert pas à tester des adresses.
 * Le lien (1 heure, usage unique) ne part que vers l'adresse du compte.
 */
export async function requestPasswordReset(_previous: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const parsed = z.string().trim().email().max(320).safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Saisissez l'adresse e-mail de votre espace." };
  const email = parsed.data;

  const secret = process.env.AUTH_SECRET;
  const mail = createMailProvider();
  if (!secret || mail.mode !== "resend") return { error: "L'envoi d'e-mails n'est pas disponible pour le moment. Contactez Harmony pour recevoir un nouveau lien." };

  const requestHeaders = await headers();
  const db = getDb();
  const [byIp, byEmail] = await Promise.all([
    hitRateLimit(db, RESET_BY_IP, requestIp(requestHeaders)),
    hitRateLimit(db, RESET_BY_EMAIL, email),
  ]);
  if (!byIp.allowed) return { error: "Trop de demandes à la suite. Réessayez dans une heure." };
  // Limite par compte atteinte : même réponse que d'habitude, sans nouvel e-mail
  if (!byEmail.allowed) return { done: true };

  const user = await findUserByEmail(email);
  if (!user || user.role !== "client" || !user.siteId || !user.passwordHash.startsWith("scrypt:")) return { done: true };

  const token = await signPasswordResetToken(user.id, passwordFingerprint(user.passwordHash), secret);
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
  const url = `${base}/creer-mot-de-passe?token=${encodeURIComponent(token)}`;
  const firstName = user.name.split(" ")[0] ?? user.name;

  try {
    await withApiUsage({ feature: "notifications", siteId: user.siteId }, () =>
      mail.send({
        to: user.email,
        subject: "Votre nouveau mot de passe Harmony",
        text: [
          `Bonjour ${firstName},`,
          "",
          "Vous avez demandé à choisir un nouveau mot de passe pour votre espace praticien Harmony.",
          "Ouvrez ce lien (valable 1 heure, une seule fois) :",
          "",
          url,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.",
          "",
          "L'équipe Harmony",
        ].join("\n"),
        html: `
          <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1f2a37">
            <h2 style="color:#00679a">Harmony</h2>
            <p>Bonjour ${escapeHtml(firstName)},</p>
            <p>Vous avez demandé à choisir un nouveau mot de passe pour votre espace praticien.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${escapeHtml(url)}" style="background:#00679a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600">
                Choisir mon nouveau mot de passe
              </a>
            </p>
            <p style="font-size:13px;color:#5b6675">Ce lien est valable 1 heure et ne sert qu'une fois. Si vous n'êtes pas à l'origine
            de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>
            <p>L'équipe Harmony</p>
          </div>
        `,
      }),
    );
  } catch (error) {
    // Échec transitoire du fournisseur : rien n'est dit au demandeur de plus qu'en cas de succès
    console.warn("[mot-de-passe] envoi du lien impossible :", error instanceof Error ? error.name : "erreur");
  }
  return { done: true };
}
