import { describe, expect, it } from "vitest";
import { computeGoogleMonthState, type GoogleMonthPostLite } from "./posts";

// Novembre 2026 vu depuis le 23 octobre : 4 mardis (3, 10, 17, 24)
const base = { year: 2026, month: 11, now: new Date("2026-10-23T12:00:00Z") };
const TUESDAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"];

function post(date: string, extra: Partial<GoogleMonthPostLite> = {}): GoogleMonthPostLite {
  return { scheduledFor: date, source: "calendar", status: "ready", ...extra };
}

describe("computeGoogleMonthState", () => {
  it("un créneau par mardi, tous à pourvoir sur un mois vierge", () => {
    const state = computeGoogleMonthState({ ...base, posts: [] });
    expect(state.slots.map((s) => s.date)).toEqual(TUESDAYS);
    expect(state.slots.every((s) => s.kind === "cadence")).toBe(true);
    expect(state.freeSlots).toHaveLength(4);
    expect(state.calendarCount).toBe(0);
    expect(state.toPublish).toBe(0);
  });

  it("mois en cours : seuls les mardis à venir sont des créneaux", () => {
    const state = computeGoogleMonthState({ year: 2026, month: 11, now: new Date("2026-11-10T12:00:00Z"), posts: [] });
    expect(state.slots.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-24"]);
  });

  it("mois préparé : compteurs par statut, aucun créneau libre", () => {
    const posts = TUESDAYS.map((d, i) => post(d, i === 0 ? { status: "published" } : {}));
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(4);
    expect(state.published).toBe(1);
    expect(state.toPublish).toBe(3);
  });

  it("déplacer ou archiver un post ne libère pas de créneau", () => {
    const moved = [post("2026-11-04"), ...TUESDAYS.slice(1).map((d) => post(d))];
    expect(computeGoogleMonthState({ ...base, posts: moved }).freeSlots).toEqual([]);
    const archived = TUESDAYS.map((d, i) => post(d, i < 2 ? { status: "archived" } : {}));
    const state = computeGoogleMonthState({ ...base, posts: archived });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(2);
  });

  it("plan partiel : les premiers créneaux non occupés, à hauteur des manquants", () => {
    const posts = [post(TUESDAYS[0]!), post(TUESDAYS[2]!)];
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots.map((s) => s.date)).toEqual(["2026-11-10", "2026-11-24"]);
  });

  it("les posts sur mesure n'occupent pas de créneau et sont comptés à part", () => {
    const posts = [...TUESDAYS.map((d) => post(d)), post("2026-11-03", { source: "request" })];
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.requestCount).toBe(1);
    expect(state.toPublish).toBe(5);
  });

  it("mois passé : aucun créneau", () => {
    const state = computeGoogleMonthState({ year: 2026, month: 9, now: base.now, posts: [] });
    expect(state.slots).toEqual([]);
  });
});
