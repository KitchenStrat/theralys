"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, Card } from "@theralys/ui";

/**
 * Frontière d'erreur du segment : une lecture ou un rendu qui échoue affiche
 * un message et un bouton « Réessayer » au lieu de la page d'erreur générique.
 */
export default function SocialError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[social] page en erreur", error);
  }, [error]);

  return (
    <div>
      <h1 className="text-4xl font-bold">Réseaux sociaux</h1>
      <Card className="mt-6 p-10 text-center text-ink-500">
        <p className="font-medium text-ink-700">Cette section est momentanément indisponible.</p>
        <p className="mt-1 text-sm">
          Réessayez dans un instant : vos contenus et votre calendrier ne sont pas perdus.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Réessayer</Button>
          <Link href="/" className="text-sm font-medium text-primary-600 hover:underline">
            Retour à l&apos;accueil
          </Link>
        </div>
      </Card>
    </div>
  );
}
