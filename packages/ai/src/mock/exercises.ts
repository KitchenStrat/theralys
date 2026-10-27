/**
 * Exercice « conseil » du mode mock, propre à chaque famille de pratique :
 * partagé par les articles mock (`mockVoicedArticle`, section « Un exercice
 * à essayer maintenant ») et par le pilier « conseil » des contenus sociaux,
 * pour qu'un sophrologue et un hypnothérapeute ne proposent pas le même
 * exercice respiratoire.
 */

import type { BlogVoice } from "../voice";

export type PracticeFamily =
  | "sophrologie"
  | "hypnose"
  | "naturopathie"
  | "massage"
  | "osteopathie"
  | "reflexologie"
  | "reiki"
  | "autre";

/** Famille de pratique d'un métier saisi librement (même heuristique que `resolveProfession`). */
export function practiceFamily(profession: string): PracticeFamily {
  const p = profession
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (p.includes("sophro")) return "sophrologie";
  if (p.includes("hypno")) return "hypnose";
  if (p.includes("naturo")) return "naturopathie";
  if (p.includes("mass")) return "massage";
  if (p.includes("osteo")) return "osteopathie";
  if (p.includes("reflexo")) return "reflexologie";
  if (p.includes("reiki")) return "reiki";
  return "autre";
}

export type MockExercise = {
  /** « la respiration abdominale » (avec article) */
  name: string;
  /** Phrase d'introduction, terminée par « : » */
  intro: string;
  /** 5 à 6 étapes, accordées au lecteur */
  steps: string[];
};

/**
 * Exercice selon la famille de pratique : sophrologie → respiration
 * abdominale 4-6 ; hypnose → ancrage sensoriel 5-4-3-2-1 ; naturopathie →
 * pause hydratation et marche ; autres pratiques → respiration 4-2-6.
 */
export function exerciseFor(profession: string, voice: Pick<BlogVoice, "reader">): MockExercise {
  const r = (vous: string, tu: string) => (voice.reader === "vous" ? vous : tu);
  switch (practiceFamily(profession)) {
    case "sophrologie":
      return {
        name: "la respiration abdominale",
        intro: "Voici un exercice de respiration abdominale, à faire assis ou debout, en trois minutes :",
        steps: [
          `${r("Asseyez-vous", "Assieds-toi")} confortablement, pieds à plat sur le sol.`,
          `${r("Posez", "Pose")} une main sur le ventre, l'autre sur la poitrine.`,
          `${r("Inspirez", "Inspire")} par le nez pendant 4 secondes, en laissant le ventre se gonfler.`,
          `${r("Expirez", "Expire")} lentement par la bouche pendant 6 secondes, le ventre se relâche.`,
          `${r("Répétez", "Répète")} 6 fois, en laissant les épaules descendre à chaque expiration.`,
        ],
      };
    case "hypnose":
      return {
        name: "l'ancrage sensoriel 5-4-3-2-1",
        intro: "Voici un exercice d'ancrage sensoriel, pour revenir à l'instant présent en quelques minutes :",
        steps: [
          `${r("Installez-vous", "Installe-toi")} confortablement, puis ${r("prenez", "prends")} une grande inspiration.`,
          `${r("Nommez", "Nomme")} 5 choses que ${r("vous voyez", "tu vois")} autour de ${r("vous", "toi")}.`,
          `${r("Repérez", "Repère")} 4 choses que ${r("vous pouvez", "tu peux")} toucher, et ${r("sentez", "sens")} leur texture.`,
          `${r("Écoutez", "Écoute")} 3 sons, proches ou lointains.`,
          `${r("Identifiez", "Identifie")} 2 odeurs, puis 1 goût dans la bouche.`,
          `${r("Terminez", "Termine")} par une expiration longue, et ${r("observez", "observe")} ce qui a changé.`,
        ],
      };
    case "naturopathie":
      return {
        name: "la pause hydratation et marche",
        intro: "Voici une pause toute simple, à glisser dans la journée dès que l'énergie baisse :",
        steps: [
          `${r("Buvez", "Bois")} un grand verre d'eau, lentement, sans rien faire d'autre.`,
          `${r("Sortez", "Sors")} marcher dix minutes, à ${r("votre", "ton")} rythme, idéalement à la lumière du jour.`,
          `${r("Respirez", "Respire")} amplement en regardant au loin, les épaules basses.`,
          `De retour, ${r("étirez-vous", "étire-toi")} une minute avant de reprendre.`,
          `${r("Répétez", "Répète")} cette pause une fois le matin et une fois l'après-midi.`,
        ],
      };
    default:
      return {
        name: "la respiration 4-2-6",
        intro: "Voici une technique simple pour amorcer un relâchement, en trois minutes :",
        steps: [
          `${r("Asseyez-vous", "Assieds-toi")} confortablement, pieds à plat sur le sol.`,
          `${r("Fermez", "Ferme")} les yeux et ${r("posez vos", "pose tes")} mains sur ${r("vos", "tes")} cuisses.`,
          `${r("Inspirez", "Inspire")} lentement par le nez pendant 4 secondes.`,
          `${r("Retenez", "Retiens")} l'air 2 secondes.`,
          `${r("Expirez", "Expire")} lentement par la bouche pendant 6 secondes.`,
          `${r("Répétez", "Répète")} 6 fois, en relâchant les épaules à chaque expiration.`,
        ],
      };
  }
}
