import { describe, expect, it } from "vitest";
import { EXTERNAL_SITE_LIMITS, type ExternalSitePage } from "@theralys/shared";
import { pastedTextToPages } from "./index";
import { sha256Hex } from "./text";

const NOW = new Date("2026-11-12T09:30:00.000Z");
const URL_ = "https://www.mon-cabinet.fr";
const u = (code: number): string => String.fromCodePoint(code);

const SAMPLE = `Sophrologue à Nantes

Je suis Hélène Roux, sophrologue certifiée. J'accompagne adultes et adolescents dans la gestion du stress et les troubles du sommeil, au cabinet ou en visio.

Mes accompagnements
- Gestion du stress
- Sommeil
- Préparation aux examens

Tarifs :
Première séance : 70 €
Séance de suivi : 60 €

La sophrologie est-elle remboursée ?
Certaines mutuelles prennent en charge une partie des séances.

Contact
7 rue Crébillon, 44000 Nantes
02 61 91 23 45
bonjour@mon-cabinet.fr`;

describe("pastedTextToPages", () => {
  it("texte collé → une page de nature « home », à l'adresse du site, datée, avec son empreinte", () => {
    const pages = pastedTextToPages(SAMPLE, URL_, NOW);
    expect(pages).toHaveLength(1);
    const page = pages[0]!;
    expect(page).toMatchObject({ url: "https://www.mon-cabinet.fr/", kind: "home", title: "Sophrologue à Nantes", fetchedAt: "2026-11-12T09:30:00.000Z" });
    expect(page.hash).toBe(sha256Hex(page.text));
    expect(page).not.toHaveProperty("etag");
    expect(page).not.toHaveProperty("description");
    // Le texte est gardé ligne par ligne, sans lignes vides
    expect(page.text.split("\n").slice(0, 3)).toEqual(["Sophrologue à Nantes", "Je suis Hélène Roux, sophrologue certifiée. J'accompagne adultes et adolescents dans la gestion du stress et les troubles du sommeil, au cabinet ou en visio.", "Mes accompagnements"]);
    expect(page.text).not.toContain("\n\n");
  });

  it("intertitres devinés aux lignes courtes qui introduisent du texte — pas les puces, les prix ni les coordonnées", () => {
    const [page] = pastedTextToPages(SAMPLE, URL_, NOW);
    expect(page!.headings).toEqual(["Sophrologue à Nantes", "Mes accompagnements", "Tarifs", "La sophrologie est-elle remboursée ?", "Contact"]);
  });

  it("titres écrits en Markdown : reconnus, balisage retiré du texte", () => {
    const text = `# Hypnose à Lille\n\n${"Un accompagnement en douceur pour changer une habitude. ".repeat(6)}\n\n## Arrêt du tabac ##\n\n${"Une séance préparée avec soin. ".repeat(6)}`;
    const [page] = pastedTextToPages(text, URL_, NOW);
    expect(page!.headings).toEqual(["Hypnose à Lille", "Arrêt du tabac"]);
    expect(page!.title).toBe("Hypnose à Lille");
    expect(page!.text.split("\n")[0]).toBe("Hypnose à Lille");
    expect(page!.text).not.toContain("#");
  });

  it("sans ligne courte : aucun intertitre, le titre nomme le texte collé", () => {
    const [page] = pastedTextToPages("La sophrologie aide à retrouver le calme et le sommeil, séance après séance. ".repeat(8), URL_, NOW);
    expect(page!.headings).toEqual([]);
    expect(page!.title).toBe("Texte collé — www.mon-cabinet.fr");
  });

  it("trop court pour un profil : aucune page ; la borne compte le texte utile, pas les espaces ni les séparations", () => {
    expect(pastedTextToPages("", URL_, NOW)).toEqual([]);
    expect(pastedTextToPages("Bonjour, je suis sophrologue.", URL_, NOW)).toEqual([]);
    expect(pastedTextToPages(`${" ".repeat(500)}\n\n\n-----\n\n${"x".repeat(100)}`, URL_, NOW)).toEqual([]);
    const justEnough = "a".repeat(EXTERNAL_SITE_LIMITS.pastedMinChars);
    expect(pastedTextToPages(justEnough.slice(1), URL_, NOW)).toEqual([]);
    expect(pastedTextToPages(justEnough, URL_, NOW)).toHaveLength(1);
  });

  it("texte long : découpé en pages de la taille d'une page lue, de préférence entre deux paragraphes, sans rien perdre", () => {
    const paragraph = (n: number): string => `Paragraphe ${n} : ${"la séance commence par un temps d'échange. ".repeat(12)}`.trim();
    const paragraphs = Array.from({ length: 30 }, (_, i) => paragraph(i + 1));
    const pages = pastedTextToPages(paragraphs.join("\n\n"), URL_, NOW);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.text.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pageChars);
      expect(page.kind).toBe("home");
      expect(page.url).toBe("https://www.mon-cabinet.fr/");
      // Chaque page finit sur un paragraphe entier
      expect(page.text.endsWith("un temps d'échange.")).toBe(true);
    }
    expect(pages.flatMap((page) => page.text.split("\n"))).toEqual(paragraphs);
    expect(pages.map((page) => page.title)).toEqual(pages.map((_, index) => `Texte collé (${index + 1}/${pages.length})`));
    expect(new Set(pages.map((page) => page.hash)).size).toBe(pages.length);
  });

  it("au-delà de la borne haute : la suite est ignorée", () => {
    const line = "Une ligne de quatre-vingts caractères environ, répétée pour dépasser la borne haute.";
    const pages = pastedTextToPages(Array.from({ length: 1_000 }, () => line).join("\n"), URL_, NOW);
    const total = pages.reduce((sum, page) => sum + page.text.length + 1, 0);
    expect(total).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pastedMaxChars);
    expect(total).toBeGreaterThan(EXTERNAL_SITE_LIMITS.pastedMaxChars * 0.9);
    expect(pages.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.maxPages);
  });

  it("séparations tracées par le praticien : une page par partie", () => {
    const part = (title: string): string => `${title}\n\n${"Texte de cette page, assez long pour compter. ".repeat(5)}`;
    const pages = pastedTextToPages([part("Accueil"), part("À propos"), part("Mes tarifs")].join("\n\n-----\n\n"), URL_, NOW);
    expect(pages.map((page) => page.title)).toEqual(["Accueil", "À propos", "Mes tarifs"]);
    expect(pages.every((page) => !page.text.includes("---"))).toBe(true);
    expect(pastedTextToPages([part("Un"), part("Deux")].join("\n=====\n"), URL_, NOW)).toHaveLength(2);
  });

  it("balises, caractères invisibles et espaces superflus : retirés", () => {
    const dirty = `<h1>Mon   cabinet</h1>\r\n\r\n<p>Bienvenue${u(0x200b)} au <b>cabinet</b>.${u(0xa0)}Les séances durent une heure.</p>\r\n<script>alert(1)</script>${u(0xe0049)}${u(0xe0047)}\r\n\r\n\r\n\r\n${"Suite du texte, sans rien de particulier. ".repeat(8)}`;
    const [page] = pastedTextToPages(dirty, URL_, NOW);
    expect(page!.text.split("\n").slice(0, 3)).toEqual(["Mon cabinet", "Bienvenue au cabinet . Les séances durent une heure.", "alert(1)"]);
    expect(/[<>​ \r]|[\u{e0000}-\u{e007f}]/u.test(page!.text)).toBe(false);
  });

  it("déterministe : même texte, même adresse, même date → mêmes pages ; la date par défaut est l'instant présent", () => {
    expect(pastedTextToPages(SAMPLE, URL_, NOW)).toEqual(pastedTextToPages(SAMPLE, URL_, NOW));
    const before = Date.now();
    const [page] = pastedTextToPages(SAMPLE, URL_) as [ExternalSitePage];
    expect(new Date(page.fetchedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("adresse : ancre retirée, chemin gardé ; adresse illisible gardée telle quelle ; entrée qui n'est pas du texte : aucune page", () => {
    expect(pastedTextToPages(SAMPLE, "https://www.plateforme.fr/mon-cabinet#haut", NOW)[0]!.url).toBe("https://www.plateforme.fr/mon-cabinet");
    expect(pastedTextToPages(SAMPLE, "mon-cabinet", NOW)[0]!.url).toBe("mon-cabinet");
    expect(pastedTextToPages(undefined as unknown as string, URL_, NOW)).toEqual([]);
    expect(pastedTextToPages(42 as unknown as string, URL_, NOW)).toEqual([]);
  });
});
