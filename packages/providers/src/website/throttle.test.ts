import { describe, expect, it } from "vitest";
import { SafeFetchError } from "./safe-fetch";
import { createThrottle, sleep } from "./throttle";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Lance `count` tâches de `durationMs` et relève leurs départs, leurs fins et le nombre de tâches simultanées. */
async function runTasks(throttle: ReturnType<typeof createThrottle>, count: number, durationMs: number): Promise<{ starts: number[]; ends: number[]; peak: number }> {
  const starts: number[] = [];
  const ends: number[] = [];
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: count }, () =>
      throttle.run(async () => {
        starts.push(Date.now());
        active += 1;
        peak = Math.max(peak, active);
        await wait(durationMs);
        active -= 1;
        ends.push(Date.now());
      }),
    ),
  );
  return { starts, ends, peak };
}

const gaps = (times: number[]): number[] => times.slice(1).map((time, index) => time - times[index]!);

describe("createThrottle — politesse envers le site lu", () => {
  it("jamais plus de requêtes simultanées que la limite", async () => {
    const { peak, starts } = await runTasks(createThrottle({ concurrency: 2, minIntervalMs: 0 }), 7, 20);
    expect(starts).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it("un écart minimal sépare deux départs, même quand les requêtes sont rapides", async () => {
    const { starts, peak } = await runTasks(createThrottle({ concurrency: 2, minIntervalMs: 60 }), 4, 5);
    // Marge de 5 ms pour la précision des minuteries
    for (const gap of gaps(starts)) expect(gap).toBeGreaterThanOrEqual(55);
    expect(peak).toBe(1);
  });

  it("les tâches partent dans l'ordre où elles ont été demandées", async () => {
    const throttle = createThrottle({ concurrency: 1, minIntervalMs: 5 });
    const order: number[] = [];
    await Promise.all([1, 2, 3, 4, 5].map((n) => throttle.run(async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("Crawl-delay : les requêtes partent une par une, l'écart compté depuis la fin de la précédente", async () => {
    const throttle = createThrottle({ concurrency: 2, minIntervalMs: 10 });
    throttle.setCrawlDelay(80);
    const { starts, ends, peak } = await runTasks(throttle, 3, 40);
    expect(peak).toBe(1);
    expect(starts[1]! - ends[0]!).toBeGreaterThanOrEqual(75);
    expect(starts[2]! - ends[1]!).toBeGreaterThanOrEqual(75);
  });

  it("un Crawl-delay plus court que l'écart minimal ne l'abaisse pas ; une valeur nulle ou négative est ignorée", async () => {
    const throttle = createThrottle({ concurrency: 2, minIntervalMs: 60 });
    throttle.setCrawlDelay(0);
    throttle.setCrawlDelay(-5);
    // Toujours deux à la fois : la seconde part 60 ms après la première, qui dure encore
    expect((await runTasks(throttle, 2, 150)).peak).toBe(2);
    throttle.setCrawlDelay(5);
    const { starts, ends } = await runTasks(throttle, 2, 5);
    expect(starts[1]! - ends[0]!).toBeGreaterThanOrEqual(55);
  });

  it("la tâche qui échoue libère sa place et son erreur remonte telle quelle", async () => {
    const throttle = createThrottle({ concurrency: 1, minIntervalMs: 0 });
    await expect(throttle.run(() => Promise.reject(new Error("panne")))).rejects.toThrow("panne");
    await expect(throttle.run(async () => "suivante")).resolves.toBe("suivante");
  });

  it("interruption pendant l'attente : les tâches en file échouent avec le motif du signal, sans démarrer", async () => {
    const stop = new AbortController();
    const throttle = createThrottle({ concurrency: 1, minIntervalMs: 0, signal: stop.signal });
    let started = 0;
    const first = throttle.run(async () => {
      started += 1;
      await wait(100);
    });
    const queued = [1, 2].map(() =>
      throttle.run(async () => {
        started += 1;
      }),
    );
    setTimeout(() => stop.abort(new SafeFetchError("deadline", "durée de lecture dépassée")), 20);
    for (const task of queued) await expect(task).rejects.toMatchObject({ name: "SafeFetchError", code: "deadline" });
    await first;
    expect(started).toBe(1);
    await expect(throttle.run(async () => "après")).rejects.toMatchObject({ code: "deadline" });
  });

  it("interruption pendant l'écart entre deux requêtes : l'attente s'arrête aussitôt", async () => {
    const stop = new AbortController();
    const throttle = createThrottle({ concurrency: 2, minIntervalMs: 5_000, signal: stop.signal });
    await throttle.run(async () => undefined);
    const started = Date.now();
    setTimeout(() => stop.abort(), 30);
    await expect(throttle.run(async () => undefined)).rejects.toMatchObject({ code: "aborted" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("sleep", () => {
  it("attend la durée demandée ; interrompue, elle rejette avec le motif du signal", async () => {
    const started = Date.now();
    await sleep(40);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    await expect(sleep(5_000, AbortSignal.abort())).rejects.toMatchObject({ code: "aborted" });
    await expect(sleep(5_000, AbortSignal.timeout(20))).rejects.toMatchObject({ code: "deadline" });
  });
});
