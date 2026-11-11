import { describe, expect, it } from "vitest";
import { ANTHROPIC_FALLBACK_PRICE_MODEL, anthropicCostUsd } from "@theralys/shared";
import { anthropicUsageOf, type AnthropicUsageSource } from "./usage";

type Usage = AnthropicUsageSource["usage"];
type Iteration = NonNullable<Usage["iterations"]>[number];

/** Compteurs d'une réponse de l'API (tous les champs présents, comme dans `BetaUsage`). */
function tokens(input: number, output: number, cache: { write?: number; read?: number } = {}) {
  return { input_tokens: input, output_tokens: output, cache_creation_input_tokens: cache.write ?? 0, cache_read_input_tokens: cache.read ?? 0 };
}

function iteration(type: string, model: string | null, input: number, output: number, cache: { write?: number; read?: number } = {}): Iteration {
  return { type, model, ...tokens(input, output, cache) };
}

describe("anthropicUsageOf — sans itérations", () => {
  it("tokens de la réponse, coût au barème du modèle servi, aucune note quand le modèle est celui demandé", () => {
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: tokens(1_200, 800) }, "claude-opus-5")).toEqual({
      model: "claude-opus-5",
      inputTokens: 1_200,
      outputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      // (1 200 × 5 + 800 × 25) / 1 000 000
      costUsd: 0.026,
      costSource: "tariff",
      meta: null,
    });
  });

  it("`iterations` null ou vide : même résultat que sans le champ", () => {
    const expected = anthropicUsageOf({ model: "claude-opus-5", usage: tokens(1_200, 800) }, "claude-opus-5");
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(1_200, 800), iterations: null } }, "claude-opus-5")).toEqual(expected);
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(1_200, 800), iterations: [] } }, "claude-opus-5")).toEqual(expected);
  });

  it("cache : écriture et lecture reprises dans leurs compteurs et facturées à leur facteur", () => {
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: tokens(1_000, 500, { write: 2_000, read: 10_000 }) }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 1_000, outputTokens: 500, cacheWriteTokens: 2_000, cacheReadTokens: 10_000, costUsd: 0.035, meta: null });
    expect(measured.costUsd).toBe(anthropicCostUsd("claude-opus-5", { inputTokens: 1_000, outputTokens: 500, cacheWriteTokens: 2_000, cacheReadTokens: 10_000 }));
  });

  it("chaque modèle à son prix", () => {
    const usage = tokens(10_000, 2_000);
    const cost = (model: string) => anthropicUsageOf({ model, usage }, model).costUsd;
    expect(cost("claude-fable-5-2")).toBe(0.16);
    expect(cost("claude-opus-5-5")).toBe(0.08);
    expect(cost("claude-opus-5")).toBe(0.1);
    expect(cost("claude-sonnet-5-5")).toBe(0.04);
    expect(cost("claude-haiku-5-5")).toBe(0.002);
  });

  it("compteurs null, absents, négatifs ou NaN : 0", () => {
    const empty = { model: "claude-opus-5", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, costSource: "tariff", meta: null };
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: {} }, "claude-opus-5")).toEqual(empty);
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: { input_tokens: null, output_tokens: undefined, cache_creation_input_tokens: null, cache_read_input_tokens: null } }, "claude-opus-5")).toEqual(empty);
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: { input_tokens: -40, output_tokens: Number.NaN, cache_creation_input_tokens: Number.POSITIVE_INFINITY, cache_read_input_tokens: -1 } }, "claude-opus-5")).toEqual(empty);
    // Un compteur manquant n'efface pas les autres
    expect(anthropicUsageOf({ model: "claude-opus-5", usage: { input_tokens: null, output_tokens: 1_000 } }, "claude-opus-5")).toMatchObject({ inputTokens: 0, outputTokens: 1_000, costUsd: 0.025 });
  });
});

