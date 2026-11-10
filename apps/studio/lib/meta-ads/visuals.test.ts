import { describe, expect, it } from "vitest";
import type { MetaAdMedia } from "@theralys/shared";
import { META_VISUALS_BATCH, VISUALS_MESSAGES, visualsBatchOutcome } from "./visuals";

const A = "700000000000001";
const B = "700000000000002";
const C = "700000000000003";

function media(items = 1): MetaAdMedia {
  return {
    version: 1,
    format: "image",
    variants: false,
    items: Array.from({ length: items }, () => ({ kind: "image" as const, posterUrl: "https://stockage.exemple/a.jpg", sourceImageUrl: null, sourceVideoUrl: null })),
    avatarUrl: null,
    ctaText: null,
    linkUrl: null,
    pageCategories: [],
    pageLikes: null,
    sourceExpiresAt: null,
    fetchedAt: "2026-11-10T10:00:00.000Z",
    source: "scrapecreators",
  };
}

const enriched = (overrides: Partial<Parameters<typeof visualsBatchOutcome>[1]> = {}): Parameters<typeof visualsBatchOutcome>[1] => ({
  mediaByAdId: {},
  lookups: 0,
  blocked: false,
  unavailable: false,
  busy: false,
  overQuota: 0,
  ...overrides,
});

describe("visualsBatchOutcome", () => {
  it("lot abouti et annonces restantes : décompte, on enchaîne", () => {
    const out = visualsBatchOutcome([A, B, C], enriched({ mediaByAdId: { [A]: media(), [B]: media(0) }, lookups: 3 }), 9);
    // B : cherchée, sans visuel ; C : introuvable — seule A compte comme visuel affiché
    expect(out).toEqual({ attempted: [A, B, C], found: 1, lookups: 3, missing: 9, stop: false });
  });

  it("plus rien à chercher : on s'arrête sans erreur", () => {
    expect(visualsBatchOutcome([A], enriched({ mediaByAdId: { [A]: media() }, lookups: 1 }), 0)).toEqual({ attempted: [A], found: 1, lookups: 1, missing: 0, stop: true });
  });

  it("quota atteint en cours de lot : ce qui a abouti est gardé, on s'arrête ; quota déjà atteint : message", () => {
    expect(visualsBatchOutcome([A, B], enriched({ mediaByAdId: { [A]: media() }, lookups: 1, overQuota: 1 }), 4)).toEqual({ attempted: [A, B], found: 1, lookups: 1, missing: 4, stop: true });
    expect(visualsBatchOutcome([A, B], enriched({ overQuota: 2 }), 5)).toMatchObject({ error: VISUALS_MESSAGES.quota, stop: true, found: 0 });
  });

  it("fournisseur indisponible : message si rien n'a abouti, arrêt silencieux sinon", () => {
    expect(visualsBatchOutcome([A, B], enriched({ blocked: true }), 5)).toMatchObject({ error: VISUALS_MESSAGES.blocked, stop: true });
    const partial = visualsBatchOutcome([A, B], enriched({ mediaByAdId: { [A]: media() }, lookups: 1, blocked: true }), 4);
    expect(partial.error).toBeUndefined();
    expect(partial).toMatchObject({ found: 1, stop: true });
  });

  it("autre lot en cours ou tables absentes : rien n'est tenté, message", () => {
    expect(visualsBatchOutcome([A], enriched({ busy: true }), 7)).toEqual({ attempted: [], found: 0, lookups: 0, missing: 7, stop: true, error: VISUALS_MESSAGES.busy });
    expect(visualsBatchOutcome([A], enriched({ unavailable: true }), 7)).toMatchObject({ attempted: [], error: VISUALS_MESSAGES.unavailable, stop: true });
  });

  it("un lot reste court pour que les visuels apparaissent au fil de l'eau", () => {
    expect(META_VISUALS_BATCH).toBeGreaterThanOrEqual(6);
    expect(META_VISUALS_BATCH).toBeLessThanOrEqual(20);
  });
});
