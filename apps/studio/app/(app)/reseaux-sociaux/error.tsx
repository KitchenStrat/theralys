"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Card, EmptyState, LinkButton, PageHeader, Stagger } from "@/components/ds";
import { SECTION_PURPOSE } from "./social-ui";

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
    <Stagger className="space-y-6">
      <PageHeader section="reseaux-sociaux" purpose={SECTION_PURPOSE} />
      <Card padding="none">
        <EmptyState
          icon={TriangleAlert}
          title="Cette section est momentanément indisponible."
          as="h2"
          action={
            <Button icon={<RotateCcw size={18} aria-hidden />} onClick={reset}>
              Réessayer
            </Button>
          }
          secondary={
            <LinkButton href="/" variant="quiet">
              Retour à l&apos;accueil
            </LinkButton>
          }
        >
          Réessayez dans un instant : vos contenus et votre calendrier ne sont pas perdus.
        </EmptyState>
      </Card>
    </Stagger>
  );
}
