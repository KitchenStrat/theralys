import { SignJWT } from "jose";
import { createMailProvider } from "@theralys/providers/mail";
import { withApiUsage } from "@theralys/shared/usage-runtime";
import { passwordFingerprint } from "@/lib/password-fingerprint";

/** Les valeurs saisies dans l'admin (prénom, adresse) ne sont jamais posées telles quelles dans le HTML d'un e-mail. */
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type InvitationResult = {
  /** Lien de création du mot de passe (7 jours) — à transmettre si non envoyé */
  setupUrl: string;
  /** true si un e-mail est réellement parti (Resend configuré) */
  emailSent: boolean;
  mailMode: "resend" | "mock";
};

/**
 * Invitation d'un client à créer son mot de passe : lien signé 7 jours vers
 * le studio + e-mail (Resend si configuré, sinon l'admin transmet le lien).
 *
 * Usage unique : le lien porte l'empreinte de la sentinelle « invite: » en
 * place quand il est créé (`passwordHash`). Choisir son mot de passe la
 * remplace, renvoyer une invitation aussi (nouvelle sentinelle) : dans les
 * deux cas les liens précédents cessent de valoir.
 */
export async function createClientInvitation(client: {
  userId: string;
  email: string;
  name: string;
  /** Sentinelle « invite: » du compte au moment de l'invitation. */
  passwordHash: string;
}): Promise<InvitationResult> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquante");

  const token = await new SignJWT({ purpose: "studio-password-setup", pv: passwordFingerprint(client.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(client.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 7 * 86_400)
    .sign(new TextEncoder().encode(secret));

  const base = (process.env.STUDIO_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
  const setupUrl = `${base}/creer-mot-de-passe?token=${encodeURIComponent(token)}`;

  const mail = createMailProvider();
  const firstName = client.name.split(" ")[0] ?? client.name;
  // Un échec transitoire du fournisseur (429, 5xx, délai) ne bloque pas l'invitation : le lien reste affiché à l'admin
  const result = await withApiUsage({ feature: "notifications" }, () => mail.send({
    to: client.email,
    subject: "Créez votre accès à votre espace praticien Harmony",
    text: [
      `Bonjour ${firstName},`,
      "",
      "Votre site est activé ! Pour accéder à votre espace praticien Harmony",
      "(statistiques, publications du blog, éditeur de votre site), choisissez",
      "votre mot de passe en cliquant sur ce lien (valable 7 jours) :",
      "",
      setupUrl,
      "",
      `Votre identifiant de connexion : ${client.email}`,
      "",
      "À très vite,",
      "L'équipe Harmony",
    ].join("\n"),
    html: `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#3d2c24">
        <h2 style="color:#e2603f">Harmony</h2>
        <p>Bonjour ${escapeHtml(firstName)},</p>
        <p>Votre site est activé ! Pour accéder à votre espace praticien
        (statistiques, publications du blog, éditeur de votre site), choisissez
        votre mot de passe :</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${escapeHtml(setupUrl)}" style="background:#e2603f;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600">
            Créer mon mot de passe
          </a>
        </p>
        <p style="font-size:13px;color:#8a7c72">Ce lien est valable 7 jours.
        Votre identifiant de connexion : <strong>${escapeHtml(client.email)}</strong></p>
        <p>À très vite,<br/>L'équipe Harmony</p>
      </div>
    `,
  })).catch((err: unknown) => {
    console.warn("[invitations] envoi de l'e-mail impossible :", err instanceof Error ? err.message : err);
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  });

  return { setupUrl, emailSent: result.sent, mailMode: mail.mode };
}

/** Le compte attend-il encore la création de son mot de passe ? */
export function isInvitePending(passwordHash: string): boolean {
  return passwordHash.startsWith("invite:");
}
