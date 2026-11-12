import { describe, expect, it } from "vitest";
import { cleanExternalProfile } from "@theralys/shared";
import { parseRubricDraft } from "./draft-schema";
import { RUBRIC_IDS, checkRubricDraft, rubricDraft } from "./rubrics";

const SITE = "https://www.cabinet-exemple.fr";

const PROFILE = cleanExternalProfile(
  {
    headline: "Sophrologue à Albi",
    intro: ["Je vous reçois au cabinet ou en visio."],
    highlights: [{ title: "Séances en visio", text: "Partout en France" }],
    specialties: [{ slug: "sommeil", title: "Troubles du sommeil", excerpt: "Retrouver des nuits sereines.", url: `${SITE}/sommeil`, headings: ["Pour qui ?"], faq: [] }],
    about: { paragraphs: ["Mon parcours."], credentials: ["Titre RNCP"] },
    practical: [{ title: "Durée", text: "1 heure" }],
    process: [{ title: "Échange", description: "Nous faisons le point." }],
    faq: [{ question: "Est-ce remboursé ?", answer: "Parfois, selon votre mutuelle." }],
    contact: { address: "12 rue des Lilas, 81000 Albi", phone: "05 55 01 02 03", email: "contact@cabinet-exemple.fr", hours: [{ label: "Lundi", value: "9h – 19h" }] },
    bookingUrl: "https://www.resalib.fr/praticien/demo",
    social: { instagram: "https://www.instagram.com/demo.cabinet" },
  },
  SITE,
);

/** Le formulaire tel qu'il arrive à l'action : passé par un aller-retour JSON. */
const sent = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("parseRubricDraft", () => {
  it("accepte, pour chaque rubrique, le formulaire que l'écran envoie", () => {
    for (const rubric of RUBRIC_IDS) {
      const draft = rubricDraft(rubric, PROFILE);
      const parsed = parseRubricDraft(rubric, sent(draft));
      expect(parsed).toEqual(draft);
      // Ce qui en sort passe le contrôle de fond sans erreur
      expect(parsed && checkRubricDraft(rubric, parsed, { siteUrl: SITE, profile: PROFILE }).ok).toBe(true);
    }
  });

  it("refuse ce qui n'a pas la forme du formulaire de la rubrique", () => {
    for (const rubric of RUBRIC_IDS) {
      for (const value of [null, undefined, "texte", 3, [], {}]) expect(parseRubricDraft(rubric, value)).toBeNull();
    }
    expect(parseRubricDraft("faq", { items: [{ uid: "e0", first: "Question", second: 3 }] })).toBeNull();
    expect(parseRubricDraft("faq", { items: "aucune" })).toBeNull();
    expect(parseRubricDraft("contact", { ...rubricDraft("contact", PROFILE), phone: null })).toBeNull();
    expect(parseRubricDraft("social", { links: { instagram: "" } })).toBeNull();
    // Le formulaire d'une autre rubrique n'est pas accepté à la place
    expect(parseRubricDraft("presentation", sent(rubricDraft("about", PROFILE)))).toBeNull();
  });

  it("écarte l'envoi démesuré : texte ou liste hors de proportion", () => {
    expect(parseRubricDraft("booking", { link: "a".repeat(4001) })).toBeNull();
    const many = Array.from({ length: 41 }, (_, index) => ({ uid: `n${index}`, first: "Question", second: "Réponse" }));
    expect(parseRubricDraft("faq", { items: many })).toBeNull();
    expect(parseRubricDraft("faq", { items: many.slice(0, 40) })).not.toBeNull();
  });

  it("ne garde que les champs du formulaire : rien d'ajouté par le navigateur ne passe", () => {
    const draft = { ...rubricDraft("specialties", PROFILE), extra: true };
    const item = { ...draft.items[0], kept: { summary: "Injecté" }, summary: "Injecté" };
    const parsed = parseRubricDraft("specialties", sent({ ...draft, items: [item] }));
    expect(parsed).toEqual(rubricDraft("specialties", PROFILE));
    // Ce qui a été lu sur la page de la spécialité vient du profil, jamais du formulaire reçu
    const check = parsed && checkRubricDraft("specialties", parsed, { siteUrl: SITE, profile: PROFILE });
    expect(check && check.ok && check.value.specialties).toEqual(PROFILE.specialties);
  });
});
