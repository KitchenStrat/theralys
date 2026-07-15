/**
 * Slugifie une chaîne pour URL : minuscules, accents retirés, tirets.
 * "Réflexologie plantaire à Albi" → "reflexologie-plantaire-a-albi"
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ajoute un suffixe numérique tant que le slug existe déjà. */
export function uniqueSlug(base: string, exists: (candidate: string) => boolean): string {
  const root = slugify(base) || "site";
  if (!exists(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!exists(candidate)) return candidate;
  }
}
