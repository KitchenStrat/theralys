"use client";

import { useEffect } from "react";
import { CloudOff, RotateCw } from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageHeader, Stagger } from "@/components/ds";

/**
 * Frontière d'erreur du segment : une lecture ou un rendu qui échoue affiche
 * un message et un bouton « Réessayer » au lieu de la page d'erreur générique.
 */
export default function GoogleAdsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[google-ads] page en erreur", error);
  }, [error]);

  return (
    <Stagger className="space-y-6">
      <PageHeader section="google-ads" />
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={CloudOff}
          title="Cette section est momentanément indisponible."
          action={
            <Button type="button" icon={<RotateCw size={18} aria-hidden />} onClick={reset}>
              Réessayer
            </Button>
          }
          secondary={
            <LinkButton href="/" variant="quiet">
              Retour à l&apos;accueil
            </LinkButton>
          }
        >
          Réessayez dans un instant : votre analyse, vos mots-clés et votre plan d&apos;action ne sont pas perdus.
        </EmptyState>
      </Card>
    </Stagger>
  );
}
