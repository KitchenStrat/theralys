import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { externalSites, type Database, type Site } from "@theralys/db";
import {
  DEFAULT_SOCIAL_VOICE,
  buildSocialBrief,
  cleanExternalProfile,
  type ExternalSiteFacts,
  type ExternalSiteProfile,
  type ExternalSiteSetting,
  type Section,
  type SiteTheme,
} from "@theralys/shared";
import { loadGoogleBrief, publicSiteUrl, siteUrl } from "./google-brief";

// Le lecteur de site réel n'a rien à faire dans ces tests : son module n'est pas chargé
vi.mock("@theralys/providers/website", () => ({
  createWebsiteReader: () => {
    throw new Error("Lecteur réel interdit dans les tests");
  },
  pastedTextToPages: () => {
    throw new Error("Lecteur réel interdit dans les tests");
  },
}));

const NOW = new Date("2026-11-12T09:00:00Z");
const DAY_MS = 86_400_000;
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const PROSPECT_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_URL = "https://www.cabinet-dupont.fr";
const HOSTED_URL = "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi";
const HERO_IMAGE = "https://images.pexels.com/photos/1/hero.jpeg";
const ABOUT_IMAGE = "https://abc.public.blob.vercel-storage.com/portrait.jpg";
const MOTIF_IMAGE = "https://images.pexels.com/photos/2/sommeil.jpeg";

const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux", disabledMotifs: ["gestion-du-stress"] };
const ACTIVE: ExternalSiteSetting = { url: EXTERNAL_URL, active: true };

const SITE: Site = {
  id: SITE_ID,
  type: "client",
  status: "published",
  slug: "claire-dupont-sophrologue-albi",
  domain: null,
  name: "Claire Dupont, sophrologue à Albi",
  plan: "scale",
  language: "fr",
  bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
  theme: THEME,
  prospectId: PROSPECT_ID,
  highlightedMotifs: [],
  demoExpiresAt: null,
  generationProgress: { home: true, motifs: true, reviews: true, articles: true },
  generationError: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const PROSPECT = { id: PROSPECT_ID, firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin" as const, googleRating: 4.9, googleReviewCount: 31 };

const HOME_SECTIONS: Section[] = [
  { type: "hero", title: "Sophrologie à Albi", paragraphs: ["Un accompagnement sur mesure, en cabinet."], imageUrl: HERO_IMAGE },
  {
    type: "specialties",
    title: "Spécialités",
    items: [
      { slug: "sommeil", title: "Troubles du sommeil", excerpt: "Retrouver des nuits réparatrices." },
      { slug: "gestion-du-stress", title: "Stress au travail", excerpt: "Page désactivée sur le site hébergé." },
    ],
  },
  { type: "about", title: "À propos", paragraphs: ["Sophrologue depuis dix ans."], imageUrl: ABOUT_IMAGE },
];
const PAGES = [
  { id: "p-home", type: "home" as const, slug: "", title: "Accueil", metaDescription: null, sections: HOME_SECTIONS },
  { id: "p-sommeil", type: "motif" as const, slug: "sommeil", title: "Troubles du sommeil", metaDescription: "Retrouver des nuits réparatrices.", sections: [{ type: "hero", title: "Troubles du sommeil", paragraphs: [], imageUrl: MOTIF_IMAGE }] satisfies Section[] },
  { id: "p-stress", type: "motif" as const, slug: "gestion-du-stress", title: "Stress au travail", metaDescription: null, sections: [] },
];
const ARTICLES = [
  { id: "a-ligne", slug: "bien-dormir", title: "Bien dormir : trois exercices simples", excerpt: "Des exercices à faire le soir.", content: "## Pourquoi\n\nLe sommeil se prépare dans la journée.", imageUrl: null, status: "published", publishAt: new Date(NOW.getTime() - 10 * DAY_MS) },
  { id: "a-venir", slug: "respirer", title: "Respirer avant un examen", excerpt: "Une respiration pour se poser.", content: "## Comment\n\nInspirez lentement.", imageUrl: null, status: "scheduled", publishAt: new Date(NOW.getTime() + 5 * DAY_MS) },
];
const REVIEWS = [{ id: "r1", authorName: "Jeanne Martin", rating: 5, text: "Des séances très apaisantes, je dors enfin mieux depuis quelques semaines." }];
const BLOG_SETTINGS = { voiceDesignation: "je" as const, voiceAccord: "feminin" as const, voiceReader: "vous" as const, voiceTone: "chaleureux" as const };

const PROFILE: ExternalSiteProfile = cleanExternalProfile(
  {
    headline: "La sophrologie pour retrouver calme et énergie",
    intro: ["Claire Dupont vous accueille à Albi."],
    specialties: [
      { title: "Gestion du stress", excerpt: "Relâcher les tensions.", url: `${EXTERNAL_URL}/gestion-du-stress`, headings: [], faq: [] },
      { title: "Préparation aux examens", excerpt: "Aborder les épreuves sereinement.", headings: [], faq: [] },
    ],
    about: { paragraphs: ["Sophrologue certifiée."], credentials: [] },
    contact: { address: "12 rue de la Paix, 81000 Albi", hours: [] },
  },
  EXTERNAL_URL,
);
const FACTS: ExternalSiteFacts = { phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} };

type Rows = Partial<Record<"sites" | "prospects" | "pages" | "blogArticles" | "googleReviews" | "socialSettings" | "blogSettings", unknown[]>>;

/**
 * Base minimale : `db.query.<table>.findFirst / findMany` rendent les lignes
 * que le test associe à la table (les conditions ne sont pas évaluées), et la
 * seule requête `select … from external_sites` rend la ligne du site du
 * client. Chaque lecture est journalisée.
 */
function fakeDb(rows: Rows, external: unknown[] | Error = []) {
  const log: string[] = [];
  const query = new Proxy(
    {},
    {
      get: (_target, table: string) => ({
        findFirst: async () => {
          log.push(`query ${table}`);
          return (rows as Record<string, unknown[] | undefined>)[table]?.[0];
        },
        findMany: async () => {
          log.push(`query ${table}`);
          return (rows as Record<string, unknown[] | undefined>)[table] ?? [];
        },
      }),
    },
  );
  const select = () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => {
          if (table !== externalSites) throw new Error("Requête non simulée");
          log.push("select external_sites");
          if (external instanceof Error) throw external;
          return external;
        },
      }),
    }),
  });
  return { db: { query, select } as unknown as Database, log };
}