describe("anthropicUsageOf — modèle servi différent du modèle demandé", () => {
  it("identifiant daté : modèle servi enregistré, modèle demandé noté, prix retrouvé par préfixe", () => {
    expect(anthropicUsageOf({ model: "claude-opus-5-20260115", usage: tokens(1_200, 800) }, "claude-opus-5")).toEqual({
      model: "claude-opus-5-20260115",
      inputTokens: 1_200,
      outputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.026,
      costSource: "tariff",
      meta: { requestedModel: "claude-opus-5" },
    });
  });

  it("le coût est celui du modèle servi, pas du modèle demandé", () => {
    const measured = anthropicUsageOf({ model: "claude-haiku-5-5", usage: tokens(100_000, 20_000) }, "claude-fable-5-2");
    expect(measured.costUsd).toBe(0.02);
    expect(measured.meta).toEqual({ requestedModel: "claude-fable-5-2" });
  });

  it("modèle absent du barème : prix de repli, signalé par `priceUnknown`", () => {
    const usage = tokens(3_000, 1_200);
    const measured = anthropicUsageOf({ model: "claude-nova-1", usage }, "claude-nova-1");
    expect(measured).toMatchObject({ model: "claude-nova-1", costSource: "tariff", meta: { priceUnknown: true } });
    expect(measured.costUsd).toBe(anthropicCostUsd(ANTHROPIC_FALLBACK_PRICE_MODEL, { inputTokens: 3_000, outputTokens: 1_200 }));
    expect(measured.costUsd).toBe(0.045);
    // Demandé connu, servi inconnu : les deux notes
    expect(anthropicUsageOf({ model: "claude-nova-1", usage }, "claude-opus-5").meta).toEqual({ requestedModel: "claude-opus-5", priceUnknown: true });
  });
});

