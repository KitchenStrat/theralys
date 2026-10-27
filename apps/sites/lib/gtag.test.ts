import { describe, expect, it } from "vitest";
import { ensureGtag, type TrackingWindow } from "./gtag";

const isArguments = (value: unknown) => Object.prototype.toString.call(value) === "[object Arguments]";

describe("ensureGtag", () => {
  it("amorce la balise : dataLayer créé, commandes poussées sous forme d'objet arguments (pas un tableau)", () => {
    const w = {} as TrackingWindow;
    const gtag = ensureGtag(w);
    expect(w.gtag).toBe(gtag);
    gtag("event", "conversion", { send_to: "AW-1234567890/AbCdEfGhIj" });
    expect(w.dataLayer).toHaveLength(1);
    const command = w.dataLayer?.[0];
    expect(isArguments(command)).toBe(true);
    expect(Array.isArray(command)).toBe(false);
    expect(Array.from(command as ArrayLike<unknown>)).toEqual([
      "event",
      "conversion",
      { send_to: "AW-1234567890/AbCdEfGhIj" },
    ]);
  });

  it("réutilise window.gtag et dataLayer existants", () => {
    const calls: unknown[][] = [];
    const existing = (...args: unknown[]) => {
      calls.push(args);
    };
    const w = { gtag: existing, dataLayer: [] } as unknown as TrackingWindow;
    expect(ensureGtag(w)).toBe(existing);
    ensureGtag(w)("event", "conversion", { send_to: "AW-1/x" });
    expect(calls).toEqual([["event", "conversion", { send_to: "AW-1/x" }]]);
    expect(w.dataLayer).toEqual([]);

    const w2 = { dataLayer: [{ "gtm.start": 1 }] } as unknown as TrackingWindow;
    ensureGtag(w2)("js", "now");
    expect(w2.dataLayer).toHaveLength(2);
    expect(isArguments(w2.dataLayer?.[1])).toBe(true);
  });
});
