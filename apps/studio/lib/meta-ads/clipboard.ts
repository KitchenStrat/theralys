/**
 * Mise en forme pour le presse-papiers et les fichiers texte des annonces
 * Meta : textes d'une créa (texte principal, titre, description, bouton,
 * page d'atterrissage, texte alternatif), script d'une vidéo (accroche,
 * temps forts seconde par seconde, texte à coller). Fonctions pures.
 */

import { META_ADS_CTAS, type MetaAdCreative, type MetaAdsCta, type MetaVideoBrief } from "@theralys/shared";

/** Libellé du bouton d'action (« Réserver », « En savoir plus »…). */
export function ctaLabel(cta: MetaAdsCta): string {
  return META_ADS_CTAS.find((c) => c.id === cta)?.label ?? cta;
}

/** Lignes de texte : une par ligne, espaces repliés, vides retirées, dédoublonnées sans tenir compte de la casse. */
export function formatMetaLines(lines: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    const key = line.toLowerCase();
    if (line === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

/** URL publique de la page d'atterrissage (« https://domaine/<slug> »). */
export function landingUrl(siteDomain: string, landingPath: string): string {
  const domain = siteDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const path = landingPath.startsWith("/") ? landingPath : `/${landingPath}`;
  return `https://${domain}${path === "/" ? "" : path}`;
}

/**
 * Fichier texte d'une créa (kit et bouton « Copier tous les textes ») :
 * texte principal, titre, description, bouton, page d'atterrissage, texte
 * alternatif — dans l'ordre des champs du Gestionnaire de publicités.
 */
export function metaCreativeTxt(creative: MetaAdCreative, siteDomain: string): string {
  const parts = [
    `=== Texte principal ===\n${creative.primaryText.trim()}`,
    `=== Titre ===\n${creative.headline.trim()}`,
    ...(creative.description.trim() !== "" ? [`=== Description ===\n${creative.description.trim()}`] : []),
    `=== Bouton ===\n${ctaLabel(creative.cta)}`,
    `=== Page d'atterrissage ===\n${landingUrl(siteDomain, creative.landingPath)}`,
    ...(creative.altText.trim() !== "" ? [`=== Texte alternatif ===\n${creative.altText.trim()}`] : []),
  ];
  return `${parts.join("\n\n")}\n`;
}

/** Script d'une vidéo à tourner : accroche, temps forts (seconde, à dire, à l'écran, plan), bouton, texte à coller. */
export function metaVideoScriptTxt(video: MetaVideoBrief): string {
  const beats = video.beats.map((b) => `${String(b.at).padStart(2, "0")} s — ${b.say.trim()}\n   À l'écran : ${b.onScreen.trim()}\n   Plan : ${b.shot.trim()}`);
  const parts = [
    `=== ${video.title.trim()} (${video.durationSeconds} s, ${video.format}) ===\n${video.goal.trim()}`,
    `=== Accroche (3 premières secondes) ===\n${video.hook.trim()}`,
    `=== Temps forts ===\n${beats.join("\n")}`,
    `=== Bouton ===\n${ctaLabel(video.cta)}`,
    `=== Texte à coller ===\n${video.caption.trim()}`,
  ];
  return `${parts.join("\n\n")}\n`;
}
