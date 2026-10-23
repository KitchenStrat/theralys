import { describe, expect, it } from "vitest";
import type { Section } from "./content";
import {
  SOCIAL_BRIEF_MAX_CHARS,
  buildSocialBrief,
  describeSourceRef,
  parseArticleOutline,
  photoCatalog,
  photoOrientation,
  portraitSafeUrl,
  type SocialBriefInput,
} from "./social-brief";

// ─── Fixture : site seedé « Claire Dupont, sophrologue à Albi » (reconstruit) ─

const BLOB = "https://abc123.public.blob.vercel-storage.com/portrait-claire-x1.jpg";
const PEXELS = "https://images.pexels.com/photos/3759657/pexels-photo-3759657.jpeg?auto=compress&cs=tinysrgb&w=1200&h=800";
const DATA_URI = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
const FAL = "https://fal.media/files/elephant/abc.jpg";

const HOME_SECTIONS: Section[] = [
  {
    type: "hero",
    badge: "Sophrologue à Albi",
    title: "Un espace pour relâcher le corps et apaiser le mental à Albi.",
    paragraphs: [
      "Je vous accompagne pour **sortir du stress et des tensions du quotidien**, et retrouver un corps détendu et un mental apaisé.",
      "Un rythme trop soutenu, des tensions qui s'accumulent ? Grâce à la sophrologie, je vous aide à **dénouer ce qui pèse** et à retrouver une profonde sérénité.",
      "Je vous accueille sur rendez-vous à Albi, dans un cadre calme et propice au lâcher-prise.",
    ],
    imageUrl: DATA_URI,
    showGoogleRating: true,
    ctaLabel: "Prendre Rendez-Vous",
    stats: [
      { icon: "diplome", value: "+1000", label: "Patients accompagnés" },
      { icon: "etoile", value: "4.9/5", label: "Basé sur 27 avis Google" },
    ],
  },
  {
    type: "highlights",
    items: [
      { icon: "medaille", title: "Praticienne diplômée", text: "**Formée et certifiée** en la sophrologie" },
      { icon: "mains", title: "Séance personnalisée", text: "Chaque séance **adaptée à vos besoins**" },
      { icon: "fleur", title: "Cadre apaisant", text: "Un espace calme, **propice au lâcher-prise**" },
      { icon: "carte", title: "Cabinet facile d'accès", text: "Au cœur d'Albi, **parking à proximité**" },
      { icon: "soleil", title: "Cinquième point (ignoré)" },
    ],
  },
  {
    type: "specialties",
    title: "Mes spécialités",
    intro: "Chaque séance est construite avec vous, selon vos besoins du moment.",
    items: [
      {
        slug: "gestion-du-stress",
        title: "Gestion du stress",
        excerpt:
          "Un accompagnement dédié autour de « gestion du stress », **construit avec vous**, à votre rythme. Le premier échange permet de préciser vos attentes et d'adapter chaque séance à votre situation, séance après séance, sans jamais forcer.",
        icon: "tete",
      },
      {
        slug: "sommeil-et-recuperation",
        title: "Sommeil et récupération",
        excerpt: "Retrouver des nuits plus sereines grâce à des **rituels simples** et une respiration qui s'allonge.",
        icon: "lune",
      },
      {
        slug: "confiance-en-soi",
        title: "Confiance en soi",
        excerpt: "Des exercices pour **reprendre appui** sur vos ressources, à votre rythme.",
        icon: "etoile",
      },
    ],
  },
  {
    type: "future",
    badge: "Santé & Équilibre",
    title: "Et si vous retrouviez enfin un quotidien plus léger ?",
    intro: "Grâce à la sophrologie et un accompagnement **personnalisé**, il devient possible de :",
    bullets: [
      "**Relâcher les tensions** accumulées dans le corps et l'esprit",
      "**Retrouver un sommeil** plus profond et plus régulier",
      "**Apaiser le stress** et les réactions disproportionnées du quotidien",
      "**Reprendre confiance** en vous, à votre rythme et sans pression",
      "**Installer des habitudes** simples qui vous font durablement du bien, jour après jour, semaine après semaine, sans jamais vous mettre la moindre pression ni culpabiliser",
    ],
    ctaLabel: "Prendre Rendez-Vous",
    imageUrl: FAL,
  },
  {
    type: "about",
    title: "À propos de Claire",
    paragraphs: [
      "Praticienne passionnée et formée aux différentes approches de la sophrologie, j'ai à cœur d'offrir à chacun un accompagnement respectueux, à l'écoute et sans jugement.",
      "Mon approche : respirer, relâcher, retrouver votre équilibre intérieur. Chaque personne est unique — c'est pourquoi je prends le temps, à chaque séance, de comprendre où vous en êtes et ce dont vous avez besoin.",
      "Vous recevoir à Albi, c'est vous offrir une parenthèse : **un lieu calme, une écoute attentive** et des pratiques choisies pour vous.",
      "✅ Formée et certifiée en la sophrologie\n✅ Accompagnement personnalisé, à votre rythme\n✅ Cadre bienveillant et confidentiel à Albi",
    ],
    imageUrl: BLOB,
    infoCards: [
      { icon: "horloge", title: "Durée de la séance", text: "**45 à 60 minutes** en moyenne" },
      { icon: "euro", title: "Tarification", text: "Séance **60 €** — première séance **75 €**\nCB, chèque ou espèces" },
      { icon: "document", title: "Remboursement", text: "Prise en charge par de **nombreuses mutuelles**" },
    ],
  },
  { type: "reviews", title: "Ils m'ont fait confiance" },
  {
    type: "process",
    title: "Le déroulement d'une séance",
    steps: [
      {
        title: "Un temps d'échange",
        description:
          "Nous faisons le point ensemble : votre quotidien, vos attentes et **ce qui vous amène aujourd'hui**. Je vous pose quelques questions sur votre rythme de vie, votre sommeil, vos tensions ou vos objectifs, dans un **climat de confiance** et sans jugement.",
      },
      {
        title: "La séance",
        description:
          "Installée confortablement, vous profitez d'un accompagnement centré sur **gestion du stress**, ajusté en continu à votre confort. Je vous guide **pas à pas**, en vous expliquant ce que je fais et pourquoi.",
      },
      {
        title: "Le retour au calme",
        description:
          "La séance se termine **en douceur**, avec quelques minutes pour revenir à vous et à l'instant présent. Nous prenons ensuite un moment pour échanger sur **votre ressenti**.",
      },
      {
        title: "Des repères pour la suite",
        description:
          "Vous repartez avec des **repères simples à refaire chez vous** : une respiration, un geste, une attention à porter au quotidien pour prolonger les effets de la séance.",
      },
    ],
  },
  {
    type: "faq",
    title: "Questions fréquentes",
    items: [
      { question: "Comment se déroule la première séance ?", answer: "Nous commençons par un temps d'échange pour comprendre vos attentes et votre quotidien. La séance se poursuit ensuite à votre rythme, dans un cadre calme et bienveillant. Vous repartez avec des **repères simples** à réutiliser chez vous, et nous prenons le temps de répondre à toutes vos questions avant de nous quitter." },
      { question: "Faut-il une préparation particulière ?", answer: "Aucune préparation n'est nécessaire. Venez simplement dans une tenue confortable." },
      { question: "La sophrologie, c'est de l'hypnose ?", answer: "Pas tout à fait : vous restez **pleinement actif**, guidé par ma voix, les yeux fermés ou ouverts." },
      { question: "Combien de temps dure une séance ?", answer: "Comptez environ une heure." },
      { question: "Combien de séances sont nécessaires ?", answer: "Tout dépend de vous et de vos objectifs. Nous en parlons ensemble, sans engagement." },
      { question: "À qui s'adressent les séances ?", answer: "À toute personne qui souhaite s'accorder un moment pour elle." },
      { question: "Comment se passe le règlement ?", answer: "Le règlement se fait à la fin de la séance, en espèces ou par carte." },
      { question: "Huitième question (ignorée) ?", answer: "Réponse ignorée." },
    ],
  },
  {
    type: "contact",
    title: "Informations",
    address: "14 rue de la Berbie, 81000 Albi",
    phone: "06 39 98 01 23",
    email: "claire@demo-theralys.fr",
    note: "**Parking facile et gratuit** à proximité du cabinet",
    infoCards: [{ icon: "medaille", title: "6 années d'expérience", text: "Sophrologue" }],
  },
];

