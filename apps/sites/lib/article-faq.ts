/**
 * Extraction de la section « ## Questions fréquentes » du markdown d'un
 * article (structure éditoriale imposée) pour la rendre en accordéons.
 * Si la section est absente ou mal formée, l'article est rendu tel quel.
 */
export function splitArticleFaq(content: string): {
  body: string;
  faq: { question: string; answer: string }[];
} {
  const parts = content.split(/^##\s+Questions fréquentes\s*$/im);
  if (parts.length < 2) return { body: content, faq: [] };

  const body = parts[0]!.trimEnd();
  // Découpe sur les lignes-questions en gras : **Question ?**
  const chunks = parts.slice(1).join("\n").split(/^\*\*(.+?)\*\*\s*$/m);
  const faq: { question: string; answer: string }[] = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const question = chunks[i]!.trim();
    const answer = (chunks[i + 1] ?? "").trim();
    if (question && answer) faq.push({ question, answer });
  }
  return faq.length > 0 ? { body, faq } : { body: content, faq: [] };
}
