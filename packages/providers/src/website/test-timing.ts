/**
 * Chronomètre des tests de robustesse du lecteur.
 *
 * Ces tests vérifient qu'un document piégé est traité en un passage : quelques
 * dizaines de millisecondes, là où une lecture quadratique prendrait des
 * minutes. Deux précautions pour que leur verdict ne dépende pas de l'état de
 * la machine :
 *
 * - on mesure le temps de calcul consommé par le processus du test, et non le
 *   temps d'horloge, que l'attente d'un processeur libre allonge ;
 * - ce temps est rapporté à la vitesse du moment : une charge de référence
 *   (des chaînes assemblées et parcourues, comme le font ces tests) est
 *   chronométrée au moment de la mesure, et celle-ci est divisée par le
 *   ralentissement constaté. Sur une machine saturée — toutes les suites
 *   lancées en parallèle, mémoire sous pression —, le temps de calcul lui-même
 *   enfle de plusieurs fois sans que le code ait changé.
 *
 * La correction ne fait qu'élargir les seuils, de quelques fois au plus. Un
 * traitement redevenu quadratique les dépasse toujours : il coûte des milliers
 * de fois plus cher, pas quelques fois.
 *
 * Réservé aux tests : rien ici n'est importé par le lecteur.
 */

/** Temps de calcul consommé par ce processus depuis son démarrage, en millisecondes. */
export function cpuNow(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1_000;
}

/**
 * Durée de la charge de référence sur un poste de développement récent, au
 * repos (ms de calcul) : la machine pour laquelle les seuils des tests sont
 * écrits. Sur une machine deux fois plus lente ou deux fois plus chargée, la
 * charge de référence dure deux fois plus et les mesures sont divisées par
 * deux. En dessous de cette durée, aucune correction.
 */
const REFERENCE_NOMINAL_MS = 30;

/**
 * Charge de référence : assemble puis parcourt une longue chaîne de balises,
 * comme les documents de ces tests. Elle alloue beaucoup, exprès : c'est le
 * ramasse-miettes qui ralentit le plus ces tests sur une machine chargée.
 */
function referenceWorkload(): number {
  const parts: string[] = [];
  for (let i = 0; i < 150_000; i++) parts.push(`<p class="c${i % 7}">${i}</p>`);
  const markup = parts.join("");
  let sum = 0;
  for (let i = 0; i < markup.length; i += 2) sum += markup.charCodeAt(i);
  return sum;
}

// Première exécution hors mesure : elle paie la compilation de la charge de référence
referenceWorkload();

/** Dernière mesure, réutilisée un court instant : la charge de la machine ne change pas d'une ligne de test à l'autre. */
let lastMeasure: { at: number; factor: number } | null = null;
const MEASURE_TTL_MS = 200;

/** Ralentissement du moment : 1 sur une machine au repos, davantage sur une machine chargée. Jamais moins de 1. */
export function slowdown(): number {
  const now = Date.now();
  if (lastMeasure && now - lastMeasure.at < MEASURE_TTL_MS) return lastMeasure.factor;
  const start = cpuNow();
  referenceWorkload();
  const factor = Math.max(1, (cpuNow() - start) / REFERENCE_NOMINAL_MS);
  lastMeasure = { at: Date.now(), factor };
  return factor;
}

/** Temps de calcul écoulé depuis `start` (valeur de `cpuNow()`), rapporté à la vitesse du moment. */
export function sinceMs(start: number): number {
  const raw = cpuNow() - start;
  return raw / slowdown();
}

/**
 * Exécute `run` et rend son résultat avec le temps de calcul qu'il a coûté,
 * rapporté à la vitesse du moment — le plus fort des deux ralentissements
 * mesurés, avant et après.
 */
export function timed<T>(run: () => T): { value: T; ms: number } {
  const before = slowdown();
  const start = cpuNow();
  const value = run();
  const raw = cpuNow() - start;
  return { value, ms: raw / Math.max(before, slowdown()) };
}