const seed = (site: Site = SITE, overrides: Rows = {}): Rows => ({ sites: [site], prospects: [PROSPECT], pages: PAGES, blogArticles: ARTICLES, googleReviews: REVIEWS, socialSettings: [], blogSettings: [BLOG_SETTINGS], ...overrides });
const externalRow = (overrides: Record<string, unknown> = {}) => ({ url: EXTERNAL_URL, status: "ready", profile: PROFILE, overrides: null, facts: FACTS, ...overrides });

/** Le brief tel qu'il était construit avant le site du client : pages et adresse du site hébergé, sans `hostedUrl`. */
function hostedBrief(site: Site) {
  return buildSocialBrief({
    site: { id: site.id, name: site.name, type: site.type, theme: site.theme, bookingUrl: site.bookingUrl, url: HOSTED_URL },
    prospect: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin", googleRating: 4.9, googleReviewCount: 31 },
    pages: PAGES,
    articles: ARTICLES,
    reviews: REVIEWS,
    voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
    instructions: null,
    practiceName: "la sophrologie",
    now: NOW,
  });
}

beforeEach(() => {
  vi.stubEnv("SITES_BASE_URL", "https://demo.harmony-web.fr");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl (jobs)", () => {
  it("domaine personnalisé en https, sinon SITES_BASE_URL + slug (barre finale tolérée), repli localhost", () => {
    expect(siteUrl({ slug: "claire", domain: "claire-sophrologie.fr" }, {} as NodeJS.ProcessEnv)).toBe("https://claire-sophrologie.fr");
    expect(siteUrl({ slug: "claire", domain: null }, { SITES_BASE_URL: "https://demo.harmony-web.fr/" } as NodeJS.ProcessEnv)).toBe("https://demo.harmony-web.fr/claire");
    expect(siteUrl({ slug: "claire", domain: null }, {} as NodeJS.ProcessEnv)).toBe("http://localhost:3000/claire");
  });

  it("reste l'adresse du site hébergé, même quand le site du client est la référence", () => {
    const connected: Site = { ...SITE, theme: { ...THEME, externalSite: ACTIVE } };
    expect(siteUrl(connected)).toBe(HOSTED_URL);
    expect(publicSiteUrl(connected)).toBe(EXTERNAL_URL);
  });
});

