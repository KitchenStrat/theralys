import { PageSkeleton } from "@/components/ds";

/** Pendant le chargement d'un article : un en-tête et deux cartes (le texte, la publication), pas le calendrier. */
export default function Loading() {
  return <PageSkeleton tiles={0} cards={2} />;
}
