/**
 * Aides de grammaire française pour les textes assemblés par les mocks :
 * article défini devant un nom (heuristique de genre et de nombre), « de »
 * contracté ou élidé. Sans dictionnaire : des règles de terminaison qui
 * couvrent les titres de spécialités et de motifs du catalogue
 * (« gestion du stress », « sommeil », « accompagnement périnatal »,
 * « émotions »…).
 */

/** Groupe nominal qui porte déjà un déterminant : laissé tel quel. */
const DETERMINER_RE =
  /^(?:l['’]|(?:le|la|les|un|une|des|du|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces)\s)/iu;
const VOWEL_RE = /^[aeiouyàâäéèêëîïôöùûüœh]/iu;
/** Terminaisons presque toujours féminines (-tion, -té, -ie, -ure, -ance, -ence…). */
const FEMININE_ENDING_RE = /(?:tion|sion|té|ié|ie|ure|ance|ence|esse|ette|ade|tude|ose|ine|aison)$/iu;
/** Noms singuliers terminés par « s » ou « x » : jamais un pluriel. */
const SINGULAR_SX = new Set([
  "stress", "corps", "repos", "dos", "bras", "temps", "poids", "mois", "cours", "sens", "pas", "prix", "choix", "voix",
  "accès", "succès", "processus", "bonus", "focus", "souffle",
]);

function isPlural(word: string): boolean {
  return /[sx]$/u.test(word) && !/(?:ss|us|ès)$/u.test(word) && !SINGULAR_SX.has(word);
}

/**
 * Article défini devant un groupe nominal : « gestion du stress » → « la
 * gestion du stress », « sommeil » → « le sommeil », « accompagnement
 * périnatal » → « l'accompagnement périnatal », « émotions » → « les
 * émotions ». Une coordination est traitée membre à membre (« sommeil et
 * récupération » → « le sommeil et la récupération ») ; un groupe qui porte
 * déjà un déterminant est rendu tel quel. La casse est conservée.
 */
export function withArticle(noun: string): string {
  const text = noun.trim().replace(/\s+/g, " ");
  if (text === "" || DETERMINER_RE.test(text)) return text;
  const conj = text.indexOf(" et ");
  if (conj > 0 && conj + 4 < text.length) {
    return `${withArticle(text.slice(0, conj))} et ${withArticle(text.slice(conj + 4))}`;
  }
  const first = (text.split(" ")[0] ?? "").toLowerCase();
  if (isPlural(first)) return `les ${text}`;
  if (VOWEL_RE.test(first)) return `l'${text}`;
  return `${FEMININE_ENDING_RE.test(first) ? "la" : "le"} ${text}`;
}

/**
 * « de » + article contracté : « parlons … » → « du sommeil », « de la gestion
 * du stress », « de l'ancrage », « des émotions » ; une coordination est
 * contractée membre à membre (« du sommeil et de la récupération »).
 */
export function deArticle(noun: string): string {
  const text = withArticle(noun);
  const conj = text.indexOf(" et ");
  if (conj > 0 && conj + 4 < text.length) {
    return `${deArticle(text.slice(0, conj))} et ${deArticle(text.slice(conj + 4))}`;
  }
  if (/^le\s/iu.test(text)) return `du ${text.slice(3)}`;
  if (/^les\s/iu.test(text)) return `des ${text.slice(4)}`;
  return elideDe(text);
}

/** « de » élidé devant une voyelle : « parlons de … » → « parlons d'accompagnement ». */
export function elideDe(word: string): string {
  return VOWEL_RE.test(word) ? `d'${word}` : `de ${word}`;
}
