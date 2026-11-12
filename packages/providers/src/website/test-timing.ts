/**
 * Chronomètre des tests de robustesse du lecteur.
 *
 * Ces tests vérifient qu'un document piégé est traité en un passage : quelques
 * dizaines de millisecondes, là où une lecture quadratique prendrait des
 * minutes. Mesuré à l'horloge, le même calcul dépasse son seuil dès que la
 * machine est occupée ailleurs (toutes les suites lancées en parallèle, une
 * intégration continue chargée) sans que le code ait changé. On mesure donc le
 * temps de calcul consommé par le processus du test, que l'attente d'un
 * processeur libre n'allonge pas.
 *
 * Réservé aux tests : rien ici n'est importé par le lecteur.
 */

/** Temps de calcul consommé par ce processus depuis son démarrage, en millisecondes. */
export function cpuNow(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1_000;
}

/** Exécute `run` et rend son résultat avec le temps de calcul qu'il a coûté. */
export function timed<T>(run: () => T): { value: T; ms: number } {
  const start = cpuNow();
  const value = run();
  return { value, ms: cpuNow() - start };
}