function motifPage(id: string, slug: string, title: string, imageUrl?: string): SocialBriefInput["pages"][number] {
  const sections: Section[] = [
    {
      type: "hero",
      badge: "Sophrologue à Albi",
      title: `${title} à Albi`,
      paragraphs: ["Un accompagnement dédié, **construit avec vous**, à votre rythme."],
      ctaLabel: "Prendre Rendez-Vous",
      ...(imageUrl ? { imageUrl } : {}),
    },
    {
      type: "richText",
      body: [
        `## Pourquoi choisir ${title.toLowerCase()} ?`,
        "",
        "Entre les obligations professionnelles, la famille et un rythme qui s'accélère, le corps finit par accumuler ce que le mental ne peut plus porter. La sophrologie offre un **espace pour déposer** tout cela.",
        "",
        "## Ce que cette séance peut vous apporter",
        "",
        "- Un premier échange pour préciser vos attentes",
        "- Des séances personnalisées et progressives",
        "",
        "## À qui s'adresse cet accompagnement ?",
        "",
        "À toute personne qui souhaite prendre soin d'elle.",
        "",
        "## Quatrième titre",
        "",
        "## Cinquième titre",
        "",
        "## Sixième titre (ignoré)",
      ].join("\n"),
    },
    {
      type: "faq",
      title: "Vos questions sur cette séance",
      items: [
        { question: "Combien de séances faut-il prévoir ?", answer: "Cela dépend de chacun : nous en parlons **ensemble**." },
        { question: "Comment se déroule la première séance ?", answer: "Un temps d'échange, puis des exercices simples." },
        { question: "Faut-il une préparation particulière ?", answer: "Aucune." },
        { question: "Quatrième question (ignorée) ?", answer: "Ignorée." },
      ],
    },
  ];
  return { id, type: "motif", slug, title, metaDescription: `${title} à Albi : un accompagnement personnalisé pour retrouver votre équilibre.`, sections };
}

