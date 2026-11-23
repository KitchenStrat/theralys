import Link from "next/link";
import { Card } from "@theralys/ui";

/** Fiche inexistante, supprimée, ou qui n'est pas dans la portée de la personne : la réponse est la même. */
export default function ContactNotFound() {
  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold text-ink-900">Fiche introuvable</h1>
      <p className="mt-2 text-sm text-ink-700">Ce prospect n&apos;existe pas, ou il ne fait pas partie de vos prospects.</p>
      <Link href="/crm" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary-500 px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-600">
        Retour au CRM
      </Link>
    </Card>
  );
}
