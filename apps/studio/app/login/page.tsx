import { redirect } from "next/navigation";
import { authenticateClient, createSession, getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

async function loginAction(_prev: { error?: string }, formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email et mot de passe requis." };

  const user = await authenticateClient(email, password);
  if (!user) return { error: "Identifiants incorrects." };

  await createSession(user);
  redirect("/");
}

type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-primary-500">Harmony</span>
          <p className="mt-1 text-sm text-ink-500">Votre espace praticien</p>
        </div>
        {error === "lien" ? (
          <p className="mb-4 rounded-2xl bg-danger-100 px-4 py-3 text-sm text-danger-500">
            Le lien d&apos;accès a expiré ou est invalide. Si vous arrivez depuis
            l&apos;admin Harmony, relancez l&apos;ouverture depuis le bouton (le lien
            n&apos;est valable que 2 minutes).
          </p>
        ) : null}
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
