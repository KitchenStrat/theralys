import type { Metadata } from "next";
import { Landing } from "@/components/landing";

/*
 * Aperçu de la page avec la section des témoignages, pour juger du rendu tant
 * que ses contenus sont provisoires. La page n'est ni liée ni indexée.
 */
export const metadata: Metadata = {
  title: "Aperçu : la page avec les témoignages",
  robots: { index: false, follow: false },
  alternates: { canonical: "/apercu" },
};

export default function PreviewPage() {
  return <Landing testimonials />;
}
