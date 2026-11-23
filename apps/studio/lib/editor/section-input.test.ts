import { describe, expect, it } from "vitest";
import type { Section } from "@theralys/shared";
import { mergeSectionInput } from "./section-input";

const hero: Section = {
  type: "hero",
  title: "Retrouvez votre équilibre",
  paragraphs: ["Un accompagnement sur mesure."],
  imageUrl: "http://ancien-stockage.exemple/portrait.jpg",
  stats: [{ icon: "coeur", value: "+300", label: "Patients accompagnés" }],
};

const contact: Section = { type: "contact", title: "Contact", phone: "06 12 34 56 78", email: "claire@exemple.fr" };

function merged(current: Section, incoming: unknown): Section {
  const result = mergeSectionInput(current, incoming);
  if (!result.ok) throw new Error("fusion refusée");
  return result.section;
}

describe("mergeSectionInput", () => {
  it("remplace les champs connus et garde ceux que l'éditeur n'envoie pas", () => {
    const next = merged(hero, { type: "hero", title: "Nouveau titre", paragraphs: ["Un", "Deux"] });
    expect(next).toMatchObject({ title: "Nouveau titre", paragraphs: ["Un", "Deux"], imageUrl: hero.type === "hero" ? hero.imageUrl : "" });
    expect((next as { stats?: unknown[] }).stats).toHaveLength(1);
  });

  it("écarte toute clé inconnue, sans refuser l'enregistrement", () => {
    const next = merged(contact, { type: "contact", title: "Me joindre", onclick: "alert(1)", __proto__: { admin: true }, body: "<script>" });
    expect(next).toEqual({ type: "contact", title: "Me joindre", phone: "06 12 34 56 78", email: "claire@exemple.fr" });
  });

  it("refuse un champ du mauvais type : un objet à la place d'un texte ferait planter le site", () => {
    expect(mergeSectionInput(contact, { type: "contact", phone: {} }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", paragraphs: "un seul texte" }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", stats: [{ value: 3, label: "x" }] }).ok).toBe(false);
    expect(mergeSectionInput(hero, "hero").ok).toBe(false);
    expect(mergeSectionInput(hero, [hero]).ok).toBe(false);
  });

  it("refuse les contenus démesurés", () => {
    expect(mergeSectionInput(hero, { type: "hero", title: "x".repeat(301) }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", paragraphs: Array.from({ length: 31 }, () => "x") }).ok).toBe(false);
    expect(mergeSectionInput({ type: "faq", title: "FAQ", items: [] }, { type: "faq", items: Array.from({ length: 41 }, () => ({ question: "q", answer: "a" })) }).ok).toBe(false);
  });

  it("n'accepte une image qu'en https, en chemin du site ou en photo embarquée — ou telle qu'elle était", () => {
    // Inchangée : l'adresse déjà enregistrée passe, même d'un format qu'on n'accepterait plus
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "http://ancien-stockage.exemple/portrait.jpg" }).ok).toBe(true);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "https://stockage.exemple/photo.webp" }).ok).toBe(true);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "/photos/cabinet.jpg" }).ok).toBe(true);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "data:image/webp;base64,AAAA" }).ok).toBe(true);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "" }).ok).toBe(true);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "data:image/svg+xml;base64,AAAA" }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "https://x.fr/a.jpg\"><script>" }).ok).toBe(false);
    expect(mergeSectionInput(hero, { type: "hero", imageUrl: "http://autre.exemple/a.jpg" }).ok).toBe(false);
  });

  it("images des cartes de spécialités : même règle, carte par carte", () => {
    const specialties: Section = {
      type: "specialties",
      title: "Mes spécialités",
      items: [{ slug: "mal-de-dos", title: "Mal de dos", excerpt: "…", imageUrl: "http://ancien/dos.jpg" }],
    };
    const item = { slug: "mal-de-dos", title: "Mal de dos", excerpt: "…" };
    expect(mergeSectionInput(specialties, { type: "specialties", items: [{ ...item, imageUrl: "http://ancien/dos.jpg" }] }).ok).toBe(true);
    expect(mergeSectionInput(specialties, { type: "specialties", items: [{ ...item, imageUrl: "ftp://x/dos.jpg" }] }).ok).toBe(false);
    expect(mergeSectionInput(specialties, { type: "specialties", items: [{ ...item, slug: "../admin" }] }).ok).toBe(false);
  });

  it("un type différent laisse la section enregistrée intacte", () => {
    expect(merged(hero, { type: "contact", title: "Autre" })).toBe(hero);
  });

  it("visibilité : `hidden: true` masque, tout le reste rend visible", () => {
    expect(merged(hero, { type: "hero", hidden: true }).hidden).toBe(true);
    const visible = merged({ ...hero, hidden: true } as Section, { type: "hero", hidden: "oui" });
    expect("hidden" in visible).toBe(false);
    expect("hidden" in merged({ ...hero, hidden: true } as Section, { type: "hero" })).toBe(false);
  });

  it("un champ vidé arrive `null` : il vaut « inchangé », pas une erreur", () => {
    expect(merged(contact, { type: "contact", note: null, title: "Contact" })).toEqual(contact);
  });
});
