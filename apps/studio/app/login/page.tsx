import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Card, Stagger } from "@/components/ds";
import { authenticateClient, createSession, getSession } from "@/lib/auth";
import { AuthFrame } from "./auth-frame";
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
    <AuthFrame>
      <Stagger className="space-y-4">
        {error === "lien" ? (
          <p
            role="alert"
            className="flex items-start gap-3 rounded-ds-card bg-ds-danger-100 p-4 text-ds-body text-ds-danger-900 shadow-ds-card ring-1 ring-ds-danger-600/20"
          >
            <TriangleAlert size={20} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Le lien d&apos;accès a expiré ou est invalide. Si vous arrivez depuis l&apos;admin Harmony, relancez
              l&apos;ouverture depuis le bouton (le lien n&apos;est valable que 2 minutes).
            </span>
          </p>
        ) : null}
        <Card padding="lg">
          <h1 className="font-ds-display text-ds-title font-bold text-ds-ink-900 text-balance">Connectez-vous</h1>
          <p className="mt-1.5 mb-6 text-base text-ds-ink-600">Saisissez l&apos;email et le mot de passe de votre espace.</p>
          <LoginForm action={loginAction} />
        </Card>
      </Stagger>
    </AuthFrame>
  );
}
