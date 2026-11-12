"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Button, Card, EmptyState, LinkButton, PageHeader, Stagger } from "@/components/ds";

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
    <Stagger className="space-y-6">
      <PageHeader section="mon-site" />
      <Card padding="none">
        <EmptyState
          icon={CloudOff}
          as="h2"
          title="Cette section est momentanément indisponible."
          action={
            <Button onClick={reset} icon={<RefreshCw size={18} aria-hidden />}>
              Réessayer
            </Button>
          }
          secondary={
            <LinkButton href="/" variant="quiet">
              Retour à l&apos;accueil
            </LinkButton>
          }
        >
          Réessayez dans un instant&nbsp;: votre site, son profil et vos corrections ne sont pas perdus.
        </EmptyState>
      </Card>
    </Stagger>
  );
}