/** Markdown reproduisant la structure de mockVoicedArticle (voix je / vous / chaleureux). */
function articleMarkdown(motifTitle: string, city = "Albi"): string {
  return [
    "Si vous lisez ces lignes, c'est sans doute que votre corps vous envoie des signaux. Bonne nouvelle : il existe des réponses douces, et cet article est là pour vous guider.",
    "",
    "## Ce qui se joue dans votre quotidien",
    "",
    "Rythme soutenu, sollicitations permanentes, pauses qui se font rares : le corps encaisse, puis finit par le faire savoir. Vous ressentez peut-être des tensions qui s'installent, un sommeil moins réparateur, une énergie en dents de scie.",
    "",
    "Ces signaux ne sont pas anodins : ce sont des messages. Les zones les plus souvent touchées :",
    "",
    "- **Les épaules et la nuque** : la zone classique de la charge mentale",
    "- **Le bas du dos** : souvent associé aux longues journées assises",
    "- **La mâchoire** : un indicateur fréquent de tension accumulée",
    "- **Le souffle** : une respiration qui se bloque ou se raccourcit",
    "",
    "> « J'ai l'impression que mon corps parle quand les mots manquent. »",
    "",
    "## Comment la sophrologie peut vous accompagner",
    "",
    `Je commence toujours par un temps d'échange : où en êtes-vous, qu'est-ce qui pèse en ce moment ? Je construis ensuite la séance autour de vos besoins du jour, en particulier autour de « ${motifTitle.toLowerCase()} ». Ce que cela peut apporter, concrètement :`,
    "",
    "1. **Un relâchement progressif** des zones de tension",
    "2. **Une meilleure conscience corporelle** — repérer les signaux avant qu'ils ne s'installent",
    "3. **Un espace de décompression** dans une semaine chargée",
    "4. **Des repères simples** à réutiliser chez vous",
    "",
    "### Un exercice à essayer maintenant",
    "",
    "Voici une technique simple pour amorcer un relâchement, en trois minutes :",
    "",
    "1. Asseyez-vous confortablement, pieds à plat sur le sol.",
    "2. Fermez les yeux et posez vos mains sur vos cuisses.",
    "3. Inspirez lentement par le nez pendant 4 secondes.",
    "4. Retenez l'air 2 secondes.",
    "5. Expirez lentement par la bouche pendant 6 secondes.",
    "6. Répétez 6 fois, en relâchant les épaules à chaque expiration.",
    "",
    "## Quand consulter ?",
    "",
    "Quelques situations où une séance peut être utile :",
    "",
    "- Vous ressentez des tensions qui reviennent chaque semaine malgré le repos",
    "- Votre sommeil est perturbé par des douleurs ou une agitation physique",
    "- Vous voulez offrir à votre corps une vraie pause",
    "",
    `Je vous accueille sur rendez-vous à ${city}, dans un cadre calme et chaleureux. Cette pratique de bien-être ne se substitue ni à un avis médical ni à un suivi par un professionnel de santé : en cas de douleur intense ou persistante, consultez d'abord votre médecin.`,
    "",
    "## Questions fréquentes",
    "",
    "**Le stress peut-il vraiment provoquer des douleurs physiques ?**",
    "",
    "Oui, c'est fréquent : les tensions émotionnelles se traduisent souvent par des contractures musculaires, notamment au niveau des épaules, du dos et de la mâchoire.",
    "",
    "**Combien de séances faut-il pour ressentir un mieux-être ?**",
    "",
    "Tout dépend de la situation de chacun : certaines personnes ressentent une détente dès la première séance, d'autres préfèrent un accompagnement régulier. Nous en parlons ensemble, sans engagement.",
    "",
    "**La séance est-elle douloureuse ?**",
    "",
    "Non : chaque séance s'ajuste en continu à votre confort, et rien n'est jamais forcé.",
  ].join("\n");
}

const NOW = new Date("2026-10-23T09:00:00Z");

