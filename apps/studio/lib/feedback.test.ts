import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ calls: 0, failure: null as unknown }));

vi.mock("@theralys/db", async (original) => ({
  ...(await original<typeof import("@theralys/db")>()),
  getDb: () => ({
    select: () => ({
      from: () => ({
        limit: async () => {
          db.calls++;
          if (db.failure) throw db.failure;
          return [];
        },
      }),
    }),
  }),
}));

import { FEEDBACK_RATE_LIMIT, feedbackAvailable, resetFeedbackAvailability } from "./feedback";

const missingTable = () => Object.assign(new Error("requête échouée"), { cause: Object.assign(new Error('relation "product_feedback" does not exist'), { code: "42P01" }) });

beforeEach(() => {
  db.calls = 0;
  db.failure = null;
  resetFeedbackAvailability();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("« Votre avis » : l'espace est-il ouvert ?", () => {
  it("table présente : ouvert, et la base n'est plus interrogée ensuite", async () => {
    expect(await feedbackAvailable(1_000)).toBe(true);
    expect(await feedbackAvailable(2_000)).toBe(true);
    expect(await feedbackAvailable(900_000)).toBe(true);
    expect(db.calls).toBe(1);
  });

  it("table absente (migration 0016 pas encore appliquée) : fermé, sans bruit, revérifié au plus une fois par minute", async () => {
    db.failure = missingTable();
    expect(await feedbackAvailable(1_000)).toBe(false);
    expect(await feedbackAvailable(30_000)).toBe(false);
    expect(db.calls).toBe(1);
    expect(console.warn).not.toHaveBeenCalled();
    // La migration passe : l'espace s'ouvre à la vérification suivante, sans redéploiement
    db.failure = null;
    expect(await feedbackAvailable(59_000)).toBe(false);
    expect(await feedbackAvailable(62_000)).toBe(true);
    expect(db.calls).toBe(2);
  });

  it("base indisponible pour une autre raison : fermé pour l'instant, et signalé", async () => {
    db.failure = Object.assign(new Error("connexion perdue"), { code: "08006" });
    expect(await feedbackAvailable(1_000)).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("dix avis par cabinet et par jour", () => {
    expect(FEEDBACK_RATE_LIMIT).toEqual({ scope: "feedback:site", limit: 10, windowSeconds: 86_400 });
  });
});
