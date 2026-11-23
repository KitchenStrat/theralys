import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_RATE_LIMITS, clearRateLimit, getDb, hitRateLimit, rateLimitMessage, type RateLimitRule } from "@theralys/db";
import { requestIp } from "@theralys/shared";
import { authenticate, createSession, currentStaff } from "@/lib/auth";
import { homeFor, isStaffRole } from "@/lib/staff";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

const ADMIN_LOGIN_BY_EMAIL: RateLimitRule = { ...LOGIN_RATE_LIMITS.email, scope: "admin-login:email", limit: 6 };
const ADMIN_LOGIN_BY_IP: RateLimitRule = { ...LOGIN_RATE_LIMITS.ip, scope: "admin-login:ip", limit: 20 };

async function loginAction(_prev: { error?: string }, formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email et mot de passe requis." };
  if (email.length > 320 || password.length > 200) return { error: "Identifiants incorrects." };

  // Essais répétés : limités par compte visé et par adresse d'origine, avant tout calcul de mot de passe.
  // Le back-office ouvre tous les comptes clients : des compteurs à lui, plus serrés que ceux du studio.
  const db = getDb();
  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(db, ADMIN_LOGIN_BY_EMAIL, email),
    hitRateLimit(db, ADMIN_LOGIN_BY_IP, requestIp(await headers())),
  ]);
  const refused = !byEmail.allowed ? byEmail : !byIp.allowed ? byIp : null;
  if (refused) return { error: rateLimitMessage(refused) };

  const user = await authenticate(email, password);
  if (!user) return { error: "Identifiants incorrects." };

  await clearRateLimit(db, ADMIN_LOGIN_BY_EMAIL, email);
  await createSession(user);
  redirect(isStaffRole(user.role) ? homeFor(user.role) : "/");
}

export default async function LoginPage() {
  // Déjà connecté : vers son accueil — seulement si la session ouvre encore quelque chose (compte relu en base).
  // Un jeton encore signé mais dont le compte est fermé reste ici, sans aller-retour avec la page qui le refuse.
  const user = await currentStaff();
  if (user) redirect(homeFor(user.role));

  return (
    <main data-touch className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-primary-500">Harmony</span>
          <p className="mt-1 text-sm text-ink-500">Back office agence</p>
        </div>
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