function fixture(overrides: Partial<SocialBriefInput> = {}): SocialBriefInput {
  return {
    site: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Claire Dupont, sophrologue à Albi",
      type: "demo",
      theme: { preset: "lavande", fontPreset: "chaleureux" },
      bookingUrl: "https://calendly.com/demo-theralys",
      url: "http://localhost:3000/claire-dupont-sophrologue-albi",
    },
    prospect: {
      firstName: "Claire",
      lastName: "Dupont",
      profession: "Sophrologue",
      city: "Albi",
      gender: "feminin",
      googleRating: 4.9,
      googleReviewCount: 27,
    },
    pages: [
      { id: "home-1", type: "home", slug: "", title: "Accueil", metaDescription: null, sections: HOME_SECTIONS },
      motifPage("22222222-2222-4222-8222-222222222222", "gestion-du-stress", "Gestion du stress", PEXELS),
      motifPage("33333333-3333-4333-8333-333333333333", "sommeil-et-recuperation", "Sommeil et récupération"),
      motifPage("44444444-4444-4444-8444-444444444444", "confiance-en-soi", "Confiance en soi", PEXELS),
    ],
    articles: [
      {
        id: "a-old",
        slug: "dos-noue",
        title: "Dos noué au bureau : ce que la sophrologie peut changer",
        excerpt: "Les épaules qui remontent, la mâchoire serrée… Voici comment la sophrologie peut vous aider à **relâcher la pression**.",
        content: articleMarkdown("Gestion du stress"),
        imageUrl: PEXELS.replace("3759657", "1111111"),
        status: "published",
        publishAt: new Date("2026-10-06T08:00:00Z"),
      },
      {
        id: "a-new",
        slug: "sommeil-leger",
        title: "Sommeil léger, réveils nocturnes : retrouver des nuits paisibles",
        excerpt: null,
        content: articleMarkdown("Sommeil et récupération"),
        imageUrl: null,
        status: "published",
        publishAt: new Date("2026-10-20T08:00:00Z"),
      },
      {
        id: "a-upcoming",
        slug: "confiance",
        title: "Reprendre confiance avant un entretien",
        excerpt: "Un article à paraître.",
        content: articleMarkdown("Confiance en soi"),
        imageUrl: PEXELS.replace("3759657", "2222222"),
        status: "scheduled",
        publishAt: new Date("2026-11-03T08:00:00Z"),
      },
      { id: "a-draft", slug: "brouillon", title: "Brouillon", excerpt: null, content: articleMarkdown("x"), imageUrl: null, status: "draft", publishAt: null },
      { id: "a-empty", slug: "vide", title: "Vide", excerpt: null, content: "   ", imageUrl: null, status: "published", publishAt: new Date("2026-10-01T08:00:00Z") },
    ],
    reviews: [
      { id: "r-1", authorName: "Marie Lefèvre", rating: 5, text: "Un moment hors du temps. Claire est à l'écoute et d'une grande douceur. Je suis ressortie détendue comme rarement. 🌿" },
      { id: "r-2", authorName: "Thomas B.", rating: 5, text: "Accueil chaleureux, cadre très apaisant. On sent tout de suite le professionnalisme de Claire." },
      { id: "r-3", authorName: "Sophie R.", rating: 4, text: "Trop court." },
      { id: "r-4", authorName: "Julien M.", rating: 3, text: "Très belle découverte à Albi. Séance personnalisée, explications claires, et un vrai relâchement à la clé." },
      { id: "r-5", authorName: "Олег К.", rating: 5, text: "Очень хороший специалист, рекомендую всем друзьям и знакомым без исключения." },
      { id: "r-6", authorName: "Camille D.", rating: 5, text: `Je cherchais un moment pour souffler, j'ai trouvé bien plus. ${"Merci beaucoup pour tout. ".repeat(12)}` },
    ],
    voice: null,
    practiceName: "la sophrologie",
    now: NOW,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildSocialBrief — praticien, voix, site", () => {
  const { brief } = buildSocialBrief(fixture());

  it("praticien, pratique, voix par défaut accordée au genre, domaine sans protocole", () => {
    expect(brief.practitioner).toEqual({
      firstName: "Claire",
      lastName: "Dupont",
      profession: "Sophrologue",
      practiceName: "la sophrologie",
      city: "Albi",
      gender: "feminin",
    });
    expect(brief.voice).toEqual({ designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" });
    expect(brief.siteType).toBe("demo");
    expect(brief.siteName).toBe("Claire Dupont, sophrologue à Albi");
    expect(brief.domain).toBe("localhost:3000/claire-dupont-sophrologue-albi");
    expect(brief.hasBookingUrl).toBe(true);
    expect(brief.google).toEqual({ rating: 4.9, reviewCount: 27 });
  });

  it("voix fournie conservée ; accord masculin par défaut pour un prospect masculin", () => {
    const voiced = buildSocialBrief(fixture({ voice: { designation: "nous", accord: "masculin", reader: "tu", tone: "direct" } }));
    expect(voiced.brief.voice.designation).toBe("nous");
    const masculin = buildSocialBrief(fixture({ prospect: { ...fixture().prospect!, gender: "masculin" } }));
    expect(masculin.brief.voice.accord).toBe("masculin");
  });

  it("sans prospect : repli sur le nom du site", () => {
    const { brief: b } = buildSocialBrief(fixture({ prospect: null }));
    expect(b.practitioner.firstName).toBe("Claire");
    expect(b.practitioner.lastName).toBe("Dupont");
    expect(b.practitioner.profession).toBe("Sophrologue");
    expect(b.practitioner.city).toBe("Albi");
    expect(b.google).toBeUndefined();
  });
});

describe("buildSocialBrief — accueil", () => {
  const { brief, refsById } = buildSocialBrief(fixture());
  const home = brief.home;

  it("hero : badge, 2 paragraphes ≤ 280 sans gras, stats", () => {
    expect(home.hero?.badge).toBe("Sophrologue à Albi");
    expect(home.hero?.paragraphs).toHaveLength(2);
    for (const p of home.hero!.paragraphs) {
      expect(p.length).toBeLessThanOrEqual(280);
      expect(p).not.toContain("**");
    }
    expect(home.hero?.stats).toEqual([
      { value: "+1000", label: "Patients accompagnés" },
      { value: "4.9/5", label: "Basé sur 27 avis Google" },
    ]);
    expect(refsById["section:home:hero"]).toEqual({ kind: "section", id: "section:home:hero", label: "Page d'accueil", href: "http://localhost:3000/claire-dupont-sophrologue-albi" });
  });

  it("points forts ≤ 4 avec ids indexés", () => {
    expect(home.highlights).toHaveLength(4);
    expect(home.highlights[0]).toEqual({ id: "section:home:highlights:0", title: "Praticienne diplômée", text: "Formée et certifiée en la sophrologie" });
  });

  it("spécialités : excerpt ≤ 200, page et photo du motif reliées", () => {
    expect(home.specialties).toHaveLength(3);
    const stress = home.specialties[0]!;
    expect(stress.id).toBe("section:home:specialties:gestion-du-stress");
    expect(stress.pageId).toBe("page:22222222-2222-4222-8222-222222222222");
    expect(stress.photoId).toBeDefined();
    expect(stress.excerpt.length).toBeLessThanOrEqual(200);
    expect(stress.excerpt.endsWith("…")).toBe(true);
    expect(stress.excerpt).not.toContain("**");
    expect(refsById[stress.id]?.label).toBe("Spécialité « Gestion du stress »");
    // page sans photo → pas de photoId
    expect(home.specialties[1]?.photoId).toBeUndefined();
    expect(home.specialties[1]?.pageId).toBe("page:33333333-3333-4333-8333-333333333333");
  });

  it("section avenir : lignes aplaties (≤ 5, ≤ 120, sans « - »)", () => {
    expect(home.future?.id).toBe("section:home:future");
    expect(home.future?.title).toBe("Et si vous retrouviez enfin un quotidien plus léger ?");
    expect(home.future?.lines).toHaveLength(5);
    expect(home.future?.lines[0]).toBe("Grâce à la sophrologie et un accompagnement personnalisé, il devient possible de :");
    expect(home.future?.lines[1]).toBe("Relâcher les tensions accumulées dans le corps et l'esprit");
    for (const line of home.future!.lines) {
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line.startsWith("- ")).toBe(false);
    }
  });

  it("à propos : 2 paragraphes ≤ 300, lignes ✅ en credentials", () => {
    expect(home.about?.title).toBe("À propos de Claire");
    expect(home.about?.paragraphs).toHaveLength(2);
    expect(home.about?.paragraphs[0]?.length).toBeLessThanOrEqual(300);
    expect(home.about?.credentials).toEqual([
      "Formée et certifiée en la sophrologie",
      "Accompagnement personnalisé, à votre rythme",
      "Cadre bienveillant et confidentiel à Albi",
    ]);
  });

  it("infos pratiques, déroulé ≤ 160, FAQ ≤ 7 (réponses ≤ 220), contact sans téléphone", () => {
    expect(home.infoCards).toHaveLength(3);
    expect(home.infoCards[1]).toEqual({ id: "section:home:infos", title: "Tarification", text: "Séance 60 € — première séance 75 € · CB, chèque ou espèces" });
    expect(home.process).toHaveLength(4);
    for (const step of home.process) {
      expect(step.id).toBe("section:home:process");
      expect(step.description.length).toBeLessThanOrEqual(160);
    }
    expect(home.process[0]?.description.endsWith("…")).toBe(true);
    expect(home.faq).toHaveLength(7);
    expect(home.faq[2]).toEqual({ id: "section:home:faq:2", question: "La sophrologie, c'est de l'hypnose ?", answer: "Pas tout à fait : vous restez pleinement actif, guidé par ma voix, les yeux fermés ou ouverts." });
    expect(home.faq[0]!.answer.length).toBeLessThanOrEqual(220);
    expect(home.contact).toEqual({ id: "section:home:contact", address: "14 rue de la Berbie, 81000 Albi", note: "Parking facile et gratuit à proximité du cabinet" });
    expect(JSON.stringify(brief)).not.toContain("06 39 98");
    expect(JSON.stringify(brief)).not.toContain("claire@demo-theralys.fr");
  });
});

