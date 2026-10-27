export type GtagFn = (...args: unknown[]) => void;

export type TrackingWindow = Window & {
  dataLayer?: unknown[];
  gtag?: GtagFn;
};

/**
 * `window.gtag` s'il existe, sinon l'amorce officielle de la balise Google :
 * chaque commande est poussée dans `dataLayer` sous forme d'objet `arguments`.
 * gtag.js ne traite comme commande (`js`, `config`, `event`…) que cet objet :
 * un tableau est interprété comme un appel de méthode et ignoré.
 */
export function ensureGtag(w: TrackingWindow): GtagFn {
  if (typeof w.gtag === "function") return w.gtag;
  w.dataLayer = w.dataLayer ?? [];
  const gtag = function (..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params -- gtag.js exige l'objet `arguments`, pas un tableau
    (w.dataLayer = w.dataLayer ?? []).push(arguments);
  };
  w.gtag = gtag;
  return gtag;
}
