/**
 * Déplace un élément d'une liste (flèches ↑↓ des listes de l'éditeur :
 * questions de FAQ, étapes, cartes, horaires…). Fonction pure : retourne une
 * nouvelle liste ; indices hors limites ou identiques → copie inchangée.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= next.length ||
    to >= next.length ||
    !Number.isInteger(from) ||
    !Number.isInteger(to)
  ) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