describe("publicSiteUrl (jobs)", () => {
  const env = { SITES_BASE_URL: "https://demo.harmony-web.fr/" } as NodeJS.ProcessEnv;
  const site = (setting?: ExternalSiteSetting, domain: string | null = null) => ({ slug: "claire", domain, theme: { ...THEME, ...(setting ? { externalSite: setting } : {}) } });

  it("sans site du client, réglage éteint ou adresse invalide : l'adresse du site hébergé", () => {
    expect(publicSiteUrl(site(), env)).toBe("https://demo.harmony-web.fr/claire");
    expect(publicSiteUrl(site(undefined, "claire-sophrologie.fr"), env)).toBe("https://claire-sophrologie.fr");
    expect(publicSiteUrl(site({ url: EXTERNAL_URL, active: false }), env)).toBe("https://demo.harmony-web.fr/claire");
    expect(publicSiteUrl(site({ url: "pas une adresse", active: true }), env)).toBe("https://demo.harmony-web.fr/claire");
    expect(publicSiteUrl(site(), {} as NodeJS.ProcessEnv)).toBe("http://localhost:3000/claire");
  });

  it("site du client en référence : son adresse, sans barre finale, quel que soit le domaine du site hébergé", () => {
    expect(publicSiteUrl(site(ACTIVE), env)).toBe(EXTERNAL_URL);
    expect(publicSiteUrl(site({ url: `${EXTERNAL_URL}/`, active: true, keepHostedIndexed: true }, "claire-sophrologie.fr"), env)).toBe(EXTERNAL_URL);
    expect(publicSiteUrl(site({ url: "https://sites.google.com/view/cabinet-dupont", active: true }), env)).toBe("https://sites.google.com/view/cabinet-dupont");
  });

  it("par défaut, lit l'environnement du processus", () => {
    expect(publicSiteUrl(SITE)).toBe(HOSTED_URL);
    expect(publicSiteUrl({ ...SITE, theme: { ...THEME, externalSite: ACTIVE } })).toBe(EXTERNAL_URL);
  });
});

