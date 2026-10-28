import { describe, expect, it } from "vitest";
import { ensureFbq, type FbqWindow } from "./fbq";

const isArguments = (value: unknown) => Object.prototype.toString.call(value) === "[object Arguments]";

describe("ensureFbq", () => {
  it("amorce le Pixel comme l'extrait officiel : queue, loaded, version, push, _fbq ; commandes empilées tant que fbevents.js manque", () => {
    const w = {} as FbqWindow;
    const fbq = ensureFbq(w);
    expect(w.fbq).toBe(fbq);
    expect(w._fbq).toBe(fbq);
    expect(fbq.push).toBe(fbq);
    expect(fbq.loaded).toBe(true);
    expect(fbq.version).toBe("2.0");
    expect(fbq.callMethod).toBeUndefined();

    fbq("init", "1234567890123456");
    fbq("track", "PageView");
    fbq("track", "Schedule");
    expect(fbq.queue).toHaveLength(3);
    // Objets `arguments` (pas des tableaux), comme dans l'amorce fournie par Meta
    expect(fbq.queue.every(isArguments)).toBe(true);
    expect(fbq.queue.map((c) => Array.from(c))).toEqual([
      ["init", "1234567890123456"],
      ["track", "PageView"],
      ["track", "Schedule"],
    ]);
  });

  it("délègue à callMethod dès que fbevents.js l'a posé, sans toucher à la file", () => {
    const w = {} as FbqWindow;
    const fbq = ensureFbq(w);
    fbq("init", "1234567890123456");
    const calls: unknown[][] = [];
    fbq.callMethod = (...args: unknown[]) => {
      calls.push(args);
    };
    fbq("track", "Contact");
    expect(calls).toEqual([["track", "Contact"]]);
    expect(fbq.queue).toHaveLength(1);
  });

  it("réutilise window.fbq existant (deuxième appelant, Pixel déjà chargé par ailleurs)", () => {
    const calls: unknown[][] = [];
    const existing = Object.assign(
      (...args: unknown[]) => {
        calls.push(args);
      },
      { queue: [], loaded: true, version: "2.0", push: () => undefined },
    );
    const w = { fbq: existing, _fbq: existing } as unknown as FbqWindow;
    expect(ensureFbq(w)).toBe(existing);
    ensureFbq(w)("track", "Schedule");
    expect(calls).toEqual([["track", "Schedule"]]);
    expect(w._fbq).toBe(existing);
  });
});
