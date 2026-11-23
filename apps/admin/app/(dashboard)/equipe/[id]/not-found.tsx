import Link from "next/link";
import { Card } from "@theralys/ui";

export default function RepNotFound() {
  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold text-ink-900">Commercial introuvable</h1>
      <p className="mt-2 text-sm text-ink-700">Ce compte n&apos;existe pas, ou n&apos;est pas celui d&apos;un commercial.</p>
      <Link href="/equipe" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary-500 px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-600">
        Retour à l&apos;équipe
      </Link>
    </Card>
  );
}
