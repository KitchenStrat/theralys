import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { ETHICAL_PROMPT_RULES, checkEthicalComplianceDeep } from "./guardrails";

const DEFAULT_MODEL = "claude-sonnet-5";

export type AnthropicClientOptions = {
  apiKey: string;
  model?: string;
};

/**
 * Appelle Claude en demandant un JSON strict, valide avec zod, vérifie les
 * garde-fous éthiques, et retente une fois avec le détail des violations.
 */
export async function completeStructured<T>(
  opts: AnthropicClientOptions,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  let feedback = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: `${systemPrompt}\n\n${ETHICAL_PROMPT_RULES}\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code.`,
      messages: [{ role: "user", content: feedback ? `${userPrompt}\n\n${feedback}` : userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const raw: unknown = JSON.parse(stripCodeFences(text));
      const parsed = schema.parse(raw);
      const compliance = checkEthicalComplianceDeep(parsed);
      if (!compliance.ok) {
        feedback = `ATTENTION : ta précédente réponse contenait des formulations interdites (marketing éthique). Corrige impérativement :\n${compliance.violations
          .slice(0, 8)
          .map((v) => `- [${v.rule}] ${v.excerpt}`)
          .join("\n")}`;
        lastError = new Error(
          `Contenu non conforme au marketing éthique : ${compliance.violations[0]?.rule}`,
        );
        continue;
      }
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      feedback = `Ta précédente réponse n'était pas un JSON valide conforme au format demandé (${lastError.message.slice(0, 300)}). Recommence en respectant strictement le format.`;
    }
  }

  throw lastError ?? new Error("Échec de génération");
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
