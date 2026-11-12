import { PageSkeleton } from "@/components/ds";

/** Pendant le chargement du compte : un en-tête et deux cartes (l'abonnement, le domaine), sans tuiles de chiffres. */
export default function Loading() {
  return <PageSkeleton tiles={0} cards={2} />;
}
