/**
 * Site auquel se rapporte une analyse publicitaire (Google Ads et Meta Ads).
 *
 * Une analyse enregistre son bilan, et `diagnostic.externalSite` dit pour
 * quel site il a été établi : le site du client (que Harmony n'héberge pas)
 * ou le site Harmony. Tout ce qui est affiché ou exporté pour cette analyse —
 * domaine à côté des chemins, adresses d'atterrissage, liens annexes, kit des
 * créas — parle de ce site-là, même si le praticien a connecté ou retiré son
 * site depuis : l'adresse d'un site n'est jamais accolée aux chemins de
 * l'autre. Quand les deux ne correspondent plus, la section le dit et invite
 * à relancer l'analyse.
 *
 * Module pur (aucun accès à la base) : partagé par les composants client, la
 * route du kit et les tests. Le chargement vit dans `site-context.ts`.
 */

import { normalizeLandingPath, type LandingPageRef } from "@theralys/shared";

/** `hosted` : le site Harmony · `external` : le site du client, quand il est (ou était) la référence des outils. */
export type AdsSiteMode = "hosted" | "external";

/** Un site tel que les annonces le voient : son adresse sans protocole et ses pages d'atterrissage actuelles. */
export type AdsSiteAddress = {
  /** Adresse sans protocole ni barre finale (« www.mon-cabinet.fr », « demo.harmony-web.fr/claire ») */
  domain: string;
  /** Accueil puis pages de spécialité, en chemins relatifs à cette adresse */
  pages: LandingPageRef[];
};

/** Les deux sites possibles d'un praticien, tels qu'ils sont aujourd'hui. */
export type AdsSiteSources = {
  /** Site Harmony : il existe toujours */
  hosted: AdsSiteAddress;
  /** Site du client quand il est la référence des outils aujourd'hui, sinon `null` */
  external: AdsSiteAddress | null;
};

/** Site de l'analyse affichée. */
export type AnalysisSite = {
  /** Site pour lequel le bilan de l'analyse a été établi (sans analyse : celui sur lequel les outils s'appuient) */
  mode: AdsSiteMode;
  /**
   * Adresse de ce site, sans protocole. `null` : l'analyse parle du site du
   * client et il n'est plus la référence — son adresse et ses pages ne sont
   * plus connues, aucune adresse d'atterrissage n'est alors composée.
   */
  domain: string | null;
  /** Pages d'atterrissage actuelles de ce site (vide quand `domain` est `null`) */
  pages: LandingPageRef[];
  /** L'analyse a été préparée pour un autre site que celui sur lequel les outils s'appuient aujourd'hui */
  outdated: boolean;
};

/** Site sur lequel les outils s'appuient aujourd'hui : celui pour lequel une nouvelle analyse serait préparée. */
export function currentSiteMode(sources: AdsSiteSources): AdsSiteMode {
  return sources.external ? "external" : "hosted";
}

/**
 * Site d'une analyse d'après son bilan (`null` : aucune analyse aboutie, le
 * site du moment est retenu). Le drapeau `externalSite` du bilan décide,
 * jamais le réglage du moment : c'est ce qui garde ensemble l'adresse et les
 * chemins d'un même site.
 */
export function analysisSiteOf(diagnostic: { externalSite?: boolean } | null | undefined, sources: AdsSiteSources): AnalysisSite {
  const current = currentSiteMode(sources);
  const mode: AdsSiteMode = diagnostic ? (diagnostic.externalSite === true ? "external" : "hosted") : current;
  if (mode === "hosted") return { mode, domain: sources.hosted.domain, pages: sources.hosted.pages, outdated: current !== "hosted" };
  if (sources.external) return { mode, domain: sources.external.domain, pages: sources.external.pages, outdated: false };
  return { mode, domain: null, pages: [], outdated: true };
}

/**
 * Chemin d'atterrissage enregistré dans un plan → chemin actuel de la page
 * sur le site de l'analyse, l'accueil quand plus aucune page ne lui
 * correspond. Les plans enregistrés avant la correction du chemin des pages
 * de spécialité portent « /<slug> » : ils sont rendus en « /motifs/<slug> »,
 * l'adresse qui fonctionne.
 */
export function landingPathOf(site: Pick<AnalysisSite, "pages">, storedPath: string): string {
  return normalizeLandingPath(storedPath, site.pages) ?? "/";
}

/** Adresse d'une page d'atterrissage telle qu'on l'affiche (« www.mon-cabinet.fr/sommeil »), `null` si l'adresse du site de l'analyse n'est plus connue. */
export function landingDisplay(site: Pick<AnalysisSite, "domain" | "pages">, storedPath: string): string | null {
  return site.domain === null ? null : `${site.domain}${landingPathOf(site, storedPath)}`;
}

/** Adresse complète d'une page d'atterrissage (« https://… »), à copier dans le compte publicitaire ; `null` si l'adresse du site de l'analyse n'est plus connue. */
export function landingHref(site: Pick<AnalysisSite, "domain" | "pages">, storedPath: string): string | null {
  const display = landingDisplay(site, storedPath);
  return display === null ? null : `https://${display}`;
}

/** Ce qui est dit à la place d'une adresse d'atterrissage qui ne peut plus être composée. */
export const LANDING_UNAVAILABLE = "à retrouver en relançant l'analyse";

export type AnalysisSiteNotice = { title: string; detail: string };

/**
 * Avertissement de la section quand l'analyse affichée a été préparée pour
 * un autre site que celui sur lequel les outils s'appuient aujourd'hui (le
 * praticien a connecté ou retiré son site depuis) ; `null` sinon.
 * `subject` : ce que l'analyse a produit (« le diagnostic, le plan d'action
 * et les pages d'atterrissage »). `currentAddress` : adresse du site du
 * client quand il vient d'être connecté.
 */
export function analysisSiteNotice(site: Pick<AnalysisSite, "mode" | "outdated">, opts: { subject: string; currentAddress?: string | null }): AnalysisSiteNotice | null {
  if (!site.outdated) return null;
  if (site.mode === "hosted") {
    const address = opts.currentAddress?.trim();
    return {
      title: "Cette analyse a été préparée pour votre site Harmony.",
      detail: `Depuis, vos outils s'appuient sur votre propre site${address ? ` (${address})` : ""}. Relancez l'analyse pour que ${opts.subject} correspondent à ce site. En attendant, les adresses affichées ici restent celles de votre site Harmony.`,
    };
  }
  return {
    title: "Cette analyse a été préparée pour votre propre site.",
    detail: `Depuis, vos outils ne s'appuient plus sur ce site. Relancez l'analyse pour que ${opts.subject} correspondent à votre site Harmony. En attendant, les adresses des pages d'atterrissage ne sont pas affichées.`,
  };
}
