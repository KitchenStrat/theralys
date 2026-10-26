import { isLegalPageSlug, type LegalPageSlug } from "@theralys/shared";

/**
 * Ce que l'aperçu (iframe) de l'éditeur affiche : la page d'accueil, une page
 * de spécialité, une page légale générée ou la page introuvable.
 */
export type PreviewTarget =
  | { kind: "home" }
  | { kind: "motif"; slug: string }
  | { kind: "legal"; slug: LegalPageSlug }
  | { kind: "notFound" };

/** URL volontairement inconnue : le site public sert sa page introuvable. */
export const NOT_FOUND_PREVIEW_PATH = "/__introuvable";

/** Chemin (sous le site) de la cible, sans jeton. */
export function previewPathname(target: PreviewTarget): string {
  switch (target.kind) {
    case "home":
      return "";
    case "motif":
      return `/motifs/${encodeURIComponent(target.slug)}`;
    case "legal":
      return `/${target.slug}`;
    case "notFound":
      return NOT_FOUND_PREVIEW_PATH;
  }
}

/**
 * Chemin d'aperçu complet : `?apercu=<jeton signé>` quand le studio en a un
 * (démo expirée, page désactivée, page introuvable… visibles à l'éditeur seul).
 */
export function previewPath(target: PreviewTarget, token: string): string {
  const path = previewPathname(target);
  return token ? `${path}?apercu=${encodeURIComponent(token)}` : path;
}

/**
 * Cible d'aperçu correspondant à la page éditée (`?page=`). Une page de
 * spécialité en préparation n'a pas encore de contenu (le site public
 * répondrait 404) : l'aperçu reste sur l'accueil jusqu'à la fin de la génération.
 */
export function previewTargetForPage(
  page: { type: string; slug: string } | null,
  generatingMotifs: { slug: string; error?: string }[] = [],
): PreviewTarget {
  if (page && page.type === "motif") {
    const generating = generatingMotifs.some((g) => g.slug === page.slug && !g.error);
    return generating ? { kind: "home" } : { kind: "motif", slug: page.slug };
  }
  return { kind: "home" };
}

/** Cible « page légale » à partir d'un slug libre (null si inconnu). */
export function legalPreviewTarget(slug: string): PreviewTarget | null {
  return isLegalPageSlug(slug) ? { kind: "legal", slug } : null;
}

/** Deux cibles désignent-elles la même page ? */
export function samePreviewTarget(a: PreviewTarget, b: PreviewTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "motif" && b.kind === "motif") return a.slug === b.slug;
  if (a.kind === "legal" && b.kind === "legal") return a.slug === b.slug;
  return true;
}
