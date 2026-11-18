import { PROFESSION_CATEGORIES } from "@theralys/shared";
import { fold } from "./normalize";

/**
 * Métier de la liste qui correspond à celui d'une fiche du CRM. La liste nomme
 * des disciplines (« Ostéopathie »), les fichiers de prospects des praticiens
 * (« Ostéopathe ») : à défaut d'égalité, on rapproche par le radical du mot.
 * Chaîne vide quand rien ne correspond : le métier reste à choisir.
 */
export function matchProfession(profession: string): string {
  const wanted = fold(profession);
  if (!wanted) return "";
  const all = PROFESSION_CATEGORIES.flatMap((category) => category.professions);
  const exact = all.find((entry) => fold(entry) === wanted);
  if (exact) return exact;
  const word = wanted.split(" ")[0] ?? "";
  const stem = word.slice(0, -4);
  return stem.length >= 6 ? (all.find((entry) => fold(entry).startsWith(stem)) ?? "") : "";
}
