import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { Button, PageHeader, SECTIONS, Stagger, isSectionKey } from "@/components/ds";
import { PreviewNav } from "../../_components/preview-nav";
import { SectionBody } from "../../_components/section-body";
import { assertPreviewAllowed } from "../../_lib/guard";
import { SECTION_SAMPLES } from "../../_lib/sample";

type Props = { params: Promise<{ cle: string }> };

export async function generateMetadata({ params }: Props) {
  const { cle } = await params;
  return { title: isSectionKey(cle) ? `Aperçu — ${SECTIONS[cle].label}` : "Aperçu" };
}

/**
 * Composition : une page de section type (en-tête, onglets, cartes, génération
 * longue, état vide), aux couleurs de la section demandée dans l'adresse.
 */
export default async function SectionPreviewPage({ params }: Props) {
  assertPreviewAllowed();
  const { cle } = await params;
  if (!isSectionKey(cle) || cle === "accueil") notFound();
  const sample = SECTION_SAMPLES[cle];

  return (
    <>
      <PreviewNav current="section" />
      <Stagger className="space-y-6">
        <PageHeader section={cle} action={<Button icon={<Plus size={18} aria-hidden />}>{sample.action}</Button>} />
        <SectionBody section={cle} sample={sample} />
      </Stagger>
    </>
  );
}