describe("buildSocialBrief — pages de motifs, articles, avis, photos", () => {
  it("pages de motifs : résumé ≤ 300, headings ≤ 5, faq ≤ 3, lien vers /motifs/<slug>", () => {
    const { brief, refsById } = buildSocialBrief(fixture());
    expect(brief.motifPages).toHaveLength(3);
    const page = brief.motifPages[0]!;
    expect(page.id).toBe("page:22222222-2222-4222-8222-222222222222");
    expect(page.slug).toBe("gestion-du-stress");
    expect(page.summary).toBe("Gestion du stress à Albi : un accompagnement personnalisé pour retrouver votre équilibre.");
    expect(page.headings).toHaveLength(5);
    expect(page.headings[0]).toBe("Pourquoi choisir gestion du stress ?");
    expect(page.faq).toHaveLength(3);
    expect(page.faq[0]).toEqual({ id: `${page.id}:faq:0`, question: "Combien de séances faut-il prévoir ?", answer: "Cela dépend de chacun : nous en parlons ensemble." });
    expect(refsById[page.id]).toEqual({ kind: "page", id: page.id, label: "Page « Gestion du stress »", href: "http://localhost:3000/claire-dupont-sophrologue-albi/motifs/gestion-du-stress" });
    expect(refsById[`${page.id}:faq:0`]?.href).toBe(refsById[page.id]?.href);
  });

  it("motifs désactivés exclus (page et spécialité)", () => {
    const { brief } = buildSocialBrief(fixture({ site: { ...fixture().site, theme: { preset: "lavande", fontPreset: "chaleureux", disabledMotifs: ["sommeil-et-recuperation"] } } }));
    expect(brief.motifPages.map((p) => p.slug)).toEqual(["gestion-du-stress", "confiance-en-soi"]);
    expect(brief.home.specialties.map((s) => s.slug)).toEqual(["gestion-du-stress", "confiance-en-soi"]);
  });

  it("articles : publiés/planifiés avec contenu, triés par date décroissante, ≤ 8, structure extraite", () => {
    const { brief, refsById } = buildSocialBrief(fixture());
    expect(brief.articles.map((a) => a.slug)).toEqual(["confiance", "sommeil-leger", "dos-noue"]);
    const upcoming = brief.articles[0]!;
    expect(upcoming.isUpcoming).toBe(true);
    expect(upcoming.publishAt).toBe("2026-11-03");
    expect(upcoming.photoId).toBeDefined();
    expect(brief.articles[1]!.isUpcoming).toBe(false);
    expect(brief.articles[1]!.photoId).toBeUndefined();
    // excerpt absent → accroche de l'article
    expect(brief.articles[1]!.excerpt.startsWith("Si vous lisez ces lignes")).toBe(true);
    expect(brief.articles[2]!.excerpt).not.toContain("**");
    const old = brief.articles[2]!;
    expect(old.id).toBe("article:a-old");
    expect(old.signs).toHaveLength(4);
    expect(old.exerciseSteps).toHaveLength(6);
    expect(old.faq).toHaveLength(3);
    expect(refsById["article:a-old"]).toEqual({ kind: "article", id: "article:a-old", label: "Article « Dos noué au bureau : ce que la sophrologie peut changer »", href: "/publications/a-old" });
  });

  it("avis : jamais en démo", () => {
    const { brief } = buildSocialBrief(fixture());
    expect(brief.reviews).toEqual([]);
    expect(Object.keys(buildSocialBrief(fixture()).refsById).some((id) => id.startsWith("review:"))).toBe(false);
  });

  it("avis (client) : note ≥ 4, 40-240 caractères, alphabet latin, « Prénom I. », emojis retirés", () => {
    const { brief, refsById } = buildSocialBrief(fixture({ site: { ...fixture().site, type: "client" } }));
    expect(brief.reviews.map((r) => r.id)).toEqual(["review:r-1", "review:r-2"]);
    expect(brief.reviews[0]).toEqual({
      id: "review:r-1",
      authorName: "Marie L.",
      rating: 5,
      text: "Un moment hors du temps. Claire est à l'écoute et d'une grande douceur. Je suis ressortie détendue comme rarement.",
    });
    expect(brief.reviews[1]?.authorName).toBe("Thomas B.");
    expect(refsById["review:r-1"]).toEqual({ kind: "review", id: "review:r-1", label: "Avis Google de Marie L." });
  });

  it("photos : portraitSafe uniquement pour le Blob Vercel ; data: et fal.media = ambiance ; ids « pN » résolus", () => {
    const { brief, photosById } = buildSocialBrief(fixture());
    expect(brief.photos.length).toBeLessThanOrEqual(20);
    const byKind = Object.fromEntries(brief.photos.map((p) => [p.kind + ":" + p.id, p]));
    const about = brief.photos.find((p) => p.kind === "about")!;
    expect(about.portraitSafe).toBe(true);
    expect(about.hint).toBe("À propos : portrait du praticien");
    expect(photosById[about.id]).toBe(BLOB);
    const hero = brief.photos.find((p) => p.kind === "hero")!;
    expect(hero.portraitSafe).toBe(false);
    expect(photosById[hero.id]).toBe(DATA_URI);
    const future = brief.photos.find((p) => p.kind === "future")!;
    expect(future.portraitSafe).toBe(false);
    expect(photosById[future.id]).toBe(FAL);
    const motifs = brief.photos.filter((p) => p.kind === "motif");
    expect(motifs).toHaveLength(1); // même URL Pexels pour 2 pages → dédoublonnée
    expect(motifs[0]?.orientation).toBe("landscape");
    expect(brief.photos.map((p) => p.id)).toEqual(brief.photos.map((_, i) => `p${i + 1}`));
    expect(Object.keys(byKind).length).toBe(brief.photos.length);
    for (const p of brief.photos) expect(photosById[p.id]).toBeDefined();
  });

  it("portraitSafeUrl / photoOrientation", () => {
    expect(portraitSafeUrl(BLOB)).toBe(true);
    expect(portraitSafeUrl("https://public.blob.vercel-storage.com.evil.fr/x.jpg")).toBe(false);
    expect(portraitSafeUrl(FAL)).toBe(false);
    expect(portraitSafeUrl(DATA_URI)).toBe(false);
    expect(portraitSafeUrl("pas une url")).toBe(false);
    expect(photoOrientation("https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=800&h=1200")).toBe("portrait");
    expect(photoOrientation("https://images.pexels.com/photos/1/pexels-photo-1.jpeg?orientation=portrait")).toBe("portrait");
    expect(photoOrientation(DATA_URI)).toBe("landscape");
  });

  it("photoCatalog : dédoublonne, plafonne, ignore les URLs vides", () => {
    const catalog = photoCatalog(2);
    expect(catalog.add(null, "hero", "x")).toBeUndefined();
    expect(catalog.add("https://a/1.jpg", "hero", "Un")).toBe("p1");
    expect(catalog.add("https://a/1.jpg", "motif", "Encore")).toBe("p1");
    expect(catalog.add("https://a/2.jpg", "motif", "Deux")).toBe("p2");
    expect(catalog.add("https://a/3.jpg", "motif", "Trois")).toBeUndefined();
    expect(catalog.photos).toHaveLength(2);
    expect(catalog.byId).toEqual({ p1: "https://a/1.jpg", p2: "https://a/2.jpg" });
  });
});

