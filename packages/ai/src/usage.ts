/**
 * Consommation d'un appel Anthropic, pour le registre des appels API : tokens
 * réellement facturés et coût au barème. Avec un repli côté serveur
 * (`fallbacks`), chaque modèle qui a tourné est facturé à son propre prix :
 * le détail vient alors de `usage.iterations`.
 */

import { anthropicCostUsd, anthropicPrice, type ApiUsageEvent } from "@theralys/shared";

type TokenCounts = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

type IterationLike = TokenCounts & { type: string; model?: string | null };

/** Sous-ensemble de la réponse de l'API utile à la mesure (compatible avec `BetaMessage`). */
export type AnthropicUsageSource = {
  model: string;
  usage: TokenCounts & { iterations?: readonly IterationLike[] | null };
};

const n = (value: number | null | undefined): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Entrées d'`iterations` qui correspondent à un échantillonnage du modèle (les compactions et conseillers sont comptés à part par l'API). */
const SAMPLING_ITERATIONS = new Set(["message", "fallback_message"]);

/**
 * Tokens et coût d'une réponse. `requestedModel` : modèle demandé — s'il
 * diffère du modèle qui a servi (repli), il est noté dans `meta`.
 */
export function anthropicUsageOf(message: AnthropicUsageSource, requestedModel: string): Pick<ApiUsageEvent, "model" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "costUsd" | "costSource" | "meta"> {
  const iterations = (message.usage.iterations ?? []).filter((entry) => SAMPLING_ITERATIONS.has(entry.type));
  const parts: { model: string; tokens: TokenCounts }[] =
    iterations.length > 0 ? iterations.map((entry) => ({ model: entry.model || message.model, tokens: entry })) : [{ model: message.model, tokens: message.usage }];
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let costUsd = 0;
  let priceKnown = true;
  for (const part of parts) {
    const usage = {
      inputTokens: n(part.tokens.input_tokens),
      outputTokens: n(part.tokens.output_tokens),
      cacheReadTokens: n(part.tokens.cache_read_input_tokens),
      cacheWriteTokens: n(part.tokens.cache_creation_input_tokens),
    };
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    cacheReadTokens += usage.cacheReadTokens;
    cacheWriteTokens += usage.cacheWriteTokens;
    costUsd += anthropicCostUsd(part.model, usage);
    if (!anthropicPrice(part.model).known) priceKnown = false;
  }
  const fallback = iterations.some((entry) => entry.type === "fallback_message");
  const meta: Record<string, unknown> = {};
  if (message.model !== requestedModel) meta.requestedModel = requestedModel;
  if (fallback) meta.fallback = true;
  if (!priceKnown) meta.priceUnknown = true;
  return {
    model: message.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    costSource: "tariff",
    meta: Object.keys(meta).length > 0 ? meta : null,
  };
}
