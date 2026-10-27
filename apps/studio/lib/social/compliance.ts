/**
 * Garde-fous des saisies libres du studio (sujet d'une demande, consignes
 * permanentes, instructions de régénération, légende modifiée) : vocabulaire
 * interdit par la réglementation (`checkEthicalCompliance`) puis règles
 * sociales (`checkSocialCompliance` : avant/après, promesse chiffrée,
 * majuscules criées…), avec le mot en cause dans le message. Fonctions pures,
 * partagées par les actions Réseaux sociaux et Fiche Google.
 */

import {
  checkEthicalCompliance,
  checkSocialCompliance,
  FORBIDDEN_PATTERNS,
  SOCIAL_FORBIDDEN_PATTERNS,
} from "@theralys/ai";

/** Premier terme interdit du texte (pour le message), sinon null. */
export function forbiddenWord(
  text: string,
  patterns: readonly { pattern: RegExp }[] = FORBIDDEN_PATTERNS,
): string | null {
  for (const { pattern } of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (match) return match[0];
  }
  return null;
}

/**
 * Phrases négatives (« Ne jamais promettre de guérison », « éviter… »,
 * « sans… ») : des interdictions, pas des consignes à reproduire.
 */
const NEGATION =
  /\b(ne|n')\s*\S*\s*(pas|jamais|plus|rien|aucun|aucune)\b|\b(jamais|éviter|évitez|évite|sans|interdit|interdite|interdits|proscrire|proscrit|bannir|exclure|aucun|aucune|pas de)\b/i;

/**
 * Contrôle d'une consigne ou d'une instruction : on ne juge que ce que le
 * praticien DEMANDE. Les phrases négatives et les passages entre guillemets
 * (« … ») sont des interdictions ou des citations, pas des consignes à
 * reproduire ; le reste est vérifié en minuscules (la règle « majuscules
 * criées » vise les légendes, pas un sigle dans une consigne). `subject`
 * ouvre le message (« Vos consignes », « Vos instructions »). Message
 * distinct pour le vocabulaire médical et les règles sociales ; null si tout
 * est acceptable.
 */
export function instructionsRefusal(instructions: string, subject = "Vos consignes"): string | null {
  const judged = instructions
    .replace(/«[^»]*»|"[^"\n]*"|“[^”]*”/g, " ")
    .split(/(?<=[.!?;\n])\s+|\n/)
    .filter((sentence) => sentence.trim() !== "" && !NEGATION.test(sentence))
    .join(" ")
    .toLowerCase();
  if (judged.trim() === "") return null;
  const ethical = checkEthicalCompliance(judged);
  if (!ethical.ok) {
    const word = forbiddenWord(judged, FORBIDDEN_PATTERNS) ?? ethical.violations[0]?.rule ?? "";
    return `${subject} contiennent un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`;
  }
  const social = checkSocialCompliance(judged);
  if (!social.ok) {
    const rule = social.violations[0]?.rule ?? "";
    const word = forbiddenWord(judged, SOCIAL_FORBIDDEN_PATTERNS) ?? rule;
    const detail = rule === "" || rule.toLowerCase() === word.toLowerCase() ? `« ${word} »` : `« ${word} », ${rule}`;
    return `${subject} contiennent une formulation que nous n'employons pas sur les réseaux (${detail}). Reformulez-la.`;
  }
  return null;
}

/**
 * Refus d'une légende saisie : le vocabulaire interdit par la réglementation
 * puis les règles sociales, avec le mot en cause. Null si acceptable.
 */
export function captionRefusal(caption: string): string | null {
  const ethical = checkEthicalCompliance(caption);
  if (!ethical.ok) {
    const word = forbiddenWord(caption) ?? ethical.violations[0]?.rule ?? "";
    return `Votre légende contient un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`;
  }
  const social = checkSocialCompliance(caption);
  if (!social.ok) {
    const rule = social.violations[0]?.rule ?? "";
    const word = forbiddenWord(caption, SOCIAL_FORBIDDEN_PATTERNS) ?? rule;
    const detail = rule === "" || rule.toLowerCase() === word.toLowerCase() ? `« ${word} »` : `« ${word} », ${rule}`;
    return `Votre légende contient une formulation que nous n'employons pas sur les réseaux (${detail}). Reformulez-la.`;
  }
  return null;
}
