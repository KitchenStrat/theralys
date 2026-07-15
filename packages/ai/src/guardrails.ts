/**
 * Marketing éthique — contrainte légale forte pour les médecines douces :
 * aucune promesse thérapeutique ni allégation médicale dans le contenu généré.
 *
 * Cette liste est appliquée à TOUT contenu généré (site + articles), en mode
 * mock comme via l'API Anthropic (vérification post-génération + consigne
 * dans les prompts).
 */

export type GuardrailViolation = {
  /** Libellé lisible de la règle enfreinte */
  rule: string;
  /** Extrait du texte fautif */
  excerpt: string;
};

type ForbiddenPattern = { rule: string; pattern: RegExp };

export const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  { rule: "promesse de guérison", pattern: /\bgu[ée]ri\w*/gi },
  // « soigneusement », « décor soigné » sont légitimes : on ne vise que le verbe
  { rule: "vocabulaire médical (soigner)", pattern: /\bsoign(?:e|er|ez|ent)s?\b/gi },
  { rule: "vocabulaire médical (traiter/traitement)", pattern: /\btraite(?:r|ment(?:s)?|nt)?\b/gi },
  { rule: "vocabulaire médical (diagnostic)", pattern: /\bdiagnosti\w*/gi },
  { rule: "vocabulaire médical (prescription)", pattern: /\bprescri\w*/gi },
  { rule: "vocabulaire médical (médicament)", pattern: /\bm[ée]dicament\w*/gi },
  { rule: "allégation sur une pathologie", pattern: /\b(cancer|d[ée]pression|diab[èe]te|arthrose|fibromyalgie|maladie chronique)\b/gi },
  { rule: "promesse de résultat", pattern: /r[ée]sultats?\s+garanti\w*/gi },
  { rule: "promesse de résultat", pattern: /100\s*%\s*(efficace|garanti\w*|satisfait\w*)/gi },
  { rule: "allégation d'efficacité", pattern: /\befficace contre\b/gi },
  { rule: "promesse excessive", pattern: /\bmiracul\w*|\bmiracle\b/gi },
  { rule: "négation du risque", pattern: /\bsans (aucun )?danger\b|\baucun risque\b/gi },
  { rule: "substitution à la médecine", pattern: /remplace\s+(un|le|votre)\s+(m[ée]decin|avis m[ée]dical|suivi m[ée]dical)/gi },
];

/**
 * Formulations recommandées à la place (utilisées dans les prompts) :
 * « accompagner », « favoriser la détente », « contribuer au bien-être »,
 * « moment de relâchement », « ne se substitue pas à un avis médical ».
 */
export const ETHICAL_PROMPT_RULES = `RÈGLES DE MARKETING ÉTHIQUE (obligation légale, aucune exception) :
- Aucune promesse de guérison, aucun vocabulaire médical (soigner, traiter, diagnostic, prescription, médicament).
- Ne jamais mentionner de pathologie (cancer, dépression, diabète, arthrose, fibromyalgie…).
- Aucune promesse de résultat (« résultats garantis », « 100 % efficace », « efficace contre »).
- Employer un vocabulaire de bien-être : accompagner, favoriser la détente, contribuer à l'équilibre, moment de relâchement.
- Préciser lorsque pertinent que la pratique ne se substitue pas à un avis médical ni à un suivi par un professionnel de santé (sans employer les mots interdits ci-dessus).`;

export function checkEthicalCompliance(text: string): {
  ok: boolean;
  violations: GuardrailViolation[];
} {
  const violations: GuardrailViolation[] = [];
  for (const { rule, pattern } of FORBIDDEN_PATTERNS) {
    // Regex avec flag g : réinitialiser lastIndex avant chaque usage
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      violations.push({ rule, excerpt: `…${text.slice(start, end)}…` });
      if (violations.length > 20) return { ok: false, violations };
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Vérifie récursivement toutes les chaînes d'une structure générée. */
export function checkEthicalComplianceDeep(value: unknown): {
  ok: boolean;
  violations: GuardrailViolation[];
} {
  const texts: string[] = [];
  collectStrings(value, texts);
  return checkEthicalCompliance(texts.join("\n"));
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}
