/**
 * Mise en forme pour le presse-papiers et les fichiers texte des annonces
 * Meta : textes d'une créa (texte principal, titre, description, bouton,
 * page d'atterrissage, texte alternatif), script d'une vidéo (accroche,
 * temps forts seconde par seconde, texte à coller). Fonctions pures.
 */

import { META_ADS_CTAS, META_ADS_LANDING_SUFFIX, type MetaAdCreative, type MetaAdsCta, type MetaAdsPlan, type MetaVideoBrief } from "@theralys/shared";
import { landingPathOf, type AnalysisSite } from "../google-ads/analysis-site";

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

/**
 * Suffixe à ajouter aux adresses d'atterrissage des annonces d'une analyse.
 * C'est le plan qui le dit (`campaign.landingSuffix`) : le site Harmony lit
 * `?src=meta` (`SOCIAL_SOURCE_PARAMS.meta` → source `meta_ads`) et rattache
 * visites, clics RDV et appels aux annonces ; pour le site du client le plan
 * n'en porte pas, la mesure installée sur ce site ne lisant aucun paramètre
 * d'adresse — l'adresse reste alors telle quelle.
 *
 * Quand le plan ne dit rien (plan absent, ou enregistré avant ce champ), le
 * site de l'analyse décide : le suffixe habituel pour le site Harmony, où il
 * a toujours été ajouté, aucun pour le site du client (`externalSite`).
 */
export function metaLandingSuffix(plan: Pick<MetaAdsPlan, "campaign"> | null | undefined, externalSite: boolean): string {
  const said = plan?.campaign.landingSuffix;
  if (typeof said === "string") return said;
  return externalSite ? "" : META_ADS_LANDING_SUFFIX;
}

/**
 * URL publique d'une page d'atterrissage (« https://domaine/chemin »), suivie
 * du suffixe de provenance quand il y en a un (« ?src=meta », accolé par
 * « & » si la page porte déjà des paramètres). Suffixe vide : adresse nue.
 */
export function landingUrl(siteDomain: string, landingPath: string, suffix: string): string {
  const domain = siteDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const path = landingPath.startsWith("/") ? landingPath : `/${landingPath}`;
  const url = `https://${domain}${path}`;
  const params = suffix.trim().replace(/^[?&]+/, "");
  return params === "" ? url : `${url}${url.includes("?") ? "&" : "?"}${params}`;
}

/** Ce qu'il faut pour composer les adresses d'atterrissage d'une analyse : son site et le suffixe que dit son plan. */
export type MetaLanding = {
  /** Site pour lequel l'analyse a été préparée (adresse et pages d'atterrissage actuelles) */
  site: Pick<AnalysisSite, "domain" | "pages">;
  /** Suffixe de provenance (`metaLandingSuffix`), vide pour une adresse nue */
  suffix: string;
};

/**
 * Adresse à coller dans une annonce pour un chemin enregistré : le chemin
 * est ramené à la page actuelle du site de l'analyse (les créas d'avant la
 * correction portent « /<slug> », servi sous « /motifs/<slug> »), puis
 * accolé à l'adresse de ce même site. `null` quand cette adresse n'est plus
 * connue : aucune adresse n'est alors composée avec le domaine d'un autre site.
 */
export function metaLandingUrl(landing: MetaLanding, storedPath: string): string | null {
  if (landing.site.domain === null) return null;
  return landingUrl(landing.site.domain, landingPathOf(landing.site, storedPath), landing.suffix);
}

/** Une page d'atterrissage et les créas qui y mènent. */
export type MetaLandingPage = { url: string; creativeNames: string[] };

/**
 * Pages d'atterrissage d'un jeu de créas, dans l'ordre des créas,
 * dédoublonnées sur l'adresse réellement composée : deux créas enregistrées
 * avec « /sommeil » et « /motifs/sommeil » mènent à la même page. Vide quand
 * l'adresse du site de l'analyse n'est plus connue.
 */
export function metaLandingPages(landing: MetaLanding, creatives: readonly Pick<MetaAdCreative, "name" | "landingPath">[]): MetaLandingPage[] {
  const pages = new Map<string, MetaLandingPage>();
  for (const creative of creatives) {
    const url = metaLandingUrl(landing, creative.landingPath);
    if (url === null) continue;
    const page = pages.get(url) ?? { url, creativeNames: [] };
    page.creativeNames.push(creative.name);
    pages.set(url, page);
  }
  return [...pages.values()];
}

/**
 * Fichier texte d'une créa (kit et bouton « Copier tous les textes ») :
 * texte principal, titre, description, bouton, page d'atterrissage, texte
 * alternatif — dans l'ordre des champs du Gestionnaire de publicités. La page
 * d'atterrissage est omise quand son adresse ne peut pas être composée.
 */
export function metaCreativeTxt(creative: MetaAdCreative, landing: MetaLanding): string {
  const url = metaLandingUrl(landing, creative.landingPath);
  const parts = [
    `=== Texte principal ===\n${creative.primaryText.trim()}`,
    `=== Titre ===\n${creative.headline.trim()}`,
    ...(creative.description.trim() !== "" ? [`=== Description ===\n${creative.description.trim()}`] : []),
    `=== Bouton ===\n${ctaLabel(creative.cta)}`,
    ...(url !== null ? [`=== Page d'atterrissage ===\n${url}`] : []),
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
