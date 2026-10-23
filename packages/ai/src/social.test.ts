import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  REQUEST_SOURCE_REF,
  TEMPLATE_FORMATS,
  buildSocialBrief,
  camelHashtag,
  countEmoji,
  slugify,
  socialSlotsForMonth,
  type SocialSiteBrief,
  type SocialSlot,
  type SocialSourceRef,
} from "@theralys/shared";
import { resolveProfession } from "./mock/catalog";
import {
  mockGenerateArticles,
  mockGenerateHome,
  mockGenerateMotifPage,
  mockGenerateReviews,
} from "./mock/generator";
import { mockSocialMonth, mockSocialRequest } from "./mock/social";
import {
  SOCIAL_ARTICLE_CTA_TITLE,
  SOCIAL_BIO_LINE,
  SOCIAL_CTA_TITLE,
  SOCIAL_FORBIDDEN_PATTERNS,
  SOCIAL_NEW_ARTICLE_BADGE,
  checkSocialCompliance,
  createSocialGenerator,
  finalizePlan,
  socialPlanSchema,
  socialWelcomeLine,
  type FinalizeInput,
  type FinalizedPost,
  type SocialPostDraft,
} from "./social";
import {
  PILLAR_HELP,
  availablePillars,
  rotatePillars,
  socialMonthUserPrompt,
  socialRequestUserPrompt,
  socialSystemPrompt,
} from "./social-prompts";
import type { GenerationInput } from "./types";

// ─── Fixture : sites construits par le générateur mock, brief par buildSocialBrief ─

const NOW = new Date("2026-10-23T09:00:00Z");
const PEXELS = (n: number) =>
  `https://images.pexels.com/photos/${1000000 + n}/pexels-photo.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800`;
const BLOB = "https://abc123.public.blob.vercel-storage.com/portrait-x1.jpg";
const FAL = "https://fal.media/files/elephant/abc.jpg";

type Fixture = {
  brief: SocialSiteBrief;
  photosById: Record<string, string>;
  refsById: Record<string, SocialSourceRef>;
  slots: SocialSlot[];
};

function fixture(input: GenerationInput, type: "demo" | "client" = "demo"): Fixture {
  const home = mockGenerateHome(input);
  const motifs = home.motifsPlan;
  const homeSections = home.sections.map((s) =>
    s.type === "hero"
      ? { ...s, imageUrl: FAL }
      : s.type === "about"
        ? { ...s, imageUrl: BLOB }
        : s.type === "future"
          ? { ...s, imageUrl: PEXELS(99) }
          : s,
  );
  const pages = [
    { id: "home-1", type: "home", slug: "", title: "Accueil", metaDescription: home.metaDescription, sections: homeSections },
    ...motifs.map((m, i) => {
      const page = mockGenerateMotifPage(input, m);
      return {
        id: `m${i + 1}`,
        type: "motif",
        slug: page.slug,
        title: page.title,
        metaDescription: page.metaDescription,
        sections: page.sections.map((s) => (s.type === "hero" ? { ...s, imageUrl: PEXELS(i + 1) } : s)),
      };
    }),
  ];
  const articles = mockGenerateArticles(input, motifs).map((a, i) => ({
    id: `a${i + 1}`,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: a.content,
    imageUrl: PEXELS(10 + i),
    status: "published",
    // 3 et 17 novembre → créneaux « nouvel_article » les 4 et 18
    publishAt: new Date(Date.UTC(2026, 10, 3 + i * 14, 8)),
  }));
  const reviews = mockGenerateReviews(input).map((r, i) => ({ id: `r${i + 1}`, ...r }));
  const result = buildSocialBrief({
    site: {
      id: "site-1",
      name: home.siteName,
      type,
      theme: home.theme,
      bookingUrl: "https://calendly.com/demo",
      url: `https://${slugify(home.siteName)}.harmony-web.fr`,
    },
    prospect: {
      firstName: input.firstName,
      lastName: input.lastName,
      profession: input.profession,
      city: input.city,
      gender: input.gender,
      googleRating: 4.9,
      googleReviewCount: 27,
    },
    pages,
    articles,
    reviews,
    voice: null,
    practiceName: resolveProfession(input.profession).practiceName,
    now: NOW,
  });
  const slots = socialSlotsForMonth({
    year: 2026,
    month: 11,
    today: NOW,
    articles: articles.map((a) => ({ id: a.id, publishAt: a.publishAt })),
  });
  return { ...result, slots };
}

const CLAIRE: GenerationInput = {
  firstName: "Claire",
  lastName: "Dupont",
  profession: "Sophrologue",
  city: "Albi",
  gender: "feminin",
  highlightedMotifs: [],
  motifPageCount: 6,
};

/** Les 8 métiers du catalogue (le dernier résout vers l'entrée générique). */
const PROFESSIONS: GenerationInput[] = [
  CLAIRE,
  { firstName: "Séverine", lastName: "Salesa", profession: "Masseuse bien-être", city: "Clapiers", gender: "feminin", highlightedMotifs: ["Gestion du stress"], motifPageCount: 6 },
  { firstName: "Marc", lastName: "Rey", profession: "Ostéopathe", city: "Lyon", gender: "masculin", highlightedMotifs: [], motifPageCount: 3 },
  { firstName: "Ana", lastName: "Gomez", profession: "Naturopathe", city: "Pau", gender: "feminin", highlightedMotifs: [], motifPageCount: 4 },
  { firstName: "Paul", lastName: "Martin", profession: "Hypnothérapeute", city: "Nantes", gender: "masculin", highlightedMotifs: [], motifPageCount: 4 },
  { firstName: "Léa", lastName: "Bonnet", profession: "Réflexologue", city: "Toulouse", gender: "feminin", highlightedMotifs: [], motifPageCount: 4 },
  { firstName: "Hugo", lastName: "Petit", profession: "Praticien reiki", city: "Rennes", gender: "masculin", highlightedMotifs: [], motifPageCount: 3 },
  { firstName: "Ana", lastName: "Gomez", profession: "Énergéticienne", city: "Pau", gender: "feminin", highlightedMotifs: ["Sommeil", "Ancrage"], motifPageCount: 3 },
];

