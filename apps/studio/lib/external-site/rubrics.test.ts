import { describe, expect, it } from "vitest";
import {
  EMPTY_EXTERNAL_PROFILE,
  cleanExternalOverrides,
  cleanExternalProfile,
  mergeExternalProfile,
  type ExternalProfileOverrides,
  type ExternalSiteProfile,
} from "@theralys/shared";
import {
  DRAFT_ERRORS,
  FIELD_MAX,
  LIST_MAX,
  RUBRICS,
  RUBRIC_IDS,
  RUBRIC_KEYS,
  applyRubricCorrection,
  bookingDisplay,
  bookingLinkFromInput,
  checkRubricDraft,
  isRubricCorrected,
  isRubricEmpty,
  isRubricId,
  restoreRubric,
  rubricDraft,
  sameContent,
  type CorrectionBase,
  type RubricId,
} from "./rubrics";

const SITE = "https://www.cabinet-exemple.fr";

/** Profil tel que le service l'enregistre : déjà passé par le nettoyage du contrat. */
const PROFILE: ExternalSiteProfile = cleanExternalProfile(
  {
    headline: "Sophrologue à Albi : retrouver le calme, à votre rythme",
    intro: ["Je vous reçois au cabinet ou en visio, du lundi au samedi.", "Chaque accompagnement est construit avec vous."],
    highlights: [{ title: "Séances en visio", text: "Depuis chez vous, partout en France" }, { title: "Cabinet accessible" }],
    specialties: [
      {
        slug: "gestion-du-stress",
        title: "Gestion du stress",
        excerpt: "Relâcher le corps pour apaiser le mental.",
        url: `${SITE}/gestion-du-stress`,
        summary: "Six à huit séances pour repérer vos signaux d'alerte et apprendre des exercices courts.",
        headings: ["Pour qui ?", "Comment se déroule l'accompagnement ?"],
        faq: [{ question: "Combien de séances ?", answer: "Six à huit en moyenne." }],
      },
      { slug: "sommeil", title: "Troubles du sommeil", excerpt: "Retrouver des nuits plus sereines.", headings: [], faq: [] },
    ],
    about: { paragraphs: ["Après dix ans dans un autre métier, j'ai découvert la sophrologie."], credentials: ["Titre de sophrologue inscrit au RNCP"] },
    practical: [{ title: "Durée d'une séance", text: "1 heure" }],
    process: [{ title: "Échange", description: "Nous faisons le point sur votre demande." }],
    faq: [{ question: "Est-ce remboursé ?", answer: "Certaines mutuelles prennent en charge une partie des séances." }],
    contact: {
      address: "12 rue des Lilas, 81000 Albi",
      phone: "05 55 01 02 03",
      email: "contact@cabinet-exemple.fr",
      hours: [{ label: "Lundi au vendredi", value: "9h – 19h" }],
      note: "Sur rendez-vous uniquement",
    },
    bookingUrl: "https://www.resalib.fr/praticien/demo-cabinet-exemple",
    social: { instagram: "https://www.instagram.com/demo.cabinet.exemple" },
  },
  SITE,
);

const base = (overrides: ExternalProfileOverrides | null = null, extracted: ExternalSiteProfile | null = PROFILE): CorrectionBase => ({ url: SITE, extracted, overrides });

/** Ce que le formulaire d'une rubrique envoie quand le praticien l'ouvre et l'enregistre, après modification éventuelle du brouillon. */
function submit<R extends RubricId>(rubric: R, profile: ExternalSiteProfile, edit: (draft: ReturnType<typeof rubricDraft<R>>) => void = () => {}): unknown {
  const draft = rubricDraft(rubric, profile);
  edit(draft);
  const check = checkRubricDraft(rubric, draft, SITE);
  if (!check.ok) throw new Error(`brouillon refusé : ${JSON.stringify(check.errors)}`);
  return check.value;
}

