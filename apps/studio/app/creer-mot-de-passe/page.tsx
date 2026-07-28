import Link from "next/link";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, users } from "@theralys/db";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Créer mon mot de passe" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string }> };

/** Arrivée depuis l'e-mail d'invitation : le client choisit son mot de passe. */
export default async function SetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const state = await inspectToken(token);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream-100 p-6">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold text-primary-500">Harmony</p>
        <p className="text-sm text-ink-500">Votre espace praticien</p>
      </div>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-card">
        {state.kind === "ok" ? (
          <>
            <h1 className="font-semibold">Bienvenue {state.firstName} 👋</h1>
            <p className="mt-1 text-sm text-ink-500">
              Choisissez le mot de passe de votre espace ({state.email}).
            </p>
            <SetPasswordForm token={token!} />
          </>
        ) : state.kind === "already" ? (
          <>
            <h1 className="font-semibold">Compte déjà activé</h1>
            <p className="mt-2 text-sm text-ink-500">
              Votre mot de passe a déjà été créé — connectez-vous simplement.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              Se connecter
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-semibold">Lien expiré ou invalide</h1>
            <p className="mt-2 text-sm text-ink-500">
              Ce lien d&apos;invitation n&apos;est plus valable. Contactez Harmony pour en recevoir
              un nouveau.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

async function inspectToken(
  token: string | undefined,
): Promise<
  | { kind: "ok"; firstName: string; email: string }
  | { kind: "already" }
  | { kind: "invalid" }
> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return { kind: "invalid" };
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "studio-password-setup" || typeof payload.sub !== "string") {
      return { kind: "invalid" };
    }
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user || user.role !== "client") return { kind: "invalid" };
    if (!user.passwordHash.startsWith("invite:")) return { kind: "already" };
    return { kind: "ok", firstName: user.name.split(" ")[0] ?? user.name, email: user.email };
  } catch {
    return { kind: "invalid" };
  }
}