describe("parseArticleOutline", () => {
  it("extrait toute la structure d'un article mock (je / vous / chaleureux)", () => {
    const outline = parseArticleOutline(articleMarkdown("Gestion du stress"));
    expect(outline.lead?.startsWith("Si vous lisez ces lignes")).toBe(true);
    expect(outline.signs).toEqual([
      "Les épaules et la nuque : la zone classique de la charge mentale",
      "Le bas du dos : souvent associé aux longues journées assises",
      "La mâchoire : un indicateur fréquent de tension accumulée",
      "Le souffle : une respiration qui se bloque ou se raccourcit",
    ]);
    expect(outline.quote).toBe("J'ai l'impression que mon corps parle quand les mots manquent.");
    expect(outline.contributions).toHaveLength(4);
    expect(outline.contributions[0]).toBe("Un relâchement progressif des zones de tension");
    expect(outline.exerciseIntro).toBe("Voici une technique simple pour amorcer un relâchement, en trois minutes :");
    expect(outline.exerciseSteps).toHaveLength(6);
    expect(outline.exerciseSteps[0]).toBe("Asseyez-vous confortablement, pieds à plat sur le sol.");
    expect(outline.exerciseSteps[5]).toBe("Répétez 6 fois, en relâchant les épaules à chaque expiration.");
    expect(outline.whenToConsult).toHaveLength(3);
    expect(outline.whenToConsult[2]).toBe("Vous voulez offrir à votre corps une vraie pause");
    expect(outline.faq).toHaveLength(3);
    expect(outline.faq[0]?.question).toBe("Le stress peut-il vraiment provoquer des douleurs physiques ?");
    expect(outline.faq[2]).toEqual({ question: "La séance est-elle douloureuse ?", answer: "Non : chaque séance s'ajuste en continu à votre confort, et rien n'est jamais forcé." });
  });

  it("tolérant : article minimal, titre #, FAQ en sous-titres, puces à la place des numéros", () => {
    expect(parseArticleOutline("")).toEqual({ signs: [], contributions: [], exerciseSteps: [], whenToConsult: [], faq: [] });
    const outline = parseArticleOutline(
      [
        "# Titre de l'article",
        "",
        "Accroche en une phrase.",
        "",
        "## Comprendre",
        "",
        "1. Signe un",
        "2. Signe deux",
        "",
        "## Apports",
        "",
        "- Apport un",
        "- Apport deux",
        "",
        "## Un exercice simple",
        "",
        "- Étape A",
        "- Étape B",
        "",
        "## Questions fréquentes",
        "",
        "### Première question ?",
        "",
        "Première réponse.",
        "",
        "### Deuxième question ?",
        "",
        "Deuxième réponse.",
      ].join("\n"),
    );
    expect(outline.lead).toBe("Accroche en une phrase.");
    expect(outline.signs).toEqual(["Signe un", "Signe deux"]);
    expect(outline.contributions).toEqual(["Apport un", "Apport deux"]);
    expect(outline.exerciseSteps).toEqual(["Étape A", "Étape B"]);
    expect(outline.exerciseIntro).toBeUndefined();
    expect(outline.quote).toBeUndefined();
    expect(outline.whenToConsult).toEqual([]);
    expect(outline.faq).toEqual([
      { question: "Première question ?", answer: "Première réponse." },
      { question: "Deuxième question ?", answer: "Deuxième réponse." },
    ]);
  });
});