const generator = createSocialGenerator({ AI_MOCK: "1" } as NodeJS.ProcessEnv);

function monthInput(f: Fixture, recentTopics: string[] = [], month = "2026-11") {
  return { month, slots: f.slots, recentTopics, photosById: f.photosById, refsById: f.refsById };
}

function requestInput(
  f: Fixture,
  topic: string,
  format: "static" | "carousel" | "story",
  extra: { accentHex?: string | null; scheduledFor?: string; recentTopics?: string[] } = {},
) {
  return {
    topic,
    format,
    accentHex: extra.accentHex ?? null,
    scheduledFor: extra.scheduledFor ?? "2026-11-12",
    recentTopics: extra.recentTopics ?? [],
    photosById: f.photosById,
    refsById: f.refsById,
  };
}

const HASHTAG_RE = /^#[A-Za-z0-9_]{2,40}$/;
const boldCount = (text: string) => (text.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
const firstLine = (text: string) => text.split("\n")[0] ?? "";

/** Invariants d'une publication finalisée (règles éditoriales §1.4 et §3.4). */
function expectWellFormed(post: FinalizedPost, brief: SocialSiteBrief): void {
  const { content } = post;
  const { firstName, profession, city } = brief.practitioner;
  expect(TEMPLATE_FORMATS[post.template]).toContain(post.format);
  expect(content.pillar).toBe(post.pillar);
  expect(post.topic.length).toBeGreaterThan(0);
  expect(post.topic.length).toBeLessThanOrEqual(70);

  // Diapositives
  if (post.format === "carousel") {
    expect(content.slides.length).toBeGreaterThanOrEqual(3);
    expect(content.slides.length).toBeLessThanOrEqual(7);
    expect(content.slides[0]?.role).toBe("cover");
    expect(content.slides.slice(1, -1).every((s) => s.role === "page")).toBe(true);
    const cta = content.slides.at(-1)!;
    expect(cta.role).toBe("cta");
    expect(cta.title).toBe(post.template === "carrousel-article" ? SOCIAL_ARTICLE_CTA_TITLE : SOCIAL_CTA_TITLE);
    expect(cta.body).toBe(socialWelcomeLine(brief.voice, city));
  } else {
    expect(content.slides).toHaveLength(1);
    expect(content.slides[0]?.role).toBe("single");
  }
  for (const slide of content.slides) {
    expect(slide.title.length).toBeLessThanOrEqual(post.template === "avis" ? 90 : 60);
    expect(slide.title).not.toContain("**");
    expect(slide.body.length).toBeLessThanOrEqual(post.format === "carousel" ? 160 : 200);
    expect(countEmoji(`${slide.title}\n${slide.body}\n${slide.badge ?? ""}`)).toBe(0);
    expect(slide.body.split("\n").filter((l) => /^- /.test(l)).length).toBeLessThanOrEqual(3);
    // Un seul passage gras par body (le template « avis » est rendu en texte simple)
    expect(boldCount(slide.body)).toBe(post.template === "avis" ? 0 : 1);
    if (slide.badge) expect(slide.badge.length).toBeLessThanOrEqual(32);
    if (slide.imageUrl) expect(Object.values(brief.photos).length).toBeGreaterThan(0);
  }

  // Légende
  expect(firstLine(content.caption).length).toBeLessThanOrEqual(125);
  expect(countEmoji(content.caption)).toBeLessThanOrEqual(3);
  expect(content.caption.length).toBeGreaterThanOrEqual(300);
  expect(content.caption.length).toBeLessThanOrEqual(2000);
  expect(content.caption).toContain(SOCIAL_BIO_LINE);
  expect(content.caption.endsWith(`${firstName}, ${profession.toLowerCase()} à ${city}`)).toBe(true);
  expect(content.caption).not.toContain("**");
  expect(content.caption).not.toMatch(/(^|\s)#\w/);

  // Hashtags
  expect(content.hashtags[0]).toBe(camelHashtag(`${profession} ${city}`));
  expect(content.hashtags[1]).toBe(camelHashtag(city));
  expect(content.hashtags.length).toBeGreaterThanOrEqual(4);
  expect(content.hashtags.length).toBeLessThanOrEqual(8);
  for (const tag of content.hashtags) expect(tag).toMatch(HASHTAG_RE);
  expect(new Set(content.hashtags.map((t) => t.toLowerCase())).size).toBe(content.hashtags.length);

  // Texte alternatif, sources, voix
  expect(content.altText.length).toBeGreaterThanOrEqual(10);
  expect(content.altText.length).toBeLessThanOrEqual(300);
  expect(countEmoji(content.altText)).toBe(0);
  expect(content.sourceRefs.length).toBeGreaterThanOrEqual(1);
  for (const ref of content.sourceRefs) expect(ref.label.length).toBeGreaterThan(0);
  expect(content.voice).toEqual(brief.voice);
  expect(content.generator).toBe("mock");
  expect(checkSocialCompliance(post).ok).toBe(true);
}

// ─── Brouillons pour finalizePlan ───────────────────────────────────────────

const CAPTION =
  "Vous connaissez ce moment où tout s'accélère : le cœur, les pensées, les épaules qui remontent. 🌿\n\nEn séance, je vous accompagne pour retrouver des repères simples : une respiration qui s'allonge, un corps qui relâche, un esprit qui se pose.\n\nPour prendre rendez-vous, le lien est dans ma bio.\n\nClaire, sophrologue à Albi";

function draft(overrides: Partial<SocialPostDraft> = {}): SocialPostDraft {
  return {
    pillar: "specialite",
    format: "static",
    template: "affirmation",
    accentRole: "primary",
    topic: "Respirer avant de réagir",
    slides: [{ title: "Respirer avant de réagir", body: "Quand tout s'accélère, le souffle se raccourcit. **Trois respirations lentes** suffisent souvent à reprendre la main." }],
    caption: CAPTION,
    hashtags: ["#Sophrologie", "#GestionDuStress", "#Respiration"],
    altText: "Texte sur fond lavande : « Respirer avant de réagir ».",
    sourceRefs: ["section:home:hero"],
    ...overrides,
  };
}

function monthFinalize(f: Fixture, slots: SocialSlot[] = f.slots): FinalizeInput {
  return { kind: "month", ...monthInput(f), slots, generator: "mock" };
}

function requestFinalize(f: Fixture, format: "static" | "carousel" | "story" = "static", accentHex: string | null = null): FinalizeInput {
  return { kind: "request", ...requestInput(f, "un sujet", format, { accentHex }), generator: "anthropic" };
}

const cadenceSlots = (f: Fixture, n: number) => f.slots.filter((s) => s.kind === "cadence").slice(0, n);
const photoOfKind = (f: Fixture, kind: string) => f.brief.photos.find((p) => p.kind === kind)!;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fixture", () => {
  const f = fixture(CLAIRE);
  it("reproduit le mois de la conception : 8 créneaux cadence + 2 « nouvel article »", () => {
    expect(f.slots.map((s) => s.date)).toEqual([
      "2026-11-03", "2026-11-04", "2026-11-06", "2026-11-10", "2026-11-13", "2026-11-17", "2026-11-18", "2026-11-20", "2026-11-24", "2026-11-27",
    ]);
    expect(f.slots.filter((s) => s.kind === "nouvel_article").map((s) => s.articleId)).toEqual(["a1", "a2"]);
    expect(f.brief.articles).toHaveLength(3);
    expect(f.brief.home.specialties).toHaveLength(6);
    expect(photoOfKind(f, "about").portraitSafe).toBe(true);
    expect(photoOfKind(f, "hero").portraitSafe).toBe(false);
  });
});

