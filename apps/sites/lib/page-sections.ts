import type { Section, SectionType } from "@theralys/shared";

/** Première section d'un type donné (typée), quelle que soit sa visibilité. */
export function findSection<T extends SectionType>(
  sections: Section[] | null | undefined,
  type: T,
): Extract<Section, { type: T }> | undefined {
  return sections?.find((s): s is Extract<Section, { type: T }> => s.type === type);
}
