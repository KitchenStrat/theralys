import type { Metadata } from "next";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Merci — Harmony",
  description: "Votre paiement est enregistré. Vous recevez un e-mail pour créer l'accès à votre espace praticien.",
  // Page de retour après paiement : rien à référencer
  robots: { index: false, follow: false },
};

const STUDIO_URL = "https://app.harmony-web.fr";

/**
 * Retour de la page de paiement (Stripe Checkout) : le praticien vient de
 * régler son abonnement. Il lit ce qui se passe ensuite — l'e-mail qui lui
 * permet de créer son mot de passe — et où retrouver son espace.
 */
export default function ThanksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-cream-50 text-ink-700">
      <header className="border-b border-cream-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5">
          <a href="/" className="focus-ring inline-flex min-h-11 items-center rounded-lg text-2xl" aria-label="Harmony, retour à l'accueil">
            <Brand />
          </a>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
        <h1 className="font-display text-4xl text-ink-900 text-balance sm:text-5xl">Merci, votre paiement est enregistré</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed">
          Votre abonnement démarre. Un e-mail vient de partir à l&apos;adresse indiquée lors de votre inscription : il contient le
          lien pour choisir votre mot de passe et ouvrir votre espace praticien.
        </p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
          Rien reçu au bout de quelques minutes ? Regardez dans vos courriers indésirables, puis contactez Harmony.
        </p>
        <p className="mt-8">
          <a
            href={STUDIO_URL}
            className="cta focus-ring inline-flex min-h-12 items-center rounded-full bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-md shadow-black/10 transition-[background-color,scale] hover:bg-primary-700 active:scale-[0.98]"
          >
            Ouvrir mon espace praticien
          </a>
        </p>
      </main>
    </div>
  );
}
