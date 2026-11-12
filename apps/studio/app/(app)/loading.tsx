import { PageSkeleton } from "@/components/ds";

/** Pendant le chargement d'une page du studio : sa silhouette, plutôt qu'un écran vide. */
export default function Loading() {
  return <PageSkeleton />;
}
