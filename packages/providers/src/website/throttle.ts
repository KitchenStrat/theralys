/**
 * Politesse envers le site lu : peu de requêtes à la fois et un écart
 * minimal entre deux requêtes. Toutes les requêtes d'une lecture (pages,
 * robots.txt, plan de site, redirections) passent par le même ordonnanceur :
 * un petit site mutualisé ne doit pas sentir passer la lecture.
 */

import { toSafeFetchError } from "./safe-fetch";

export type ThrottleOptions = {
  /** Requêtes simultanées au plus */
  concurrency: number;
  /** Écart minimal entre deux départs de requête (ms) */
  minIntervalMs: number;
  /** Interrompt les attentes (durée totale de la lecture, appelant) */
  signal?: AbortSignal;
};

export type Throttle = {
  /** Exécute la tâche quand son tour vient ; lève `SafeFetchError` si la lecture est interrompue pendant l'attente. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
  /**
   * Applique le `Crawl-delay` demandé par le site : les requêtes partent
   * alors une par une, et l'écart est compté depuis la fin de la précédente.
   */
  setCrawlDelay: (delayMs: number) => void;
};

/** Attente interruptible : rejette avec le motif du signal. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toSafeFetchError(signal.reason));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(toSafeFetchError(signal?.reason));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const { signal } = options;
  let interval = Math.max(0, options.minIntervalMs);
  let serial = false;
  let active = 0;
  let nextStartAt = 0;
  /** File d'attente : chaque départ attend que le précédent ait pris sa place */
  let queue: Promise<void> = Promise.resolve();
  let wake: (() => void) | null = null;

  const waitForSlot = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const onAbort = (): void => {
        wake = null;
        reject(toSafeFetchError(signal?.reason));
      };
      wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  async function acquire(): Promise<void> {
    const previous = queue;
    let leave!: () => void;
    queue = new Promise<void>((resolve) => {
      leave = resolve;
    });
    await previous;
    try {
      if (signal?.aborted) throw toSafeFetchError(signal.reason);
      while (active >= (serial ? 1 : Math.max(1, options.concurrency))) await waitForSlot();
      const wait = nextStartAt - Date.now();
      if (wait > 0) await sleep(wait, signal);
      active += 1;
      nextStartAt = Date.now() + interval;
    } finally {
      leave();
    }
  }

  function release(): void {
    active -= 1;
    if (serial) nextStartAt = Math.max(nextStartAt, Date.now() + interval);
    const waiting = wake;
    wake = null;
    waiting?.();
  }

  return {
    run: async (task) => {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    setCrawlDelay: (delayMs) => {
      if (!(delayMs > 0)) return;
      serial = true;
      interval = Math.max(interval, delayMs);
    },
  };
}
