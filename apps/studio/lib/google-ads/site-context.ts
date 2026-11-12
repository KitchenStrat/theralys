/**
 * Les deux sites d'un praticien tels que les sections Google Ads et Meta Ads
 * en ont besoin : le site Harmony (toujours) et son propre site quand il est
 * la référence des outils aujourd'hui. Sert à rattacher chaque analyse au
 * site pour lequel elle a été préparée (`analysis-site.ts`) et à dire ce que
 * la dernière lecture du site du client a relevé (`external-tracking.ts`).
 *
 * La référence est décidée comme dans les services d'analyse
 * (`adsReferenceOf`), et les pages d'atterrissage sont construites avec les
 * mêmes fonctions qu'eux (`onlineMotifPages`, `landingPagesFrom`,
 * `externalAdsSite`) : le studio affiche exactement les pages entre
 * lesquelles une analyse a pu choisir.
 */

import { and, eq } from "drizzle-orm";
import { getDb, pages, type Site } from "@theralys/db";
import { adsReferenceOf, externalAdsSite, landingPagesFrom, onlineMotifPages, type ExternalReference } from "@theralys/jobs";
import type { LandingPageRef, PageSections } from "@theralys/shared";
import { publicSiteUrl, siteUrl } from "../data";
import type { AdsSiteSources } from "./analysis-site";
import { externalSiteTracking, type ExternalSiteTracking } from "./external-tracking";

export type AdsSiteContext = {
  sources: AdsSiteSources;
  /** Site du client quand il est la référence aujourd'hui : relevé de sa dernière lecture ; `null` : les outils s'appuient sur le site Harmony */
  externalTracking: ExternalSiteTracking | null;
};

/** Page de spécialité du site Harmony, telle que lue pour savoir si elle est en ligne. */
export type HostedMotifRow = { slug: string; title: string; sections: PageSections; position: number };

/** Adresse telle qu'on l'affiche à côté des chemins : sans protocole ni barre finale. */
export function siteDomainOf(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Seuls le chemin et l'identifiant de spécialité servent à reconnaître un chemin enregistré : le reste ne part pas vers le navigateur. */
function pageRefs(landingPages: readonly LandingPageRef[]): LandingPageRef[] {
  return landingPages.map((page) => (page.slug ? { path: page.path, slug: page.slug } : { path: page.path }));
}

/**
 * Contexte des deux sites à partir de ce qui a été lu (fonction pure, testée
 * sans base). `hostedUrl` : adresse du site Harmony (`siteUrl`).
 * `referenceUrl` : adresse de référence (`publicSiteUrl`), celle du site du
 * client quand `reference` n'est pas `null`. `motifRows` : pages de
 * spécialité du site Harmony, dont ne sont gardées que celles en ligne.
 */
export function adsSiteContextFrom(input: {
  site: Pick<Site, "type" | "plan" | "theme">;
  hostedUrl: string;
  referenceUrl: string;
  motifRows: HostedMotifRow[];
  reference: ExternalReference | null;
}): AdsSiteContext {
  const hosted = { domain: siteDomainOf(input.hostedUrl), pages: pageRefs(landingPagesFrom(onlineMotifPages(input.motifRows, input.site))) };
  if (!input.reference) return { sources: { hosted, external: null }, externalTracking: null };
  const domain = siteDomainOf(input.referenceUrl);
  return {
    sources: { hosted, external: { domain, pages: pageRefs(externalAdsSite(input.reference).landingPages) } },
    externalTracking: externalSiteTracking(domain, input.reference.facts),
  };
}

/**
 * Lit les deux sites d'un praticien. Sans site du client actif, une seule
 * requête (les pages de spécialité du site Harmony) : la référence n'est lue
 * en base que si le réglage du site la dit active.
 */
export async function loadAdsSiteContext(site: Site): Promise<AdsSiteContext> {
  const db = getDb();
  const [reference, motifRows] = await Promise.all([
    adsReferenceOf(db, site),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, site.id), eq(pages.type, "motif")),
      columns: { slug: true, title: true, sections: true, position: true },
    }),
  ]);
  return adsSiteContextFrom({ site, hostedUrl: siteUrl(site), referenceUrl: publicSiteUrl(site), motifRows, reference });
}
