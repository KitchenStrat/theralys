import { InvitationForm } from "./invitation-form";

export const metadata = { title: "Créer mon mot de passe" };

/**
 * Arrivée depuis le lien d'invitation transmis par l'admin : le commercial
 * choisit son mot de passe, puis entre dans le CRM. Page publique ; le jeton
 * est dans le fragment de l'adresse, lu par le navigateur (`invitation-form`).
 */
export default function InvitationPage() {
  return (
    <main data-touch className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-primary-500">Harmony</span>
          <p className="mt-1 text-sm text-ink-500">Espace commercial</p>
        </div>
        <InvitationForm />
      </div>
    </main>
  );
}
