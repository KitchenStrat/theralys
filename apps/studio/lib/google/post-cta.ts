/**
 * Bouton d'action d'un post Google tel qu'il est remis au praticien (modale,
 * fichier texte) — à distinguer de celui qui est enregistré avec le post.
 *
 * Un post garde le bouton avec lequel il a été préparé. Deux cas où ce bouton
 * ne doit pas être remis tel quel :
 *
 * 1. Adresse relative. Les posts préparés avant la correction du générateur
 *    portent, pour un article, son chemin dans le studio
 *    (« /publications/<id> ») : ni le praticien ni un visiteur de sa fiche
 *    n'en feraient rien. On remet à la place l'adresse publique de l'article
 *    sur le blog hébergé s'il est en ligne, sinon le lien de rendez-vous,
 *    sinon l'adresse de référence du site — ce que le générateur corrigé
 *    aurait choisi (`chooseGoogleCta`, `@theralys/ai`). Une adresse relative
 *    n'est jamais montrée ni exportée, que le post soit publié ou non.
 *
 * 2. Site hébergé mis en retrait. Un post préparé avant que le site du client
 *    ne devienne la référence renvoie « En savoir plus » vers le site
 *    hébergé : tant qu'il n'est pas publié, on remet l'adresse de référence —
 *    sinon le praticien collerait sur sa fiche l'adresse d'un site qu'il a mis
 *    en retrait. Ne changent pas : le lien de rendez-vous, le lien d'un
 *    article (les articles vivent sur le blog hébergé) et le bouton d'un post
 *    déjà publié (il dit ce qui a été mis en ligne). Sans site du client en
 *    référence, les deux adresses sont égales : rien ne change.
 *
 * Fonctions pures, testées sans base, utilisables côté navigateur ; les
 * lectures (site, articles) sont faites par l'appelant (`lib/google/posts.ts`).
 */

import type { GooglePostContent } from "@theralys/shared";

type GoogleCta = GooglePostContent["cta"];

/** Ce dont dépend le bouton d'action d'un post au moment où il est remis au praticien. */
export type GooglePostDelivery = {
  /** Adresse du site hébergé (`siteUrl(site)`) : c'est sur son blog que vivent les articles */
  hostedUrl: string;
  /** Adresse de référence (`publicSiteUrl(site)`) : celle du site du client s'il est la référence, sinon la même que `hostedUrl` */
  referenceUrl: string;
  /** Lien de prise de rendez-vous du site (adresse web ou `tel:`), s'il existe */
  bookingUrl: string | null;
  /** Articles du blog en ligne, par identifiant : leur `slug` (seuls ceux que citent des posts sont nécessaires) */
  onlineArticles: ReadonlyMap<string, string>;
};

/**
 * L'adresse est-elle relative (sans protocole) ? `/publications/<id>`,
 * `#contact`, `//hôte/chemin`… Une adresse web absolue, `tel:` ou `mailto:`
 * ne l'est pas. Vide ou absente : rien à montrer, donc pas « relative ».
 */
export function isRelativeAddress(url: string | null | undefined): boolean {
  const value = url?.trim() ?? "";
  return value !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

const STUDIO_ARTICLE_PATH_RE = /^\/publications\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;

/** Identifiant de l'article que désigne un chemin du studio (« /publications/<id> »), sinon `null`. */
export function studioArticleId(url: string | null | undefined): string | null {
  return STUDIO_ARTICLE_PATH_RE.exec(url?.trim() ?? "")?.[1]?.toLowerCase() ?? null;
}

/**
 * Un article est-il en ligne ? Publié, et sa date de publication passée —
 * la même règle que le brief (`buildSocialBrief`), qui ne donne l'adresse
 * publique d'un article qu'à cette condition.
 */
export function isArticleOnline(article: { status: string; publishAt: Date | null }, now: Date): boolean {
  return article.status === "published" && (article.publishAt === null || article.publishAt.getTime() <= now.getTime());
}

const withoutTrailingSlash = (url: string): string => url.trim().replace(/\/+$/, "");

/** Bouton d'action à remettre au praticien pour ce post (cf. l'en-tête du module). Rendu tel quel quand rien n'est à corriger. */
export function deliveredGoogleCta(post: { status: string; content: { cta: GoogleCta } }, delivery: GooglePostDelivery): GoogleCta {
  const { cta } = post.content;
  const url = cta.url?.trim() ?? "";
  if (cta.type === "NONE" || url === "") return cta;

  if (isRelativeAddress(url)) {
    const articleId = studioArticleId(url);
    const slug = articleId ? delivery.onlineArticles.get(articleId) : undefined;
    if (slug) return { type: "LEARN_MORE", url: `${withoutTrailingSlash(delivery.hostedUrl)}/blog/${slug}` };
    const booking = delivery.bookingUrl?.trim() ?? "";
    if (booking !== "" && !isRelativeAddress(booking)) return { type: /^tel:/i.test(booking) ? "CALL" : "BOOK", url: booking };
    return { type: "LEARN_MORE", url: delivery.referenceUrl };
  }

  const hosted = withoutTrailingSlash(delivery.hostedUrl);
  const pointsToHostedSite = cta.type === "LEARN_MORE" && withoutTrailingSlash(url) === hosted;
  if (post.status !== "published" && pointsToHostedSite && withoutTrailingSlash(delivery.referenceUrl) !== hosted) {
    return { ...cta, url: delivery.referenceUrl };
  }
  return cta;
}

/** Contenu d'un post tel qu'il est remis au praticien : le même, avec le bouton d'action de `deliveredGoogleCta`. */
export function deliveredGoogleContent(post: { status: string; content: GooglePostContent }, delivery: GooglePostDelivery): GooglePostContent {
  const cta = deliveredGoogleCta(post, delivery);
  return cta === post.content.cta ? post.content : { ...post.content, cta };
}