describe("rubriques", () => {
  it("neuf rubriques, dans l'ordre de l'écran", () => {
    expect(RUBRICS.map((rubric) => rubric.title)).toEqual([
      "Présentation",
      "Spécialités",
      "À propos",
      "Infos pratiques",
      "Déroulement d'une séance",
      "Questions fréquentes",
      "Contact",
      "Prise de rendez-vous",
      "Réseaux sociaux",
    ]);
    expect(RUBRIC_IDS).toHaveLength(9);
  });

  it("chaque clé du profil appartient à une rubrique, et une seule", () => {
    const keys = RUBRIC_IDS.flatMap((rubric) => [...RUBRIC_KEYS[rubric]]);
    expect([...keys].sort()).toEqual([...Object.keys(EMPTY_EXTERNAL_PROFILE), "bookingUrl"].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("isRubricId ne reconnaît que les rubriques de l'écran", () => {
    expect(isRubricId("faq")).toBe(true);
    expect(isRubricId("headline")).toBe(false);
    expect(isRubricId(3)).toBe(false);
  });
});

describe("bornes de saisie", () => {
  it("un profil saisi aux longueurs et aux nombres maximaux ressort du nettoyage du contrat sans être raccourci", () => {
    const text = (length: number, seed: string) => `${seed} ${"a".repeat(length)}`.slice(0, length);
    const many = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));
    const full = {
      headline: text(FIELD_MAX.headline, "accroche"),
      intro: many(LIST_MAX.intro, (i) => text(FIELD_MAX.paragraph, `intro${i}`)),
      highlights: many(LIST_MAX.highlights, (i) => ({ title: text(FIELD_MAX.highlightTitle, `point${i}`), text: text(FIELD_MAX.highlightText, `detail${i}`) })),
      specialties: many(LIST_MAX.specialties, (i) => ({
        slug: `specialite-${i}`,
        title: text(FIELD_MAX.specialtyTitle, `specialite${i}`),
        excerpt: text(FIELD_MAX.specialtyExcerpt, `resume${i}`),
        url: `${SITE}/page-${i}`,
        headings: [],
        faq: [],
      })),
      about: {
        paragraphs: many(LIST_MAX.aboutParagraphs, (i) => text(FIELD_MAX.paragraph, `parcours${i}`)),
        credentials: many(LIST_MAX.credentials, (i) => text(FIELD_MAX.credential, `diplome${i}`)),
      },
      practical: many(LIST_MAX.practical, (i) => ({ title: text(FIELD_MAX.pairTitle, `info${i}`), text: text(FIELD_MAX.pairText, `valeur${i}`) })),
      process: many(LIST_MAX.process, (i) => ({ title: text(FIELD_MAX.pairTitle, `etape${i}`), description: text(FIELD_MAX.pairText, `description${i}`) })),
      faq: many(LIST_MAX.faq, (i) => ({ question: text(FIELD_MAX.question, `question${i}`), answer: text(FIELD_MAX.answer, `reponse${i}`) })),
      contact: {
        address: text(FIELD_MAX.address, "adresse"),
        phone: "+33 (0)5 55 01 02 03 04 05",
        email: `${"a".repeat(FIELD_MAX.email - "@exemple.fr".length)}@exemple.fr`,
        hours: many(LIST_MAX.hours, (i) => ({ label: text(FIELD_MAX.hoursLabel, `jour${i}`), value: text(FIELD_MAX.hoursValue, `horaire${i}`) })),
        note: text(FIELD_MAX.note, "note"),
      },
      bookingUrl: "https://www.doctolib.fr/sophrologue/albi/demo",
      social: {},
    };
    expect(full.contact.phone.length).toBeLessThanOrEqual(FIELD_MAX.phone);
    expect(cleanExternalProfile(full, SITE)).toEqual(full);
  });

  it("au-delà de ces longueurs, le contrat raccourcit : la saisie ne doit pas les dépasser", () => {
    const tooLong = `${"mot ".repeat(40)}fin`;
    expect(tooLong.length).toBeGreaterThan(FIELD_MAX.highlightTitle);
    expect(cleanExternalProfile({ highlights: [{ title: tooLong }] }, SITE).highlights[0]?.title.length).toBeLessThanOrEqual(FIELD_MAX.highlightTitle + 1);
    expect(cleanExternalProfile({ about: { credentials: [tooLong] } }, SITE).about.credentials[0]?.length).toBeLessThanOrEqual(FIELD_MAX.credential + 1);
    expect(cleanExternalProfile({ contact: { hours: [{ label: tooLong, value: tooLong }] } }, SITE).contact.hours[0]?.label.length).toBeLessThanOrEqual(FIELD_MAX.hoursLabel + 1);
  });
});

describe("état d'une rubrique", () => {
  it("corrigée dès qu'une de ses clés figure dans les corrections", () => {
    expect(isRubricCorrected(null, "presentation")).toBe(false);
    expect(isRubricCorrected({}, "presentation")).toBe(false);
    expect(isRubricCorrected({ intro: ["Texte"] }, "presentation")).toBe(true);
    expect(isRubricCorrected({ intro: ["Texte"] }, "about")).toBe(false);
    expect(isRubricCorrected({ bookingUrl: "" }, "booking")).toBe(true);
    expect(isRubricCorrected({ contact: {} }, "contact")).toBe(false);
    expect(isRubricCorrected({ contact: { phone: "" } }, "contact")).toBe(true);
  });

  it("vide quand le profil n'y porte rien", () => {
    for (const rubric of RUBRIC_IDS) {
      expect(isRubricEmpty(EMPTY_EXTERNAL_PROFILE, rubric)).toBe(true);
      expect(isRubricEmpty(PROFILE, rubric)).toBe(false);
    }
    expect(isRubricEmpty({ ...EMPTY_EXTERNAL_PROFILE, contact: { hours: [], note: "Sur rendez-vous" } }, "contact")).toBe(false);
    expect(isRubricEmpty({ ...EMPTY_EXTERNAL_PROFILE, highlights: [{ title: "Visio" }] }, "presentation")).toBe(false);
  });
});

describe("sameContent", () => {
  it("ignore l'ordre des clés et les champs absents, pas l'ordre des listes", () => {
    expect(sameContent({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameContent([1, 2], [2, 1])).toBe(false);
    expect(sameContent("a", "a")).toBe(true);
  });
});

describe("applyRubricCorrection", () => {
  it("un formulaire ouvert puis enregistré sans y toucher n'est jamais une correction, quelle que soit la rubrique", () => {
    for (const rubric of RUBRIC_IDS) {
      expect(applyRubricCorrection(base(), rubric, submit(rubric, PROFILE))).toEqual({});
    }
  });

  it("… même quand la base a rangé les clés du profil dans un autre ordre", () => {
    const stored = JSON.parse(JSON.stringify(PROFILE, (_key, value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value))) as ExternalSiteProfile;
    for (const rubric of RUBRIC_IDS) {
      expect(applyRubricCorrection(base(null, stored), rubric, submit(rubric, stored))).toEqual({});
    }
  });

  it("seule la clé modifiée est corrigée : le reste de la rubrique continue de suivre le site", () => {
    const value = submit("presentation", PROFILE, (draft) => {
      draft.headline = "Sophrologue à Albi et en visio";
    });
    expect(applyRubricCorrection(base(), "presentation", value)).toEqual({ headline: "Sophrologue à Albi et en visio" });
  });

  it("les autres rubriques déjà corrigées ne bougent pas", () => {
    const before: ExternalProfileOverrides = { faq: [], bookingUrl: "tel:0555010203" };
    const value = submit("about", PROFILE, (draft) => {
      draft.credentials.push({ uid: "n1", text: "Formation en sophrologie du sommeil" });
    });
    const next = applyRubricCorrection(base(before), "about", value);
    expect(next.faq).toEqual([]);
    expect(next.bookingUrl).toBe("tel:0555010203");
    expect(next.about).toEqual({
      paragraphs: PROFILE.about.paragraphs,
      credentials: ["Titre de sophrologue inscrit au RNCP", "Formation en sophrologie du sommeil"],
    });
    // L'objet reçu n'est pas modifié
    expect(before).toEqual({ faq: [], bookingUrl: "tel:0555010203" });
  });

  it("remettre ce qui a été lu retire la correction", () => {
    const corrected: ExternalProfileOverrides = { headline: "Autre accroche", intro: ["Autre présentation"] };
    const effective = mergeExternalProfile(PROFILE, corrected);
    const value = submit("presentation", effective, (draft) => {
      draft.headline = PROFILE.headline;
    });
    expect(applyRubricCorrection(base(corrected), "presentation", value)).toEqual({ intro: ["Autre présentation"] });
  });

  it("une liste vidée est une correction : la rubrique reste vide après une nouvelle lecture", () => {
    const value = submit("faq", PROFILE, (draft) => {
      draft.items = [];
    });
    const next = applyRubricCorrection(base(), "faq", value);
    expect(next).toEqual({ faq: [] });
    expect(mergeExternalProfile(PROFILE, next).faq).toEqual([]);
  });

  it("contact : champ par champ — seul le champ modifié est corrigé, un champ vidé reste vide", () => {
    const value = submit("contact", PROFILE, (draft) => {
      draft.phone = "06 39 98 00 11";
      draft.note = "";
    });
    const next = applyRubricCorrection(base(), "contact", value);
    expect(next).toEqual({ contact: { phone: "06 39 98 00 11", note: "" } });
    const effective = mergeExternalProfile(PROFILE, next);
    expect(effective.contact.phone).toBe("06 39 98 00 11");
    expect(effective.contact.note).toBeUndefined();
    expect(effective.contact.address).toBe(PROFILE.contact.address);
    // Le champ remis comme sur le site n'est plus corrigé ; l'autre correction reste
    const back = submit("contact", effective, (draft) => {
      draft.phone = PROFILE.contact.phone ?? "";
    });
    expect(applyRubricCorrection(base(next), "contact", back)).toEqual({ contact: { note: "" } });
  });

  it("contact : des horaires modifiés remplacent ceux du site ; tout remis, la correction disparaît", () => {
    const value = submit("contact", PROFILE, (draft) => {
      draft.hours.push({ uid: "n1", first: "Samedi", second: "9h – 12h" });
    });
    const next = applyRubricCorrection(base(), "contact", value);
    expect(next.contact?.hours).toEqual([...PROFILE.contact.hours, { label: "Samedi", value: "9h – 12h" }]);
    expect(Object.keys(next.contact ?? {})).toEqual(["hours"]);
    expect(applyRubricCorrection(base(next), "contact", submit("contact", PROFILE))).toEqual({});
  });

  it("rendez-vous : un numéro devient un lien d'appel, un champ vidé retire le lien lu sur le site", () => {
    const byPhone = submit("booking", PROFILE, (draft) => {
      draft.link = "05 55 01 02 03";
    });
    expect(applyRubricCorrection(base(), "booking", byPhone)).toEqual({ bookingUrl: "tel:0555010203" });
    const none = submit("booking", PROFILE, (draft) => {
      draft.link = "";
    });
    const next = applyRubricCorrection(base(), "booking", none);
    expect(next).toEqual({ bookingUrl: "" });
    expect(mergeExternalProfile(PROFILE, next).bookingUrl).toBeUndefined();
    // Sans lien lu sur le site, un champ vide n'est pas une correction
    expect(applyRubricCorrection(base(null, { ...PROFILE, bookingUrl: undefined }), "booking", none)).toEqual({});
  });

  it("ne lit que les clés de la rubrique dans ce que le navigateur envoie", () => {
    const next = applyRubricCorrection(base(), "faq", { faq: [{ question: "Où ?", answer: "À Albi." }], headline: "Injecté", contact: { phone: "0000000000" } });
    expect(next).toEqual({ faq: [{ question: "Où ?", answer: "À Albi." }] });
  });

  it("une valeur inexploitable ne change rien", () => {
    const before: ExternalProfileOverrides = { headline: "Corrigée" };
    for (const value of [null, undefined, "texte", 3, []]) {
      for (const rubric of RUBRIC_IDS) expect(applyRubricCorrection(base(before), rubric, value)).toEqual(before);
    }
    expect(applyRubricCorrection(base(before), "contact", { contact: "06" })).toEqual(before);
  });

  it("nettoie ce qui est saisi comme le contrat : balises retirées, textes sur une ligne", () => {
    const next = applyRubricCorrection(base(), "presentation", { headline: "  <b>Sophrologue</b>\n à   Albi  " });
    expect(next).toEqual({ headline: "Sophrologue à Albi" });
  });

  it("sans rien de lu (profil absent), tout ce qui est saisi est une correction", () => {
    const next = applyRubricCorrection(base(null, null), "specialties", { specialties: [{ title: "Gestion du stress", excerpt: "" }] });
    expect(next.specialties).toEqual([{ slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "", headings: [], faq: [] }]);
    expect(applyRubricCorrection(base(null, null), "about", { about: { paragraphs: [], credentials: [] } })).toEqual({});
  });

  it("ce qui est produit est déjà au format du contrat : le service l'enregistre tel quel", () => {
    const value = submit("specialties", PROFILE, (draft) => {
      draft.items.push({ uid: "n1", title: "Préparation aux examens", excerpt: "Arriver le jour venu avec tous ses moyens.", url: "", kept: null });
    });
    const next = applyRubricCorrection(base({ contact: { note: "" } }), "specialties", value);
    expect(cleanExternalOverrides(next, SITE)).toEqual(next);
    expect(next.specialties?.map((specialty) => specialty.slug)).toEqual(["gestion-du-stress", "sommeil", "preparation-aux-examens"]);
  });
});

describe("restoreRubric", () => {
  it("retire les clés de la rubrique et garde les autres corrections", () => {
    const overrides: ExternalProfileOverrides = { headline: "A", intro: ["B"], highlights: [], faq: [], contact: { phone: "" } };
    expect(restoreRubric(overrides, "presentation")).toEqual({ faq: [], contact: { phone: "" } });
    expect(restoreRubric(overrides, "contact")).toEqual({ headline: "A", intro: ["B"], highlights: [], faq: [] });
    expect(restoreRubric(overrides, "social")).toEqual(overrides);
    expect(restoreRubric(null, "faq")).toEqual({});
    // L'objet reçu n'est pas modifié
    expect(Object.keys(overrides)).toHaveLength(5);
  });
});

describe("spécialités", () => {
  it("modifier le nom garde l'identifiant et ce qui a été lu sur la page", () => {
    const value = submit("specialties", PROFILE, (draft) => {
      draft.items[0]!.title = "Stress et anxiété";
    });
    const [first] = applyRubricCorrection(base(), "specialties", value).specialties ?? [];
    expect(first).toEqual({ ...PROFILE.specialties[0], title: "Stress et anxiété" });
  });

  it("désigner une autre page du site écarte le résumé, les intertitres et les questions de l'ancienne", () => {
    const value = submit("specialties", PROFILE, (draft) => {
      draft.items[0]!.url = "www.cabinet-exemple.fr/stress";
    });
    const [first] = applyRubricCorrection(base(), "specialties", value).specialties ?? [];
    expect(first).toEqual({ slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "Relâcher le corps pour apaiser le mental.", url: `${SITE}/stress`, headings: [], faq: [] });
  });

  it("retirer l'adresse de la page garde ce qui y a été lu", () => {
    const value = submit("specialties", PROFILE, (draft) => {
      draft.items[0]!.url = "";
    });
    const [first] = applyRubricCorrection(base(), "specialties", value).specialties ?? [];
    expect(first?.url).toBeUndefined();
    expect(first?.summary).toBe(PROFILE.specialties[0]?.summary);
    expect(first?.headings).toEqual(PROFILE.specialties[0]?.headings);
  });

  it("refuse une page d'un autre site et une spécialité sans nom ; ignore une ligne ajoutée restée vide", () => {
    const draft = rubricDraft("specialties", PROFILE);
    draft.items[0]!.url = "https://www.doctolib.fr/sophrologue/albi";
    draft.items[1]!.title = "  ";
    draft.items.push({ uid: "n1", title: "", excerpt: "", url: "", kept: null });
    expect(checkRubricDraft("specialties", draft, SITE)).toEqual({
      ok: false,
      errors: { "items.s0.url": DRAFT_ERRORS.specialtyUrl, "items.s1.title": DRAFT_ERRORS.specialtyTitle },
    });
  });
});

describe("checkRubricDraft", () => {
  it("lignes à deux champs : une ligne vide est ignorée, une ligne à moitié remplie est signalée sur le champ manquant", () => {
    const draft = rubricDraft("faq", PROFILE);
    draft.items.push({ uid: "n1", first: "", second: "" }, { uid: "n2", first: "Et en visio ?", second: " " }, { uid: "n3", first: "", second: "Oui." });
    expect(checkRubricDraft("faq", draft, SITE)).toEqual({
      ok: false,
      errors: { "items.n2.second": DRAFT_ERRORS.incomplete, "items.n3.first": DRAFT_ERRORS.incomplete },
    });
    draft.items = draft.items.filter((item) => item.uid !== "n2" && item.uid !== "n3");
    expect(checkRubricDraft("faq", draft, SITE)).toEqual({ ok: true, value: { faq: PROFILE.faq } });
  });

  it("points forts : le titre est exigé, la précision est facultative", () => {
    const draft = rubricDraft("presentation", PROFILE);
    draft.highlights.push({ uid: "n1", first: "", second: "Sans titre" });
    expect(checkRubricDraft("presentation", draft, SITE)).toEqual({ ok: false, errors: { "highlights.n1.first": DRAFT_ERRORS.highlightTitle } });
    draft.highlights[2]!.first = "Parking gratuit";
    draft.highlights[2]!.second = "";
    const check = checkRubricDraft("presentation", draft, SITE);
    expect(check.ok && check.value.highlights).toEqual([...PROFILE.highlights, { title: "Parking gratuit" }]);
  });

  it("paragraphes : espaces réduits, paragraphes vides retirés", () => {
    const draft = rubricDraft("about", PROFILE);
    draft.paragraphs.push({ uid: "n1", text: "   " }, { uid: "n2", text: " Deuxième\nparagraphe  " });
    const check = checkRubricDraft("about", draft, SITE);
    expect(check.ok && check.value.about?.paragraphs).toEqual([...PROFILE.about.paragraphs, "Deuxième paragraphe"]);
  });

  it("contact : numéro et adresse e-mail illisibles sont signalés, pas vidés en silence", () => {
    const draft = rubricDraft("contact", PROFILE);
    draft.phone = "appelez-moi";
    draft.email = "contact@cabinet";
    draft.hours.push({ uid: "n1", first: "Samedi", second: "" });
    expect(checkRubricDraft("contact", draft, SITE)).toEqual({
      ok: false,
      errors: { phone: DRAFT_ERRORS.phone, email: DRAFT_ERRORS.email, "hours.n1.second": DRAFT_ERRORS.incomplete },
    });
    draft.phone = "";
    draft.email = "";
    draft.hours.pop();
    const check = checkRubricDraft("contact", draft, SITE);
    expect(check.ok && check.value.contact).toMatchObject({ phone: "", email: "" });
  });

  it("rendez-vous : adresse sans protocole acceptée, texte libre refusé", () => {
    const draft = rubricDraft("booking", PROFILE);
    draft.link = "www.doctolib.fr/sophrologue/albi/demo";
    expect(checkRubricDraft("booking", draft, SITE)).toEqual({ ok: true, value: { bookingUrl: "https://www.doctolib.fr/sophrologue/albi/demo" } });
    draft.link = "par téléphone";
    expect(checkRubricDraft("booking", draft, SITE)).toEqual({ ok: false, errors: { link: DRAFT_ERRORS.booking } });
    draft.link = "06 12";
    expect(checkRubricDraft("booking", draft, SITE)).toEqual({ ok: false, errors: { link: DRAFT_ERRORS.booking } });
  });

  it("réseaux sociaux : le lien doit mener à une page du bon réseau", () => {
    const draft = rubricDraft("social", PROFILE);
    draft.links.facebook = "facebook.com/cabinet.exemple";
    draft.links.linkedin = "https://www.instagram.com/cabinet";
    draft.links.youtube = "https://www.youtube.com/";
    const check = checkRubricDraft("social", draft, SITE);
    expect(check).toEqual({
      ok: false,
      errors: {
        "links.linkedin": DRAFT_ERRORS.social("LinkedIn", "linkedin.com"),
        "links.youtube": DRAFT_ERRORS.social("YouTube", "youtube.com"),
      },
    });
    draft.links.linkedin = "";
    draft.links.youtube = "";
    expect(checkRubricDraft("social", draft, SITE)).toEqual({
      ok: true,
      value: { social: { instagram: "https://www.instagram.com/demo.cabinet.exemple", facebook: "https://facebook.com/cabinet.exemple" } },
    });
  });
});

describe("lien de rendez-vous", () => {
  it("bookingLinkFromInput : numéro → tel:, adresse → https://", () => {
    expect(bookingLinkFromInput(" 05 55 01 02 03 ")).toBe("tel:0555010203");
    expect(bookingLinkFromInput("+33 5 55 01 02 03")).toBe("tel:+33555010203");
    expect(bookingLinkFromInput("tel:0555010203")).toBe("tel:0555010203");
    expect(bookingLinkFromInput("calendly.com/demo")).toBe("https://calendly.com/demo");
    expect(bookingLinkFromInput("https://calendly.com/demo")).toBe("https://calendly.com/demo");
    expect(bookingLinkFromInput("")).toBe("");
  });

  it("bookingDisplay : numéro à appeler, ou page avec le nom de la plateforme connue", () => {
    expect(bookingDisplay(undefined)).toBeNull();
    expect(bookingDisplay("tel:0555010203")).toEqual({ kind: "phone", number: "0555010203", href: "tel:0555010203" });
    expect(bookingDisplay("https://www.doctolib.fr/sophrologue/albi/demo")).toEqual({ kind: "web", platform: "Doctolib", href: "https://www.doctolib.fr/sophrologue/albi/demo" });
    expect(bookingDisplay("https://www.cabinet-exemple.fr/rendez-vous")).toEqual({ kind: "web", platform: null, href: "https://www.cabinet-exemple.fr/rendez-vous" });
  });

  it("le formulaire montre un numéro sans son préfixe technique", () => {
    expect(rubricDraft("booking", { ...PROFILE, bookingUrl: "tel:0555010203" }).link).toBe("0555010203");
    expect(rubricDraft("booking", { ...PROFILE, bookingUrl: undefined }).link).toBe("");
  });
});