describe("mock — mois", () => {
  const f = fixture(CLAIRE);

  it("est déterministe : même brief → même sortie", async () => {
    const a = await generator.planMonth(f.brief, monthInput(f));
    const b = await generator.planMonth(f.brief, monthInput(f));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("le brouillon mock respecte le schéma zod de la sortie du modèle", () => {
    const plan = mockSocialMonth(f.brief, monthInput(f));
    expect(() => socialPlanSchema.parse(plan)).not.toThrow();
    expect(plan.posts.map((p) => p.slot)).toEqual(f.slots.map((_, i) => i));
  });

  it("un contenu par créneau, aux dates des créneaux, bien formé et conforme", async () => {
    const posts = await generator.planMonth(f.brief, monthInput(f));
    expect(posts).toHaveLength(f.slots.length);
    expect(posts.map((p) => p.scheduledFor)).toEqual(f.slots.map((s) => s.date));
    for (const post of posts) expectWellFormed(post, f.brief);
  });

  it("créneaux « nouvel article » : pilier et template imposés, badge, photo et source de l'article", async () => {
    const posts = await generator.planMonth(f.brief, monthInput(f));
    const announced = posts.filter((p) => p.pillar === "nouvel_article");
    expect(announced.map((p) => p.scheduledFor)).toEqual(["2026-11-04", "2026-11-18"]);
    for (const [i, post] of announced.entries()) {
      expect(post.format).toBe("static");
      expect(post.template).toBe("photo-titre");
      expect(post.content.slides[0]?.badge).toBe(SOCIAL_NEW_ARTICLE_BADGE);
      expect(post.content.slides[0]?.imageUrl).toBe(PEXELS(10 + i));
      expect(post.content.sourceRefs[0]?.id).toBe(`article:a${i + 1}`);
      expect(post.content.caption.startsWith("Nouvel article sur mon site")).toBe(true);
    }
    // Les articles annoncés ne sont pas repris par les piliers article / conseil
    const reused = posts
      .filter((p) => p.pillar === "article" || p.pillar === "conseil")
      .flatMap((p) => p.content.sourceRefs.map((r) => r.id));
    expect(reused).not.toContain("article:a1");
    expect(reused).not.toContain("article:a2");
  });

  it("mix : ≥ 2 carrousels, exactement 1 story, jamais deux piliers consécutifs, pas d'avis en démo", async () => {
    const posts = await generator.planMonth(f.brief, monthInput(f));
    expect(posts.filter((p) => p.format === "carousel").length).toBeGreaterThanOrEqual(2);
    expect(posts.filter((p) => p.format === "story")).toHaveLength(1);
    for (let i = 1; i < posts.length; i++) expect(posts[i]!.pillar).not.toBe(posts[i - 1]!.pillar);
    expect(posts.some((p) => p.pillar === "avis")).toBe(false);
    expect(posts.some((p) => p.template === "avis")).toBe(false);
    // Pas deux contenus identiques dans le mois
    expect(new Set(posts.map((p) => p.content.slides[0]?.title)).size).toBe(posts.length);
  });

  it("légendes voicées : phrase de prudence sur conseil/article, signature, ville une fois hors titres", async () => {
    const posts = await generator.planMonth(f.brief, monthInput(f));
    for (const post of posts) {
      const prudent = post.content.caption.includes("La sophrologie ne se substitue pas à un avis médical.");
      if (post.pillar === "conseil" || post.pillar === "article") expect(prudent).toBe(true);
    }
    const stories = posts.filter((p) => p.format === "story");
    expect(stories[0]?.template).toBe("story-rappel");
  });

  it("sujets récents : une spécialité déjà exploitée n'est pas reprise", async () => {
    const baseline = await generator.planMonth(f.brief, monthInput(f));
    const used = baseline.filter((p) => p.pillar === "specialite").map((p) => p.content.slides[0]!.title);
    expect(used.length).toBeGreaterThan(0);
    const again = await generator.planMonth(f.brief, monthInput(f, used.map((t) => `Spécialité « ${t} »`)));
    for (const post of again.filter((p) => p.pillar === "specialite")) {
      expect(used).not.toContain(post.content.slides[0]!.title);
    }
  });

  it("site client avec avis : exactement un avis, cité à l'identique", async () => {
    const client = fixture(CLAIRE, "client");
    expect(client.brief.reviews.length).toBeGreaterThan(0);
    const posts = await generator.planMonth(client.brief, monthInput(client));
    const avis = posts.filter((p) => p.pillar === "avis");
    expect(avis).toHaveLength(1);
    expect(avis[0]!.template).toBe("avis");
    expect(avis[0]!.content.slides[0]!.title.startsWith("«")).toBe(true);
    expect(avis[0]!.content.sourceRefs[0]!.kind).toBe("review");
    for (const post of posts) expectWellFormed(post, client.brief);
  });

  it("peu de créneaux : au moins un carrousel, pas de story", async () => {
    const short = { ...f, slots: cadenceSlots(f, 3) };
    const posts = await generator.planMonth(short.brief, monthInput(short));
    expect(posts).toHaveLength(3);
    expect(posts.filter((p) => p.format === "carousel").length).toBeGreaterThanOrEqual(1);
    expect(posts.filter((p) => p.format === "story")).toHaveLength(0);
  });

  it.each(PROFESSIONS)("$profession à $city : mois conforme au marketing éthique et social", async (input) => {
    const client = fixture(input, "client");
    const posts = await generator.planMonth(client.brief, monthInput(client, [], "2026-12"));
    expect(posts).toHaveLength(client.slots.length);
    for (const post of posts) expectWellFormed(post, client.brief);
    expect(posts.filter((p) => p.format === "carousel").length).toBeGreaterThanOrEqual(2);
    expect(posts.filter((p) => p.format === "story")).toHaveLength(1);
    // Toutes les voix
    for (const designation of ["je", "nous", "on"] as const) {
      for (const reader of ["vous", "tu"] as const) {
        const voiced: SocialSiteBrief = { ...client.brief, voice: { designation, accord: input.gender, reader, tone: "direct" } };
        const voicedPosts = await generator.planMonth(voiced, monthInput(client));
        expect(checkSocialCompliance(voicedPosts).ok).toBe(true);
        for (const post of voicedPosts) expect(post.content.voice).toEqual(voiced.voice);
        // Les phrases écrites par le mock suivent la voix (le texte cité du site garde la sienne)
        const infos = voicedPosts.find((p) => p.pillar === "infos_pratiques")!.content.caption;
        expect(infos).toContain(reader === "tu" ? "N'hésite pas à" : "N'hésitez pas à");
        expect(infos).toContain(designation === "je" ? "me contacter" : "nous contacter");
        expect(infos).toContain(designation === "je" ? "je réponds" : designation === "nous" ? "nous répondons" : "on répond");
        const specialite = voicedPosts.find((p) => p.pillar === "specialite")!.content.caption;
        expect(specialite.startsWith(reader === "tu" ? "Un temps pour toi, rien que pour toi" : "Un temps pour vous, rien que pour vous")).toBe(true);
      }
    }
  });
});

describe("mock — requête", () => {
  const f = fixture(CLAIRE);

  it("relie la demande à la spécialité la plus proche, format et date imposés, source « Votre demande »", async () => {
    const post = await generator.generateRequest(
      f.brief,
      requestInput(f, "un carrousel sur la respiration avant un entretien d'embauche", "carousel", { accentHex: "#334155" }),
    );
    expectWellFormed(post, f.brief);
    expect(post.scheduledFor).toBe("2026-11-12");
    expect(post.format).toBe("carousel");
    expect(post.template).toBe("carrousel-etapes");
    expect(post.pillar).toBe("specialite");
    expect(post.content.sourceRefs.map((r) => r.id)).toContain("section:home:specialties:gestion-du-stress");
    expect(post.content.sourceRefs.at(-1)).toEqual(REQUEST_SOURCE_REF);
  });

  it("story « RDV le samedi » : infos pratiques sans citer de jour, note d'adaptation", async () => {
    const post = await generator.generateRequest(f.brief, requestInput(f, "story pour dire que je prends des RDV le samedi", "story", { scheduledFor: "2026-11-14" }));
    expectWellFormed(post, f.brief);
    expect(post.format).toBe("story");
    expect(post.template).toBe("story-rappel");
    expect(post.pillar).toBe("infos_pratiques");
    expect(post.content.note?.startsWith("Nous avons adapté votre demande")).toBe(true);
    expect(JSON.stringify(post.content.slides)).not.toMatch(/samedi/i);
  });

  it("couleur en toutes lettres → accentRole ; sujet inconnu → projection", async () => {
    const sombre = await generator.generateRequest(f.brief, requestInput(f, "une story sombre sur le sommeil", "story"));
    expect(sombre.content.accentRole).toBe("deep");
    const foncee = await generator.generateRequest(f.brief, requestInput(f, "version foncée : la confiance en soi", "static"));
    expect(foncee.content.accentRole).toBe("primaryDark");
    const douce = await generator.generateRequest(f.brief, requestInput(f, "les licornes du jardin, en version douce", "static"));
    expect(douce.content.accentRole).toBe("soft");
    expect(douce.pillar).toBe("projection");
    expectWellFormed(douce, f.brief);
  });

  it("« avis » : pilier avis pour un client, jamais en démo ; question fréquente reconnue", async () => {
    const client = fixture(CLAIRE, "client");
    const avis = await generator.generateRequest(client.brief, requestInput(client, "mettre en avant un avis", "static"));
    expect(avis.pillar).toBe("avis");
    expect(avis.template).toBe("avis");
    const demo = await generator.generateRequest(f.brief, requestInput(f, "mettre en avant un avis", "static"));
    expect(demo.pillar).not.toBe("avis");
    const faq = await generator.generateRequest(f.brief, requestInput(f, "faut-il une préparation particulière avant de venir ?", "static"));
    expect(faq.pillar).toBe("idee_recue");
    expect(faq.template).toBe("question-reponse");
  });

  it("chaque pilier sait se rendre dans les trois formats, sur tous les métiers", async () => {
    const topics = ["un avis", "mes tarifs et mon adresse", "comment se déroule une séance", "le sommeil", "faut-il une préparation particulière", "les licornes"];
    for (const input of PROFESSIONS) {
      const client = fixture(input, "client");
      for (const topic of topics) {
        for (const format of ["static", "carousel", "story"] as const) {
          const post = await generator.generateRequest(client.brief, requestInput(client, topic, format));
          expect(post.format).toBe(format);
          expectWellFormed(post, client.brief);
        }
      }
    }
  });

  it("le brouillon de requête respecte le schéma", () => {
    const plan = mockSocialRequest(f.brief, requestInput(f, "le sommeil avant la rentrée", "static"));
    expect(() => socialPlanSchema.parse(plan)).not.toThrow();
    expect(plan.posts).toHaveLength(1);
  });
});

describe("finalizePlan — dates, format, template", () => {
  const f = fixture(CLAIRE);

  it("réaffecte les posts aux créneaux par « slot », sinon dans l'ordre ; surplus ignoré", () => {
    const slots = cadenceSlots(f, 3);
    const posts = finalizePlan(
      { posts: [draft({ slot: 2, topic: "Troisième" }), draft({ slot: 0, topic: "Premier" }), draft({ topic: "Deuxième" }), draft({ topic: "Surplus" })] },
      f.brief,
      monthFinalize(f, slots),
    );
    expect(posts.map((p) => [p.scheduledFor, p.topic])).toEqual([
      [slots[0]!.date, "Premier"],
      [slots[1]!.date, "Deuxième"],
      [slots[2]!.date, "Troisième"],
    ]);
  });

  it("un « slot » hors bornes ou en double est traité comme absent", () => {
    const slots = cadenceSlots(f, 2);
    const posts = finalizePlan({ posts: [draft({ slot: 9, topic: "A" }), draft({ slot: 0, topic: "B" }), draft({ slot: 0, topic: "C" })] }, f.brief, monthFinalize(f, slots));
    expect(posts.map((p) => p.topic)).toEqual(["B", "A"]);
  });

  it("requête : date et format imposés, accentRole conservé, « Votre demande » ajouté", () => {
    const [post] = finalizePlan({ posts: [draft({ format: "static", accentRole: "deep", sourceRefs: ["section:home:specialties:gestion-du-stress"] })] }, f.brief, requestFinalize(f, "story", "#112233"));
    expect(post!.scheduledFor).toBe("2026-11-12");
    expect(post!.format).toBe("story");
    expect(post!.template).toBe("affirmation");
    expect(post!.content.accentRole).toBe("deep");
    expect(post!.content.generator).toBe("anthropic");
    expect(post!.content.sourceRefs.map((r) => r.id)).toEqual(["section:home:specialties:gestion-du-stress", "request"]);
    expect(post!.content.sourceRefs[0]!.label).toBe("Spécialité « Gestion du stress »");
  });

  it("template incompatible avec le format → défaut du format", () => {
    const [story] = finalizePlan({ posts: [draft({ template: "liste-conseils" })] }, f.brief, requestFinalize(f, "story"));
    expect(story!.template).toBe("story-rappel");
    const [stat] = finalizePlan({ posts: [draft({ template: "carrousel-etapes" })] }, f.brief, requestFinalize(f, "static"));
    expect(stat!.template).toBe("affirmation");
    const [carousel] = finalizePlan(
      { posts: [draft({ template: "question-reponse", slides: [{ title: "Couverture", body: "Sous-titre." }, { title: "Page", body: "**Une idée** par page." }] })] },
      f.brief,
      requestFinalize(f, "carousel"),
    );
    expect(carousel!.template).toBe("carrousel-etapes");
  });

  it("avis sans avis valide (démo) → projection / affirmation sur le titre du site", () => {
    const [post] = finalizePlan(
      { posts: [draft({ pillar: "avis", template: "avis", slides: [{ title: "« Un vrai calme »", body: "Marie D. · Avis Google" }], sourceRefs: ["review:inconnu"] })] },
      f.brief,
      requestFinalize(f),
    );
    expect(post!.pillar).toBe("projection");
    expect(post!.template).toBe("affirmation");
    expect(post!.content.slides[0]!.title).toContain("Un espace pour relâcher");
    expect(post!.content.sourceRefs[0]!.id).toBe("section:home:hero");
  });

  it("mois : au plus un avis (client), le second devient projection", () => {
    const client = fixture(CLAIRE, "client");
    const review = client.brief.reviews[0]!;
    const avis = () => draft({ pillar: "avis", template: "avis", slides: [{ title: `« ${review.text.slice(0, 40)} »`, body: `${review.authorName} · Avis Google` }], sourceRefs: [review.id] });
    const posts = finalizePlan({ posts: [avis(), draft({ pillar: "conseil" }), avis()] }, client.brief, monthFinalize(client, cadenceSlots(client, 3)));
    expect(posts.map((p) => p.pillar)).toEqual(["avis", "conseil", "projection"]);
    expect(posts[0]!.template).toBe("avis");
    expect(posts[2]!.template).toBe("affirmation");
  });

  it("mois : deux piliers consécutifs identiques sont échangés avec un post suivant", () => {
    const posts = finalizePlan(
      { posts: [draft({ pillar: "specialite", topic: "S1" }), draft({ pillar: "specialite", topic: "S2" }), draft({ pillar: "conseil", topic: "C" })] },
      f.brief,
      monthFinalize(f, cadenceSlots(f, 3)),
    );
    expect(posts.map((p) => p.pillar)).toEqual(["specialite", "conseil", "specialite"]);
    expect(posts.map((p) => p.topic)).toEqual(["S1", "C", "S2"]);
  });

  it("créneau « nouvel article » : pilier, template, badge et photo de l'article imposés", () => {
    const slot = f.slots.find((s) => s.kind === "nouvel_article")!;
    const posts = finalizePlan(
      { posts: [draft({ pillar: "projection", format: "carousel", template: "carrousel-etapes", slides: [{ title: "Titre libre", body: "Corps." }, { title: "Page", body: "x" }], sourceRefs: ["section:home:hero"] })] },
      f.brief,
      monthFinalize(f, [slot]),
    );
    expect(posts[0]!.pillar).toBe("nouvel_article");
    expect(posts[0]!.format).toBe("static");
    expect(posts[0]!.template).toBe("photo-titre");
    expect(posts[0]!.content.slides).toHaveLength(1);
    expect(posts[0]!.content.slides[0]!.badge).toBe(SOCIAL_NEW_ARTICLE_BADGE);
    expect(posts[0]!.content.slides[0]!.imageUrl).toBe(PEXELS(10));
    expect(posts[0]!.content.sourceRefs[0]!.id).toBe("article:a1");
  });
});

describe("finalizePlan — diapositives, photos, textes", () => {
  const f = fixture(CLAIRE);

  it("carrousel : rôles, clamp à 5 pages, CTA écrite par le code et accordée à la voix", () => {
    const slides = Array.from({ length: 6 }, (_, i) => ({ title: `Diapo ${i}`, body: `**Idée ${i}** en une phrase.` }));
    const [post] = finalizePlan({ posts: [draft({ template: "carrousel-etapes", slides })] }, f.brief, requestFinalize(f, "carousel"));
    expect(post!.content.slides.map((s) => s.role)).toEqual(["cover", "page", "page", "page", "page", "page", "cta"]);
    expect(post!.content.slides.at(-1)).toEqual({ role: "cta", title: SOCIAL_CTA_TITLE, body: "Je vous accueille **sur rendez-vous** à Albi." });
    const tu: SocialSiteBrief = { ...f.brief, voice: { designation: "nous", accord: "feminin", reader: "tu", tone: "direct" } };
    const [voiced] = finalizePlan({ posts: [draft({ template: "carrousel-article", slides: slides.slice(0, 3) })] }, tu, requestFinalize(f, "carousel"));
    expect(voiced!.content.slides.at(-1)).toEqual({ role: "cta", title: SOCIAL_ARTICLE_CTA_TITLE, body: "Nous t'accueillons **sur rendez-vous** à Albi." });
  });

  it("carrousel incomplet : erreur en requête, post écarté dans un mois", () => {
    const incomplete = draft({ format: "carousel", template: "carrousel-etapes", slides: [{ title: "Seule", body: "x" }] });
    expect(() => finalizePlan({ posts: [incomplete] }, f.brief, requestFinalize(f, "carousel"))).toThrow(/carrousel incomplet/);
    const posts = finalizePlan({ posts: [incomplete, draft({ topic: "Valide" })] }, f.brief, monthFinalize(f, cadenceSlots(f, 2)));
    expect(posts.map((p) => p.topic)).toEqual(["Valide"]);
    expect(() => finalizePlan({ posts: [incomplete] }, f.brief, monthFinalize(f, cadenceSlots(f, 1)))).toThrow(/carrousel incomplet/);
  });

  it("photos : imageRef inconnu retiré (photo-titre → affirmation), couverture seule en carrousel", () => {
    const [unknown] = finalizePlan({ posts: [draft({ template: "photo-titre", slides: [{ title: "T", body: "**Deux mots** ici.", imageRef: "p99" }] })] }, f.brief, requestFinalize(f));
    expect(unknown!.template).toBe("affirmation");
    expect(unknown!.content.slides[0]!.imageUrl).toBeUndefined();
    const motif = photoOfKind(f, "motif");
    const [carousel] = finalizePlan(
      { posts: [draft({ template: "carrousel-etapes", slides: [{ title: "Cover", body: "x", imageRef: motif.id }, { title: "Page", body: "y", imageRef: motif.id }] })] },
      f.brief,
      requestFinalize(f, "carousel"),
    );
    expect(carousel!.content.slides[0]!.imageUrl).toBe(f.photosById[motif.id]);
    expect(carousel!.content.slides[1]!.imageUrl).toBeUndefined();
    const [noPhoto] = finalizePlan({ posts: [draft({ template: "question-reponse", slides: [{ title: "Q ?", body: "R.", imageRef: motif.id }] })] }, f.brief, requestFinalize(f));
    expect(noPhoto!.content.slides[0]!.imageUrl).toBeUndefined();
  });

  it("photos non « portraitSafe » : jamais pour coulisses / infos pratiques ni avec un badge « qui je suis »", () => {
    const hero = photoOfKind(f, "hero");
    const about = photoOfKind(f, "about");
    const slide = (imageRef: string, badge?: string) => [{ title: "T", body: "**Deux mots** ici.", imageRef, ...(badge ? { badge } : {}) }];
    const run = (pillar: SocialPostDraft["pillar"], imageRef: string, badge?: string) =>
      finalizePlan({ posts: [draft({ pillar, template: "photo-titre", slides: slide(imageRef, badge) })] }, f.brief, requestFinalize(f))[0]!.content.slides[0]!.imageUrl;
    expect(run("coulisses", hero.id)).toBeUndefined();
    expect(run("infos_pratiques", hero.id)).toBeUndefined();
    expect(run("specialite", hero.id)).toBe(FAL);
    expect(run("specialite", hero.id, "Qui je suis")).toBeUndefined();
    expect(run("specialite", hero.id, "Votre sophrologue")).toBeUndefined();
    expect(run("coulisses", about.id)).toBe(BLOB);
    expect(run("coulisses", about.id, "Qui je suis")).toBe(BLOB);
  });

  it("photo-titre sans imageRef : photo de la source (spécialité) en repli", () => {
    const spec = f.brief.home.specialties.find((s) => s.photoId)!;
    const [post] = finalizePlan({ posts: [draft({ template: "photo-titre", sourceRefs: [spec.id] })] }, f.brief, requestFinalize(f));
    expect(post!.template).toBe("photo-titre");
    expect(post!.content.slides[0]!.imageUrl).toBe(f.photosById[spec.photoId!]);
  });

  it("textes : emojis et gras retirés du titre, un seul gras, troncatures, listes ≤ 3, liens aplatis, U+202F", () => {
    const [post] = finalizePlan(
      {
        posts: [
          draft({
            slides: [
              {
                title: "**Respirer** 🌿 avant de réagir, même quand la journée déborde de toutes parts",
                body: `Voir [le site](https://x.fr)\u202f: **un** souffle 🧘 et **deux** gestes.\n- a\n- b\n- c\n- d\n- e`,
              },
            ],
            topic: "🌿 Un sujet **gras** qui dépasse largement les soixante-dix caractères autorisés ici",
            altText: "Visuel ✨ avec **gras**",
            note: "Nous avons adapté votre demande : " + "x".repeat(300),
          }),
        ],
      },
      f.brief,
      requestFinalize(f),
    );
    const slide = post!.content.slides[0]!;
    expect(slide.title).toBe("Respirer avant de réagir, même quand la journée déborde de…");
    expect(slide.title.length).toBeLessThanOrEqual(60);
    expect(slide.body).toBe("Voir le site\u00a0: **un** souffle et deux gestes.\n- a\n- b\n- c");
    expect(post!.topic.length).toBeLessThanOrEqual(70);
    expect(post!.topic).not.toMatch(/\*\*|🌿/);
    expect(post!.content.altText).toBe("Visuel avec gras");
    expect(post!.content.note!.length).toBeLessThanOrEqual(200);
    expect(post!.content.note!.startsWith("Nous avons adapté votre demande")).toBe(true);
  });

  it("body long : tronqué au mot sous la limite, gras refermé", () => {
    const long = `**${"mot ".repeat(10).trim()}** ${"texte ".repeat(60)}`;
    const [stat] = finalizePlan({ posts: [draft({ slides: [{ title: "T", body: long }] })] }, f.brief, requestFinalize(f));
    expect(stat!.content.slides[0]!.body.length).toBeLessThanOrEqual(200);
    expect(stat!.content.slides[0]!.body.endsWith("…")).toBe(true);
    expect(boldCount(stat!.content.slides[0]!.body)).toBe(1);
    const cut = `Un début ordinaire ${"texte ".repeat(28)}**passage en gras très long ${"mot ".repeat(20)}**`;
    const [page] = finalizePlan({ posts: [draft({ template: "carrousel-etapes", slides: [{ title: "C", body: "x" }, { title: "P", body: cut }] })] }, f.brief, requestFinalize(f, "carousel"));
    const body = page!.content.slides[1]!.body;
    expect(body.length).toBeLessThanOrEqual(160);
    expect((body.match(/\*\*/g) ?? []).length % 2).toBe(0);
  });

  it("légende : markdown retiré, hashtags déplacés, ≤ 3 emojis, première ligne ≤ 125 sans perte, ≤ 2 000 caractères", () => {
    const caption = `${"Vous connaissez ce moment où tout s'accélère et où les pensées s'emballent sans jamais s'arrêter. Le cœur bat vite, les épaules remontent."} 🌿🌿🌿🌿🌿\n\nEn **séance**, je vous [accompagne](https://x.fr). #Sophrologie #gestion du stress\n\n${SOCIAL_BIO_LINE}\n\nClaire, sophrologue à Albi #Albi`;
    const [post] = finalizePlan({ posts: [draft({ caption, hashtags: ["#Respiration", "#respiration", "#Tarn", "#A", "#Un Deux", "#Zen", "#Calme", "#Sommeil", "#Trop"] })] }, f.brief, requestFinalize(f));
    const out = post!.content.caption;
    expect(firstLine(out)).toBe("Vous connaissez ce moment où tout s'accélère et où les pensées s'emballent sans jamais s'arrêter.");
    expect(out.split("\n")[2]).toBe("Le cœur bat vite, les épaules remontent. 🌿🌿🌿");
    expect(countEmoji(out)).toBe(3);
    expect(out).not.toMatch(/\*\*|#\w|\]\(/);
    expect(out).toContain("En séance, je vous accompagne.");
    expect(out.endsWith("Claire, sophrologue à Albi")).toBe(true);
    expect(post!.content.hashtags).toEqual(["#SophrologueAlbi", "#Albi", "#Respiration", "#Tarn", "#UnDeux", "#Zen", "#Calme", "#Sommeil"]);
    const [huge] = finalizePlan({ posts: [draft({ caption: `${"Une phrase courte. ".repeat(150)}` })] }, f.brief, requestFinalize(f));
    expect(huge!.content.caption.length).toBeLessThanOrEqual(2000);
    expect(huge!.content.caption.endsWith(".")).toBe(true);
  });

  it("première ligne sans fin de phrase : coupure à la virgule puis au mot", () => {
    const [post] = finalizePlan({ posts: [draft({ caption: `${"mot ".repeat(40)}, ${"fin ".repeat(10)}\n\n${CAPTION}` })] }, f.brief, requestFinalize(f));
    expect(firstLine(post!.content.caption).length).toBeLessThanOrEqual(125);
    expect(post!.content.caption.replace(/\s+/g, " ")).toContain("fin fin");
  });

  it("sources : ids inconnus retirés, vide → accueil, libellés enrichis", () => {
    const [post] = finalizePlan({ posts: [draft({ sourceRefs: ["section:home:faq:2", "page:nope", "article:a3", "section:home:faq:2"] })] }, f.brief, requestFinalize(f));
    expect(post!.content.sourceRefs.map((r) => r.id)).toEqual(["section:home:faq:2", "article:a3", "request"]);
    expect(post!.content.sourceRefs[0]!.label.startsWith("Question fréquente «")).toBe(true);
    expect(post!.content.sourceRefs[1]!.href).toBe("/publications/a3");
    const [empty] = finalizePlan({ posts: [draft({ sourceRefs: ["inconnu"] })] }, f.brief, monthFinalize(f, cadenceSlots(f, 1)));
    expect(empty!.content.sourceRefs.map((r) => r.id)).toEqual(["section:home:hero"]);
  });
});

describe("règles sociales", () => {
  const detected = (text: string) =>
    SOCIAL_FORBIDDEN_PATTERNS.filter(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    }).map((p) => p.rule);

  it("détecte les formulations interdites", () => {
    expect(detected("photos avant/après")).toEqual(["avant/après"]);
    expect(detected("3 séances suffisent")).toEqual(["promesse chiffrée"]);
    expect(detected("5 séances pour retrouver le sommeil")).toEqual(["promesse chiffrée"]);
    expect(detected("95 % de réussite")).toEqual(["taux de réussite"]);
    expect(detected("-20 % ce mois-ci")).toEqual(["réduction"]);
    expect(detected("objectif perte de poids")).toEqual(["perte de poids"]);
    expect(detected("sans effets secondaires")).toEqual(["innocuité"]);
    expect(detected("dernières places disponibles")).toEqual(["urgence commerciale"]);
    expect(detected("PROMO de rentrée")).toEqual(["urgence commerciale"]);
    expect(detected("le meilleur sophrologue")).toEqual(["promesse excessive"]);
    expect(detected("VENEZ VITE")).toEqual(["majuscules criées"]);
  });

  it("évite les faux positifs", () => {
    for (const text of ["sans résultat", "séance de 60 minutes", "soigneusement", "le résultat d'une séance", "5 séances pour avancer", "CB, chèque ou espèces", "une pause de 10 minutes"]) {
      expect(detected(text)).toEqual([]);
    }
    expect(checkSocialCompliance({ a: "Un espace calme, propice au lâcher-prise." }).ok).toBe(true);
  });

  it("checkSocialCompliance cumule règles sociales et marketing éthique", () => {
    const { ok, violations } = checkSocialCompliance({ posts: [{ caption: "Nous allons guérir votre dos avant/après la séance" }] });
    expect(ok).toBe(false);
    expect(violations.map((v) => v.rule)).toEqual(["avant/après", "promesse de guérison"]);
  });

  it("superRefine : un plan non conforme fait échouer le schéma avec un message court", () => {
    const plan = { posts: [draft({ caption: `${CAPTION} Résultat garanti avant/après, 3 séances suffisent !` })] };
    try {
      socialPlanSchema.parse(plan);
      expect.unreachable("le plan aurait dû être refusé");
    } catch (err) {
      expect(err).toBeInstanceOf(ZodError);
      const message = (err as ZodError).issues[0]!.message;
      expect(message.startsWith("Marketing social interdit : [")).toBe(true);
      expect(message.length).toBeLessThanOrEqual(220);
    }
    const { accentRole: _omitted, ...withoutAccent } = draft();
    const parsed = socialPlanSchema.parse({ posts: [withoutAccent] });
    expect(parsed.posts[0]!.accentRole).toBe("primary");
  });
});

describe("prompts", () => {
  const f = fixture(CLAIRE);

  it("prompt système : voix, ville, hashtags obligatoires, règles sociales", () => {
    const prompt = socialSystemPrompt(f.brief);
    expect(prompt).toContain("« je » (première personne du singulier), accords au feminin");
    expect(prompt).toContain("Adresse au lecteur : vouvoiement.");
    expect(prompt).toContain("Ton : chaleureux et accueillant.");
    expect(prompt).toContain("La ville « Albi » apparaît une fois dans chaque légende");
    expect(prompt).toContain("dont obligatoirement #SophrologueAlbi et #Albi");
    expect(prompt).toContain("RÈGLES SOCIALES");
    expect(prompt).toContain("N'ÉCRIS PAS la page finale d'appel à l'action");
  });

  it("prompt du mois : brief, créneaux indexés, article imposé, mix et contraintes", () => {
    const prompt = socialMonthUserPrompt(f.brief, monthInput(f, ["Respirer avant de réagir"]));
    expect(prompt).toContain(JSON.stringify(f.brief));
    expect(prompt).toContain("0. 2026-11-03\n1. 2026-11-04 — pilier nouvel_article imposé (article article:a1, template photo-titre, badge « Nouvel article »)");
    expect(prompt).toContain("SUJETS DÉJÀ PUBLIÉS RÉCEMMENT (ne pas les répéter) : Respirer avant de réagir");
    expect(prompt).toContain("MIX ATTENDU pour les 8 créneaux de cadence");
    expect(prompt).toContain("au moins 2 carrousels et exactement 1 story");
    expect(prompt).toContain("(aucun avis disponible : n'utilise pas ce pilier)");
    for (const pillar of availablePillars(f.brief)) expect(prompt).toContain(`- ${pillar} : ${PILLAR_HELP[pillar]}`);
    expect(prompt).not.toContain("- avis :");
    const client = fixture(CLAIRE, "client");
    expect(socialMonthUserPrompt(client.brief, monthInput(client))).toContain("- avis : un avis Google cité à l'identique");
    const noArticle: SocialSiteBrief = { ...f.brief, articles: [] };
    expect(socialMonthUserPrompt(noArticle, monthInput(f))).toContain("Aucun article de blog");
  });

  it("prompt de requête : demande, format, couleur, date", () => {
    const prompt = socialRequestUserPrompt(f.brief, requestInput(f, "la respiration avant un entretien", "carousel", { accentHex: "#334155" }));
    expect(prompt).toContain("DEMANDE DU PRATICIEN : « la respiration avant un entretien »");
    expect(prompt).toContain("FORMAT IMPOSÉ : carousel (couverture + 2 à 5 pages ; la page finale est ajoutée automatiquement)");
    expect(prompt).toContain("COULEUR DOMINANTE : #334155 (choisie par le praticien");
    expect(prompt).toContain("DATE DE PUBLICATION : 2026-11-12");
    expect(socialRequestUserPrompt(f.brief, requestInput(f, "x", "static"))).toContain("COULEUR DOMINANTE : automatique (choisis accentRole)");
  });

  it("rotation des piliers : déterministe, piliers indisponibles exclus", () => {
    expect(rotatePillars(f.brief, "2026-11")).toEqual(rotatePillars(f.brief, "2026-11"));
    expect(availablePillars(f.brief)).not.toContain("avis");
    expect(availablePillars(f.brief)).not.toContain("nouvel_article");
    expect(availablePillars({ ...f.brief, articles: [] })).not.toContain("article");
    expect(availablePillars(fixture(CLAIRE, "client").brief)).toContain("avis");
    const months = new Set(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].map((m) => rotatePillars(f.brief, m)[0]));
    expect(months.size).toBeGreaterThan(1);
  });
});

describe("createSocialGenerator", () => {
  it("mode mock avec AI_MOCK=1 (même avec une clé), anthropic avec une clé seule", () => {
    expect(createSocialGenerator({ AI_MOCK: "1", ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createSocialGenerator({} as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createSocialGenerator({ ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv).mode).toBe("anthropic");
  });
});
