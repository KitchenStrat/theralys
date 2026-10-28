export type FbqFn = {
  (...args: unknown[]): void;
  /** Posé par fbevents.js une fois chargé : les commandes ne passent plus par la file */
  callMethod?: (...args: unknown[]) => void;
  /** Commandes en attente (objets `arguments`, comme dans l'amorce officielle) */
  queue: ArrayLike<unknown>[];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

export type FbqWindow = Window & {
  fbq?: FbqFn;
  _fbq?: FbqFn;
};

/**
 * `window.fbq` s'il existe, sinon l'amorce officielle du Pixel Meta : une
 * fonction qui délègue à `callMethod` dès que fbevents.js l'a posé et, avant,
 * empile chaque commande (`init`, `track`…) dans `queue`, que fbevents.js vide
 * au chargement. `loaded`, `version`, `push` (= la fonction elle-même) et
 * `_fbq` sont posés comme dans l'extrait fourni par Meta, pour que fbevents.js
 * reconnaisse l'amorce. Partagée par TrackingScripts (init + PageView, script)
 * et ConversionEvents (Schedule, Contact) : le premier appelant crée la file,
 * les suivants la réutilisent. Ne charge jamais fbevents.js elle-même.
 */
export function ensureFbq(w: FbqWindow): FbqFn {
  if (typeof w.fbq === "function") return w.fbq;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    // eslint-disable-next-line prefer-rest-params -- fidèle à l'amorce officielle (objet `arguments`) ; fbevents.js vide la file avec apply
    else fbq.queue.push(arguments);
  } as FbqFn;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;
  return fbq;
}
