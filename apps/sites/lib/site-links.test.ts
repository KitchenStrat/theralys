import type { Page, Site } from "@theralys/db";
import { LEGAL_PAGES } from "@theralys/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { NAV_ANCHORS } from "./nav";
import { publicPathPrefix } from "./site-paths";

/**
 * Liens internes réellement rendus par l'en-tête et le pied de page, pour un
 * site servi sous son slug (hôte des démos) puis sur son propre domaine : le
 * défaut corrigé était un préfixe `/<domaine>` sur tous ces liens, qui
 * menaient à la page introuvable.
 */

const NOW = new Date("2026-11-12T10:00:00Z");

const site: Site = {
  id: "b6bed027-6656-4734-926f-501605751fdc",
  type: "client",
  status: "published",
  slug: "claire-dupont-sophrologue-albi",
  domain: "claire-sophrologie.fr",
  name: "Claire Dupont, sophrologue à Albi",
  plan: "scale",
  language: "fr",
  bookingUrl: "https://calendly.com/claire-dupont",
  theme: { preset: "sauge", fontPreset: "elegant" },
  prospectId: null,
  highlightedMotifs: [],
  demoExpiresAt: null,
  generationProgress: { home: true, motifs: true, reviews: true, articles: true },
  generationError: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const motifPage = (slug: string, title: string, position: number): Page => ({
  id: `00000000-0000-4000-8000-00000000000${position}`,
  siteId: site.id,
  type: "motif",
  slug,
  title,
  metaTitle: null,
  metaDescription: null,
  sections: [],
  position,
  createdAt: NOW,
  updatedAt: NOW,
});
const motifPages = [motifPage("gestion-du-stress", "Gestion du stress", 1), motifPage("sommeil", "Sommeil", 2)];

/** Liens internes (chemins et ancres) d'un rendu, dans l'ordre, sans doublon. */
const internalLinks = (html: string): string[] => [
  ...new Set([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "").filter((href) => !/^(https?:|tel:|mailto:)/.test(href))),
];

const header = (siteKey: string) =>
  internalLinks(
    renderToStaticMarkup(
      createElement(SiteHeader, { site, motifPages, prefix: publicPathPrefix(siteKey), anchors: [...NAV_ANCHORS], phone: "05 63 00 00 00" }),
    ),
  );
const footer = (siteKey: string) =>
  internalLinks(
    renderToStaticMarkup(createElement(SiteFooter, { site, motifPages, prefix: publicPathPrefix(siteKey), google: null, phone: "05 63 00 00 00" })),
  );

describe("en-tête — liens internes", () => {
  it("hôte des démos : tout part de /<slug>, comme avant", () => {
    expect(header("claire-dupont-sophrologue-albi")).toEqual([
      "/claire-dupont-sophrologue-albi",
      "/claire-dupont-sophrologue-albi/motifs/gestion-du-stress",
      "/claire-dupont-sophrologue-albi/motifs/sommeil",
      "/claire-dupont-sophrologue-albi#a-propos",
      "/claire-dupont-sophrologue-albi#avis",
      "/claire-dupont-sophrologue-albi#deroulement",
      "/claire-dupont-sophrologue-albi#questions",
      "/claire-dupont-sophrologue-albi#contact",
      "/claire-dupont-sophrologue-albi/blog",
    ]);
  });

  it("domaine du client : chemins à la racine, jamais préfixés par le domaine", () => {
    expect(header("claire-sophrologie.fr")).toEqual([
      "/",
      "/motifs/gestion-du-stress",
      "/motifs/sommeil",
      "/#a-propos",
      "/#avis",
      "/#deroulement",
      "/#questions",
      "/#contact",
      "/blog",
    ]);
  });
});

describe("pied de page — liens internes", () => {
  const legal = LEGAL_PAGES.map((page) => page.slug);

  it("hôte des démos : tout part de /<slug>, comme avant", () => {
    const prefix = "/claire-dupont-sophrologue-albi";
    expect(footer("claire-dupont-sophrologue-albi")).toEqual([
      prefix,
      `${prefix}/motifs/gestion-du-stress`,
      `${prefix}/motifs/sommeil`,
      `${prefix}/blog`,
      ...legal.map((slug) => `${prefix}/${slug}`),
    ]);
  });

  it("domaine du client : chemins à la racine, jamais préfixés par le domaine", () => {
    expect(footer("claire-sophrologie.fr")).toEqual(["/", "/motifs/gestion-du-stress", "/motifs/sommeil", "/blog", ...legal.map((slug) => `/${slug}`)]);
  });

  it("aucun lien vide : un lien vide désignerait la page en cours, pas l'accueil", () => {
    for (const links of [header("claire-sophrologie.fr"), footer("claire-sophrologie.fr"), header("claire"), footer("claire")]) {
      expect(links).not.toContain("");
      expect(links.every((href) => href.startsWith("/"))).toBe(true);
    }
  });
});