describe("loadGoogleBrief", () => {
  it("sans site du client : exactement le brief d'avant, sans aucune lecture de plus", async () => {
    const { db, log } = fakeDb(seed());
    expect(await loadGoogleBrief(db, SITE_ID, NOW)).toEqual(hostedBrief(SITE));
    expect(log).not.toContain("select external_sites");
    expect(log.sort()).toEqual(["query blogArticles", "query blogSettings", "query googleReviews", "query pages", "query prospects", "query sites", "query socialSettings"]);
    // Réglage présent mais éteint : pareil
    const off: Site = { ...SITE, theme: { ...THEME, externalSite: { url: EXTERNAL_URL, active: false } } };
    const second = fakeDb(seed(off));
    expect(await loadGoogleBrief(second.db, SITE_ID, NOW)).toEqual(hostedBrief(off));
    expect(second.log).not.toContain("select external_sites");
  });

  it("le brief du site hébergé garde ses repères : domaine, spécialités en ligne, lien public des articles", async () => {
    const { brief, refsById } = await loadGoogleBrief(fakeDb(seed()).db, SITE_ID, NOW);
    expect(brief.domain).toBe("demo.harmony-web.fr/claire-dupont-sophrologue-albi");
    // « gestion-du-stress » est désactivée sur le site hébergé
    expect(brief.home.specialties.map((s) => s.slug)).toEqual(["sommeil"]);
    expect(brief.motifPages.map((p) => p.slug)).toEqual(["sommeil"]);
    expect(refsById["page:p-sommeil"]?.href).toBe(`${HOSTED_URL}/motifs/sommeil`);
    expect(refsById["article:a-ligne"]).toMatchObject({ href: "/publications/a-ligne", publicHref: `${HOSTED_URL}/blog/bien-dormir` });
    expect(refsById["article:a-venir"]).not.toHaveProperty("publicHref");
  });

  it("site du client en référence : son profil, son adresse ; articles, avis et photos admises restent ceux de la plateforme", async () => {
    const site: Site = { ...SITE, theme: { ...THEME, externalSite: ACTIVE } };
    const { db, log } = fakeDb(seed(site), [externalRow()]);
    const { brief, photosById, refsById } = await loadGoogleBrief(db, SITE_ID, NOW);
    expect(log.filter((entry) => entry === "select external_sites")).toHaveLength(1);
    expect(brief.domain).toBe("www.cabinet-dupont.fr");
    expect(brief.siteName).toBe(SITE.name);
    expect(brief.hasBookingUrl).toBe(true);
    expect(brief.practitioner).toMatchObject({ firstName: "Claire", profession: "Sophrologue", city: "Albi", practiceName: "la sophrologie" });
    expect(brief.home.hero?.title).toBe("La sophrologie pour retrouver calme et énergie");
    // Spécialités du site du client — y compris celle dont le nom correspond à une page désactivée du site hébergé
    expect(brief.home.specialties.map((s) => [s.slug, s.title])).toEqual([
      ["gestion-du-stress", "Gestion du stress"],
      ["preparation-aux-examens", "Préparation aux examens"],
    ]);
    expect(brief.motifPages.map((p) => p.slug)).toEqual(["gestion-du-stress", "preparation-aux-examens"]);
    expect(brief.home.contact?.address).toBe("12 rue de la Paix, 81000 Albi");
    // Photos d'accueil et « à propos » du site hébergé gardées ; celle d'une page de spécialité hébergée ne l'est pas
    expect(Object.values(photosById)).toEqual([HERO_IMAGE, ABOUT_IMAGE]);
    // Liens des sources : le site du client ; les articles restent sur le blog hébergé
    expect(refsById["section:home:hero"]?.href).toBe(EXTERNAL_URL);
    expect(refsById["page:ext-gestion-du-stress"]?.href).toBe(`${EXTERNAL_URL}/gestion-du-stress`);
    expect(refsById["article:a-ligne"]).toMatchObject({ href: "/publications/a-ligne", publicHref: `${HOSTED_URL}/blog/bien-dormir` });
    expect(brief.articles.map((a) => a.slug)).toEqual(["respirer", "bien-dormir"]);
    expect(brief.reviews.map((r) => r.authorName)).toEqual(["Jeanne M."]);
    expect(brief.voice).toEqual({ designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" });
  });

  it("les corrections du praticien l'emportent sur ce qui a été lu", async () => {
    const site: Site = { ...SITE, theme: { ...THEME, externalSite: ACTIVE } };
    const overrides = { headline: "Retrouver le calme, à Albi", specialties: [PROFILE.specialties[1]!] };
    const { brief } = await loadGoogleBrief(fakeDb(seed(site), [externalRow({ overrides })]).db, SITE_ID, NOW);
    expect(brief.home.hero?.title).toBe("Retrouver le calme, à Albi");
    expect(brief.home.specialties.map((s) => s.slug)).toEqual(["preparation-aux-examens"]);
  });

  it("réglage actif mais site pas prêt, profil inexploitable ou table absente : le brief du site hébergé, avec son adresse", async () => {
    const site: Site = { ...SITE, theme: { ...THEME, externalSite: ACTIVE } };
    const missing = new Error("Failed query", { cause: Object.assign(new Error('relation "external_sites" does not exist'), { code: "42P01" }) });
    for (const external of [[], [externalRow({ status: "reading" })], [externalRow({ status: "error" })], [externalRow({ profile: null })], missing]) {
      const { db, log } = fakeDb(seed(site), external);
      expect(await loadGoogleBrief(db, SITE_ID, NOW)).toEqual(hostedBrief(site));
      expect(log).toContain("select external_sites");
    }
  });

  it("voix : réglages des réseaux sociaux, sinon voix du blog, sinon défaut accordé au genre — inchangé", async () => {
    const social = { voiceDesignation: "nous" as const, voiceAccord: "masculin" as const, voiceReader: "tu" as const, voiceTone: "direct" as const, instructions: "  Pas de tutoiement appuyé.  " };
    const withSocial = await loadGoogleBrief(fakeDb(seed(SITE, { socialSettings: [social] })).db, SITE_ID, NOW);
    expect(withSocial.brief.voice).toEqual({ designation: "nous", accord: "masculin", reader: "tu", tone: "direct" });
    expect(withSocial.brief.instructions).toBe("Pas de tutoiement appuyé.");
    const bare = await loadGoogleBrief(fakeDb(seed(SITE, { blogSettings: [], prospects: [{ ...PROSPECT, gender: "masculin" }] })).db, SITE_ID, NOW);
    expect(bare.brief.voice).toEqual({ ...DEFAULT_SOCIAL_VOICE, accord: "masculin" });
  });

  it("démo : jamais d'avis ; site introuvable : erreur", async () => {
    const demo: Site = { ...SITE, type: "demo" };
    const { db, log } = fakeDb(seed(demo));
    expect((await loadGoogleBrief(db, SITE_ID, NOW)).brief.reviews).toEqual([]);
    expect(log).not.toContain("query googleReviews");
    await expect(loadGoogleBrief(fakeDb({ sites: [] }).db, SITE_ID, NOW)).rejects.toThrow(`Site introuvable : ${SITE_ID}`);
  });
});
