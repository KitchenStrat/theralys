"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, Card } from "@theralys/ui";
import { TEXT_LINK } from "./styles";

/**
 * Frontière d'erreur du segment : une lecture ou un rendu qui échoue affiche
 * un message et un bouton « Réessayer » au lieu de la page d'erreur générique.
 * Seul l'identifiant de l'erreur est journalisé (jamais son message, qui peut
 * reprendre une adresse ou un texte).
 */
export default function MonSiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[mon-site] page en erreur", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-4xl font-bold">Mon site</h1>
      <Card className="mt-6 p-10 text-center">
        <p className="text-base font-medium text-ink-900">Cette section est momentanément indisponible.</p>
        <p className="mt-1 text-sm text-ink-700">Réessayez dans un instant : votre site, son profil et vos corrections ne sont pas perdus.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
          <Button onClick={reset}>Réessayer</Button>
          <Link href="/" className={`text-sm ${TEXT_LINK}`}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </Card>
    </div>
  );
}
