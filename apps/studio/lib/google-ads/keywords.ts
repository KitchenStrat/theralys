/**
 * Helpers d'affichage de l'onglet « Mots-clés » : exemple de requête « sans
 * ville » (dont le volume est national) pour l'encadré pédagogique.
 */

import { normalizeAdsText, type GoogleAdsKeywordSet } from "@theralys/shared";

/** « sophrologie paris » et « sophrologie paris avis » mentionnent la ville ; « sophrologie » et « sophrologue près de chez moi » non. */
export function mentionsCity(text: string, city: string): boolean {
  const cityNorm = normalizeAdsText(city).trim();
  if (cityNorm === "") return false;
  const padded = ` ${normalizeAdsText(text).trim()} `;
  return padded.includes(` ${cityNorm} `);
}

/**
 * Première graine sans la ville, sinon premier mot-clé du groupe « Autour du
 * cabinet » sans la ville, sinon null (pas d'exemple affiché). Les graines
 * commencent par « métier ville » : la deuxième peut encore contenir la ville
 * (synonyme du métier), d'où la recherche explicite.
 */
export function nationalQueryExample(keywords: Pick<GoogleAdsKeywordSet, "seeds" | "groups">, city: string): string | null {
  const seed = keywords.seeds.find((s) => s.trim() !== "" && !mentionsCity(s, city));
  if (seed) return seed;
  const proximity = keywords.groups.find((g) => g.intent === "proximite");
  return proximity?.keywords.find((k) => k.trim() !== "" && !mentionsCity(k, city)) ?? null;
}
