import { redirect } from "next/navigation";
import { LogOut, PauseCircle } from "lucide-react";
import { Button, Card, Stagger } from "@/components/ds";
import { destroySession, getSession, getSuspendedSession } from "@/lib/auth";
import { AuthFrame } from "../login/auth-frame";

export const metadata = { title: "Abonnement terminé" };
export const dynamic = "force-dynamic";

async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

/**
 * Abonnement terminé : le site public n'est plus servi et les outils sont en
 * pause. Le praticien peut encore se connecter — il arrive ici, où il lit quoi
 * faire, plutôt que sur un refus de connexion incompréhensible.
 */
export default async function SubscriptionEndedPage() {
  if (await getSession()) redirect("/");
  const session = await getSuspendedSession();
  if (!session) redirect("/login");

  return (
    <AuthFrame>
      <Stagger>
        <Card padding="lg">
          <span aria-hidden className="grid size-14 place-items-center rounded-ds-md bg-ds-warning-100 text-ds-warning-700">
            <PauseCircle size={28} />
          </span>
          <h1 className="mt-5 font-ds-voice text-ds-title font-bold text-ds-ink-900 text-balance">Votre abonnement est terminé</h1>
          <p className="mt-2 text-base text-ds-ink-600">
            Votre site et vos outils sont en pause. Vos contenus sont conservés : contactez Harmony pour réactiver votre espace.
          </p>
          <form action={logoutAction} className="mt-6">
            <Button type="submit" variant="secondary" size="lg" icon={<LogOut size={20} aria-hidden />} className="w-full">
              Se déconnecter
            </Button>
          </form>
        </Card>
      </Stagger>
    </AuthFrame>
  );
}
