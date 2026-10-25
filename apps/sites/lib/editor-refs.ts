import type { ContactSection, ReviewsSection, Section } from "@theralys/shared";

/**
 * Repère d'une section rendue, transmis à l'éditeur du studio (EditorBridge) :
 * - `{ index }`  : section propre à la page, `index` = sa position dans
 *                  `page.sections` en base (c'est cet index que le studio édite) ;
 * - `{ shared }` : section héritée de l'accueil (avis Google, contact), qui
 *                  s'édite sur la page d'accueil — l'attribut porte alors le
 *                  type, jamais d'index.
 */
export type EditorRef = { index: number } | { shared: true };

/** Refs d'une page dont les sections sont rendues telles quelles (accueil). */
export function identityRefs(count: number): EditorRef[] {
  return Array.from({ length: count }, (_, index) => ({ index }));
}

export type MotifComposition = {
  sections: Section[];
  refs: EditorRef[];
};

/**
 * Composition d'une page de spécialité : les sections de la page (sans les
 * bandeaux CTA des anciennes générations, redondants ici) + les avis Google
 * de l'accueil insérés AVANT la FAQ (preuve sociale d'abord, questions
 * ensuite) + le contact de l'accueil en bas. Chaque section propre garde son
 * index d'origine dans `pageSections` (avant retrait des CTA) pour que le
 * studio sélectionne la bonne carte ; reviews/contact hérités sont `shared`.
 */
export function composeMotifSections(
  pageSections: Section[],
  homeSections: Section[] | null | undefined,
): MotifComposition {
  const homeReviews = homeSections?.find((s): s is ReviewsSection => s.type === "reviews");
  const homeContact = homeSections?.find((s): s is ContactSection => s.type === "contact");

  // Sections propres avec leur index d'origine, CTA retirés
  const own = pageSections
    .map((section, index) => ({ section, ref: { index } as EditorRef }))
    .filter(({ section }) => section.type !== "cta");

  const reviews: Section = homeReviews ?? { type: "reviews", title: "Ils me font confiance" };
  const faqAt = own.findIndex(({ section }) => section.type === "faq");
  const before = faqAt === -1 ? own : own.slice(0, faqAt);
  const after = faqAt === -1 ? [] : own.slice(faqAt);

  const composed = [
    ...before,
    { section: reviews, ref: { shared: true } as EditorRef },
    ...after,
    ...(homeContact ? [{ section: homeContact, ref: { shared: true } as EditorRef }] : []),
  ];

  return {
    sections: composed.map((c) => c.section),
    refs: composed.map((c) => c.ref),
  };
}
