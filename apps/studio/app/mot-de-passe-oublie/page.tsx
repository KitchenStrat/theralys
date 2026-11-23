import Link from "next/link";
import { redirect } from "next/navigation";
import { createMailProvider } from "@theralys/providers/mail";
import { Card, Stagger } from "@/components/ds";
import { getSession } from "@/lib/auth";
import { AuthFrame } from "../login/auth-frame";
import { requestPasswordReset } from "./actions";
import { ResetRequestForm } from "./reset-request-form";

export const metadata = { title: "Mot de passe oublié" };
export const dynamic = "force-dynamic";

/** Le praticien a oublié son mot de passe : il reçoit par e-mail un lien pour en choisir un nouveau. */
export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/compte");
  // Sans service d'envoi configuré, aucun e-mail ne partirait : on le dit, plutôt que de laisser attendre un lien
  const canSend = createMailProvider().mode === "resend";

  return (
    <AuthFrame>
      <Stagger>
        <Card padding="lg">
          <h1 className="font-ds-voice text-ds-title font-bold text-ds-ink-900 text-balance">Mot de passe oublié</h1>
          {canSend ? (
            <>
              <p className="mt-1.5 text-base text-ds-ink-600">
                Indiquez l&apos;adresse e-mail de votre espace : vous recevez un lien pour choisir un nouveau mot de passe.
              </p>
              <ResetRequestForm action={requestPasswordReset} />
            </>
          ) : (
            <p className="mt-1.5 text-base text-ds-ink-600">
              Contactez Harmony : nous vous envoyons un lien pour choisir un nouveau mot de passe.
            </p>
          )}
          <p className="mt-6 border-t border-ds-ink-200 pt-5 text-center text-ds-body">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center font-semibold text-ds-brand-700 underline decoration-ds-brand-700/40 underline-offset-4 hover:decoration-ds-brand-700"
            >
              Revenir à la connexion
            </Link>
          </p>
        </Card>
      </Stagger>
    </AuthFrame>
  );
}