describe("plafond de taille", () => {
  it("un brief normal tient largement sous 28 000 caractères", () => {
    const { brief } = buildSocialBrief(fixture());
    expect(JSON.stringify(brief).length).toBeLessThan(SOCIAL_BRIEF_MAX_CHARS);
    expect(brief.articles).toHaveLength(3);
  });

  it("au-delà : articles ramenés à 6, puis avis à 3, puis headings retirés", () => {
    const long = (label: string, n: number) => `${label} ${"très longue phrase descriptive, ".repeat(20)}`.slice(0, n);
    const heavyMarkdown = [
      long("Accroche", 300),
      "",
      "## Comprendre",
      ...Array.from({ length: 6 }, (_, i) => `- ${long(`Signe ${i}`, 170)}`),
      "",
      `> ${long("Citation", 200)}`,
      "",
      "## Apports",
      ...Array.from({ length: 5 }, (_, i) => `${i + 1}. ${long(`Apport ${i}`, 170)}`),
      "",
      "### Un exercice à essayer maintenant",
      long("Intro", 200),
      ...Array.from({ length: 7 }, (_, i) => `${i + 1}. ${long(`Étape ${i}`, 170)}`),
      "",
      "## Quand consulter ?",
      ...Array.from({ length: 4 }, (_, i) => `- ${long(`Situation ${i}`, 170)}`),
      "",
      "## Questions fréquentes",
      ...Array.from({ length: 3 }, (_, i) => `**${long(`Question ${i}`, 150)} ?**\n\n${long("Réponse", 230)}`),
    ].join("\n");
    const articles = Array.from({ length: 10 }, (_, i) => ({
      id: `heavy-${i}`,
      slug: `heavy-${i}`,
      title: `Article ${i}`,
      excerpt: long("Extrait", 220),
      content: heavyMarkdown,
      imageUrl: `https://images.pexels.com/photos/${i}/x.jpeg`,
      status: "published",
      publishAt: new Date(Date.UTC(2026, 9, 1 + i)),
    }));
    const reviews = Array.from({ length: 6 }, (_, i) => ({
      id: `rev-${i}`,
      authorName: `Prénom${i} Nom`,
      rating: 5,
      text: long("Avis", 230),
    }));
    const { brief } = buildSocialBrief(fixture({ articles, reviews, site: { ...fixture().site, type: "client" } }));
    expect(brief.articles.length).toBeLessThanOrEqual(6);
    expect(brief.reviews.length).toBeLessThanOrEqual(3);
    expect(brief.motifPages.every((p) => p.headings.length === 0)).toBe(true);
    // les photos des articles écartés ne sont plus proposées au modèle
    const keptPhotoIds = new Set(brief.articles.map((a) => a.photoId));
    expect(brief.photos.filter((p) => p.kind === "article").every((p) => keptPhotoIds.has(p.id))).toBe(true);
  });
});

describe("describeSourceRef", () => {
  it("renvoie la référence connue, sinon un libellé générique selon le préfixe", () => {
    const { refsById } = buildSocialBrief(fixture());
    expect(describeSourceRef("section:home:faq:2", refsById)?.label).toBe("Question fréquente « La sophrologie, c'est de l'hypnose ? »");
    expect(describeSourceRef("page:inconnue", refsById)).toEqual({ kind: "page", id: "page:inconnue", label: "Page de votre site" });
    expect(describeSourceRef("article:x")).toEqual({ kind: "article", id: "article:x", label: "Article de votre blog" });
    expect(describeSourceRef("review:x")).toEqual({ kind: "review", id: "review:x", label: "Avis Google" });
    expect(describeSourceRef("request")).toEqual({ kind: "request", id: "request", label: "Votre demande" });
    expect(describeSourceRef("section:home:hero").label).toBe("Votre site");
  });
});
