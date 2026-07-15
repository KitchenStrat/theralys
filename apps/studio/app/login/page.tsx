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

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-primary-500">Theralys</span>
          <p className="mt-1 text-sm text-ink-500">Votre espace praticien</p>
        </div>
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
