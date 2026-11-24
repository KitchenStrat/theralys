import type { Metadata } from "next";

/**
 * Adresse publique de la vitrine et petites aides partagées par ses pages de
 * contenu (blog, pages par métier) : adresses absolues, fil d'Ariane,
 * données structurées.
 */

/** L'adresse officielle : le `www` (l'apex y redirige). */
export const SITE_URL = "https://www.harmony-web.fr";
export const SITE_NAME = "Harmony";

export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export type Crumb = { label: string; href: string };

/** Fil d'Ariane en données structurées (schema.org `BreadcrumbList`). */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.label, item: absoluteUrl(crumb.href) })),
  };
}

/** Questions fréquentes en données structurées (schema.org `FAQPage`). */
export function faqJsonLd(faq: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: plainText(item.a) } })),
  };
}

/** L'éditeur de la page, tel que les moteurs le lisent. */
export const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon.svg`,
  description: "La solution digitale tout-en-un des thérapeutes et des praticiens du bien-être : site internet, blog, fiche Google, réseaux sociaux et publicité.",
};

/** Texte sans les marques de mise en forme des contenus (`**gras**`, `[lien](/adresse)`). */
export function plainText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/** Identifiant d'ancre d'un titre : minuscules sans accent, tirets. */
export function anchorId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** « 24 novembre 2026 » pour une date `AAAA-MM-JJ`. */
export function longDate(isoDay: string): string {
  return DATE.format(new Date(`${isoDay}T12:00:00Z`));
}

/** Le site, tel que les moteurs le lisent. */
export const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "fr-FR",
  publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
};

/**
 * Titre, description, adresse canonique et aperçu de partage d'une page de
 * contenu. Chaque page porte les siens : sans cela, elle hériterait de ceux de
 * l'accueil.
 */
export function pageMetadata({ title, description, path, article }: { title: string; description: string; path: string; article?: { published: string; updated?: string; section?: string } }): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const shared = { title: fullTitle, description, url: path, siteName: SITE_NAME, locale: "fr_FR" };
  return {
    title: fullTitle,
    description,
    alternates: { canonical: path },
    openGraph: article
      ? { ...shared, type: "article", publishedTime: article.published, modifiedTime: article.updated ?? article.published, section: article.section }
      : { ...shared, type: "website" },
  };
}
