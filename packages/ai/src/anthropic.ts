import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { emphasisFeedback, findEmphasisGaps, needsEmphasisRetry } from "./emphasis";
import { ETHICAL_PROMPT_RULES, checkEthicalComplianceDeep } from "./guardrails";

const DEFAULT_MODEL = "claude-opus-5";
/** Modèle de repli quand un classificateur de sécurité décline la requête. */
const FALLBACK_MODEL = "claude-opus-4-8";

export type AnthropicClientOptions = {
  apiKey: string;
  model?: string;
  /** Profondeur de réflexion (défaut : ANTHROPIC_EFFORT, sinon « high ») */
  effort?: Effort;
  /**
   * Exige des passages **gras** dans chaque texte descriptif (pages du site) :
   * une relance avec le détail des oublis si le modèle les a omis en masse.
   */
  emphasis?: boolean;
};

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

/**
 * « high » : le meilleur rendu rédactionnel d'Opus 5. Une génération de démo
 * enchaîne ~4 appels dans une même fonction Vercel : surveiller la durée et
 * redescendre à « medium » via ANTHROPIC_EFFORT (sans code) si nécessaire.
 */
function resolveEffort(requested?: Effort): Effort {
  const candidate = requested ?? process.env.ANTHROPIC_EFFORT;
  return (EFFORTS as readonly string[]).includes(candidate ?? "") ? (candidate as Effort) : "high";
}

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
  const effort = resolveEffort(opts.effort);

  let feedback = "";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    // Streaming obligatoire pour une sortie longue : sans lui, le SDK refuse
    // un appel dont la durée estimée dépasse 10 min (max_tokens élevé).
    const response = await client.beta.messages
      .stream({
        model,
        // Opus 5 réfléchit par défaut (adaptatif) et cette réflexion compte dans
        // max_tokens : large marge pour ne jamais tronquer le JSON généré.
        max_tokens: 32000,
        output_config: { effort },
        // Repli serveur : si un classificateur de sécurité décline la requête,
        // l'API la rejoue sur le modèle de repli dans le même appel.
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: FALLBACK_MODEL }],
        system: `${systemPrompt}\n\n${ETHICAL_PROMPT_RULES}\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code.`,
        messages: [{ role: "user", content: feedback ? `${userPrompt}\n\n${feedback}` : userPrompt }],
      })
      .finalMessage();

    // Toute la chaîne (modèle + repli) a décliné : inutile de retenter le même prompt
    if (response.stop_reason === "refusal") {
      const why =
        response.stop_details?.explanation ?? response.stop_details?.category ?? "raison inconnue";
      throw new Error(`Requête déclinée par les garde-fous du modèle : ${why}`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Réponse tronquée (max_tokens atteint) : JSON incomplet");
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const raw: unknown = parseModelJson(text);
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
      // Mise en forme : un oubli massif du gras vaut une relance (une seule)
      if (opts.emphasis && attempt === 0) {
        const report = findEmphasisGaps(parsed);
        if (needsEmphasisRetry(report)) {
          feedback = emphasisFeedback(report);
          continue;
        }
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

/**
 * JSON.parse tolérant : le modèle glisse parfois des caractères de contrôle
 * bruts (retour à la ligne, tabulation…) dans les chaînes, ce que JSON
 * interdit (« Bad control character in string literal »).
 */
export function parseModelJson(text: string): unknown {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(cleaned));
  }
}

function escapeControlCharsInStrings(json: string): string {
  const named: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of json) {
    const code = char.codePointAt(0) ?? 0;
    if (inString && code < 0x20) {
      out += named[char] ?? `\\u${code.toString(16).padStart(4, "0")}`;
      escaped = false;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    }
    out += char;
  }
  return out;
}