describe("anthropicUsageOf — avec itérations (repli côté serveur)", () => {
  /** Fable 5.2 décline (8 $ / 40 $), Opus 4.8 répond (5 $ / 25 $). */
  const declined = iteration("message", "claude-fable-5-2", 1_000, 200);
  const served = iteration("fallback_message", "claude-opus-4-8", 1_000, 3_000);

  it("message + fallback_message : tokens additionnés, chaque modèle facturé à son propre prix", () => {
    const measured = anthropicUsageOf({ model: "claude-opus-4-8", usage: { ...tokens(1_000, 3_000), iterations: [declined, served] } }, "claude-fable-5-2");
    expect(measured).toEqual({
      model: "claude-opus-4-8",
      inputTokens: 2_000,
      outputTokens: 3_200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      // (1 000 × 8 + 200 × 40) / 1 000 000 + (1 000 × 5 + 3 000 × 25) / 1 000 000
      costUsd: 0.096,
      costSource: "tariff",
      meta: { requestedModel: "claude-fable-5-2", fallback: true },
    });
    // Ni tout au prix du modèle servi (0,09 $), ni tout au prix du modèle demandé (0,144 $)
    expect(measured.costUsd).not.toBe(anthropicCostUsd("claude-opus-4-8", { inputTokens: 2_000, outputTokens: 3_200 }));
    expect(measured.costUsd).not.toBe(anthropicCostUsd("claude-fable-5-2", { inputTokens: 2_000, outputTokens: 3_200 }));
  });

  it("les compteurs de tête sont ignorés dès qu'une itération d'échantillonnage existe", () => {
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(5, 5, { write: 5, read: 5 }), iterations: [iteration("message", "claude-opus-5", 1_000, 100, { write: 400, read: 2_000 })] } }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 1_000, outputTokens: 100, cacheWriteTokens: 400, cacheReadTokens: 2_000, meta: null });
    // (1 000 + 400 × 1,25 + 2 000 × 0,1) × 5 + 100 × 25 = 11 000 millionièmes
    expect(measured.costUsd).toBe(0.011);
  });

  it("plusieurs itérations « message » (boucle d'outils côté serveur) : additionnées, sans note de repli", () => {
    const iterations = [iteration("message", "claude-opus-5", 1_000, 100), iteration("message", "claude-opus-5", 1_500, 300, { read: 1_000 }), iteration("message", "claude-opus-5", 2_000, 600)];
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(2_000, 600), iterations } }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 4_500, outputTokens: 1_000, cacheReadTokens: 1_000, cacheWriteTokens: 0, meta: null });
    expect(measured.costUsd).toBe(0.048);
  });

  it("autres types d'itération (compaction, conseiller, type inconnu) : ignorés", () => {
    const iterations = [
      iteration("compaction", "claude-opus-5", 9_000, 700),
      iteration("message", "claude-opus-5", 1_000, 100),
      iteration("advisor_message", "claude-fable-5-2", 4_000, 900),
      iteration("autre_chose", "claude-opus-5", 50_000, 50_000),
    ];
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(1_000, 100), iterations } }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 1_000, outputTokens: 100, costUsd: 0.0075, meta: null });
  });

  it("aucune itération d'échantillonnage (compaction seule) : retour aux compteurs de tête", () => {
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(1_200, 800), iterations: [iteration("compaction", "claude-opus-5", 9_000, 700)] } }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 1_200, outputTokens: 800, costUsd: 0.026, meta: null });
  });

  it("itération sans modèle (null, vide, absent) : facturée au prix du modèle de la réponse", () => {
    const withoutModel: Iteration = { type: "message", ...tokens(1_000, 1_000) };
    for (const entry of [iteration("message", null, 1_000, 1_000), iteration("message", "", 1_000, 1_000), withoutModel]) {
      const measured = anthropicUsageOf({ model: "claude-fable-5-2", usage: { ...tokens(0, 0), iterations: [entry] } }, "claude-fable-5-2");
      expect(measured).toMatchObject({ inputTokens: 1_000, outputTokens: 1_000, costUsd: 0.048, meta: null });
    }
  });

  it("itération aux compteurs null ou absents : comptée pour 0, les autres restent", () => {
    const partial: Iteration = { type: "message", model: "claude-opus-5", input_tokens: null, output_tokens: 400 };
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(0, 0), iterations: [partial, { type: "fallback_message", model: "claude-opus-4-8" }] } }, "claude-opus-5");
    expect(measured).toMatchObject({ inputTokens: 0, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 });
    expect(measured.meta).toEqual({ fallback: true });
  });

  it("repli sur le même modèle que celui demandé : `fallback` noté, pas de `requestedModel`", () => {
    const measured = anthropicUsageOf({ model: "claude-opus-5", usage: { ...tokens(0, 0), iterations: [iteration("fallback_message", "claude-opus-5", 800, 200)] } }, "claude-opus-5");
    expect(measured.meta).toEqual({ fallback: true });
  });

  it("modèle inconnu dans une seule itération : `priceUnknown`, cette part au prix de repli", () => {
    const iterations = [iteration("message", "claude-opus-5", 1_000, 100), iteration("fallback_message", "claude-nova-1", 2_000, 400)];
    const measured = anthropicUsageOf({ model: "claude-nova-1", usage: { ...tokens(2_000, 400), iterations } }, "claude-opus-5");
    expect(measured.meta).toEqual({ requestedModel: "claude-opus-5", fallback: true, priceUnknown: true });
    expect(measured.costUsd).toBe(0.0275);
  });

  it("coût arrondi au millionième de dollar, sans résidu de virgule flottante", () => {
    const iterations = [iteration("message", "claude-haiku-5-5", 333_333, 77_777), iteration("fallback_message", "claude-sonnet-4-6", 123_457, 9_871)];
    const costUsd = anthropicUsageOf({ model: "claude-sonnet-4-6", usage: { ...tokens(0, 0), iterations } }, "claude-haiku-5-5").costUsd ?? Number.NaN;
    expect(costUsd).toBe(Math.round(costUsd * 1_000_000) / 1_000_000);
    expect(String(costUsd).split(".")[1]!.length).toBeLessThanOrEqual(6);
    // Haiku 5.5 : prompt de plus de 100 000 tokens, donc palier supérieur (0,50 $ / 2,50 $)
    expect(costUsd).toBeCloseTo(0.361109 + 0.518436, 6);
  });
});
