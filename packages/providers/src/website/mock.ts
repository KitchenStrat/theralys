/**
 * Lecteur de démonstration (`EXTERNAL_SITE_MOCK=1`) : aucun accès réseau. Il
 * rend le site plausible d'un praticien fictif, toujours le même pour une
 * adresse donnée, pour que les démonstrations et les tests de bout en bout
 * fonctionnent hors ligne.
 *
 * Tout est fictif et choisi pour ne viser personne : numéros de téléphone
 * pris dans les tranches réservées à la fiction par l'ARCEP, liens de
 * rendez-vous et de réseau social préfixés « demo », adresses génériques.
 *
 * Pour essayer les parcours d'échec, un hôte dont le nom commence par
 * `demo-bloque`, `demo-robots`, `demo-vide`, `demo-injoignable` ou
 * `demo-lent` rend l'échec correspondant.
 */

import { EXTERNAL_SITE_LIMITS, bareHost, slugify, type BookingPlatformId, type ExternalPageKind, type ExternalReadError, type ExternalReadOutcome, type ExternalSiteFacts, type ExternalSitePage } from "@theralys/shared";
import { joinBlocks, sha256Hex } from "./text";
import type { WebsiteReader } from "./types";

type MockSpecialty = { slug: string; title: string; lead: string; sections: { heading: string; text: string }[] };

type MockProfession = {
  /** « Sophrologue » */
  title: string;
  /** « la sophrologie » */
  practice: string;
  platform: BookingPlatformId;
  promise: string;
  approach: string;
  credentials: string[];
  specialties: [MockSpecialty, MockSpecialty, MockSpecialty];
  prices: [string, string, string][];
};

const PROFESSIONS: readonly MockProfession[] = [
  {
    title: "Sophrologue",
    practice: "la sophrologie",
    platform: "resalib",
    promise: "Retrouver le calme, mieux dormir et reprendre confiance, à votre rythme.",
    approach: "Chaque séance associe des exercices de respiration, de détente musculaire et de visualisation, que vous pourrez refaire chez vous entre deux rendez-vous.",
    credentials: ["Titre de sophrologue inscrit au RNCP", "Spécialisation en sophrologie du sommeil", "Membre de la Chambre syndicale de la sophrologie"],
    specialties: [
      {
        slug: "gestion-du-stress",
        title: "Gestion du stress et de l'anxiété",
        lead: "Quand la pression s'installe, le corps se tend et le mental s'emballe. La sophrologie apprend à relâcher l'un pour apaiser l'autre.",
        sections: [
          { heading: "Pour qui ?", text: "Pour les personnes qui se sentent débordées, irritables ou fatiguées nerveusement, au travail comme à la maison." },
          { heading: "Comment se déroule l'accompagnement ?", text: "Nous commençons par repérer vos signaux d'alerte, puis vous apprenez des exercices courts à utiliser au quotidien. Comptez six à huit séances." },
        ],
      },
      {
        slug: "sommeil",
        title: "Troubles du sommeil",
        lead: "Difficultés d'endormissement, réveils nocturnes, sommeil peu réparateur : des exercices simples aident à retrouver des nuits plus sereines.",
        sections: [
          { heading: "Retrouver un rythme", text: "Nous travaillons sur le relâchement du soir et sur les pensées qui tournent en boucle au moment du coucher." },
          { heading: "Un entraînement, pas une recette", text: "Les effets viennent avec la pratique : je vous remets un enregistrement audio après chaque séance pour vous entraîner chez vous." },
        ],
      },
      {
        slug: "preparation-mentale",
        title: "Préparation aux examens et aux épreuves",
        lead: "Examen, concours, permis de conduire, prise de parole : se préparer mentalement permet d'arriver le jour venu avec tous ses moyens.",
        sections: [
          { heading: "Avant l'épreuve", text: "Nous travaillons la concentration, la mémorisation et la gestion du trac, en nous projetant positivement vers le jour de l'épreuve." },
          { heading: "Pour les adolescents aussi", text: "Les séances sont adaptées aux collégiens, lycéens et étudiants, à partir de douze ans." },
        ],
      },
    ],
    prices: [
      ["Première séance (bilan)", "1 h 15", "65 €"],
      ["Séance individuelle", "1 h", "55 €"],
      ["Séance en visio", "1 h", "50 €"],
    ],
  },
  {
    title: "Naturopathe",
    practice: "la naturopathie",
    platform: "medoucine",
    promise: "Retrouver de l'énergie et un meilleur équilibre grâce à l'alimentation et à l'hygiène de vie.",
    approach: "Après un bilan complet de vos habitudes, je vous propose un programme personnalisé : alimentation, plantes, gestion du stress et activité physique, sans jamais remplacer un suivi médical.",
    credentials: ["Formation de praticien naturopathe en trois ans", "Certification en micronutrition", "Adhésion à une fédération professionnelle de naturopathie"],
    specialties: [
      {
        slug: "troubles-digestifs",
        title: "Confort digestif",
        lead: "Ballonnements, digestion lente, transit irrégulier : nous cherchons ensemble ce qui déséquilibre votre digestion.",
        sections: [
          { heading: "Un bilan pour comprendre", text: "Nous passons en revue vos repas, votre rythme et votre niveau de stress pour repérer les habitudes à ajuster." },
          { heading: "Des conseils applicables", text: "Vous repartez avec un programme écrit, simple à suivre, et des idées de menus adaptées à vos goûts." },
        ],
      },
      {
        slug: "fatigue-et-energie",
        title: "Fatigue et baisse d'énergie",
        lead: "Quand la fatigue dure, l'alimentation, le sommeil et la récupération méritent d'être revus dans leur ensemble.",
        sections: [
          { heading: "Retrouver de la vitalité", text: "Nous travaillons sur la qualité de l'assiette, les rythmes de la journée et les plantes qui soutiennent l'organisme." },
          { heading: "Un suivi dans la durée", text: "Un point est prévu trois à quatre semaines après le premier rendez-vous pour ajuster le programme." },
        ],
      },
      {
        slug: "equilibre-alimentaire",
        title: "Rééquilibrage alimentaire",
        lead: "Manger mieux sans se priver : un accompagnement progressif, loin des régimes, pour installer des habitudes qui durent.",
        sections: [
          { heading: "Sans régime strict", text: "Nous partons de ce que vous aimez et de votre quotidien pour faire évoluer vos repas pas à pas." },
          { heading: "Pour toute la famille", text: "Les conseils s'adaptent aux enfants, aux sportifs et aux personnes qui cuisinent peu." },
        ],
      },
    ],
    prices: [
      ["Bilan de vitalité", "1 h 30", "80 €"],
      ["Consultation de suivi", "1 h", "60 €"],
      ["Forfait trois consultations", "3 h 30", "180 €"],
    ],
  },
  {
    title: "Hypnothérapeute",
    practice: "l'hypnose",
    platform: "doctolib",
    promise: "Changer une habitude, dépasser une peur ou traverser une période difficile avec l'hypnose.",
    approach: "L'hypnose que je pratique est douce et respectueuse : vous gardez le contrôle tout au long de la séance, je vous guide vers vos propres ressources.",
    credentials: ["Certification de praticien en hypnose ericksonienne", "Formation en hypnose pour l'arrêt du tabac", "Supervision régulière de la pratique"],
    specialties: [
      {
        slug: "arret-du-tabac",
        title: "Arrêt du tabac",
        lead: "Vous avez décidé d'arrêter de fumer : l'hypnose renforce votre motivation et vous aide à défaire les automatismes liés à la cigarette.",
        sections: [
          { heading: "Une séance préparée", text: "Un premier échange permet de comprendre votre rapport au tabac et de choisir le bon moment pour arrêter." },
          { heading: "Et après ?", text: "Une séance de consolidation est possible dans le mois qui suit, si vous en ressentez le besoin." },
        ],
      },
      {
        slug: "phobies-et-peurs",
        title: "Phobies et peurs",
        lead: "Peur de l'avion, des araignées, de conduire ou de parler en public : l'hypnose aide à désamorcer la réaction de peur.",
        sections: [
          { heading: "Avancer par étapes", text: "Nous approchons la situation redoutée progressivement, d'abord en imagination, toujours à votre rythme." },
          { heading: "Combien de séances ?", text: "Deux à cinq séances suffisent le plus souvent, selon l'ancienneté de la peur." },
        ],
      },
      {
        slug: "confiance-en-soi",
        title: "Confiance en soi",
        lead: "Oser prendre sa place, dire non, se lancer dans un projet : l'hypnose aide à s'appuyer sur ses réussites passées.",
        sections: [
          { heading: "Retrouver ses appuis", text: "Nous réactivons le souvenir de vos réussites, pour le rendre disponible quand vous en avez besoin." },
          { heading: "Un travail concret", text: "Chaque séance se termine par un exercice d'auto-hypnose à pratiquer chez vous." },
        ],
      },
    ],
    prices: [
      ["Séance d'hypnose", "1 h", "70 €"],
      ["Séance d'arrêt du tabac", "1 h 30", "120 €"],
      ["Séance enfant ou adolescent", "45 min", "55 €"],
    ],
  },
  {
    title: "Réflexologue",
    practice: "la réflexologie plantaire",
    platform: "resalib",
    promise: "Relâcher les tensions et retrouver un mieux-être global grâce à la réflexologie plantaire.",
    approach: "Par des pressions précises sur les zones réflexes des pieds, la séance procure une détente profonde ; elle vient en complément, jamais à la place, d'un suivi médical.",
    credentials: ["Certification de réflexologue inscrite au RNCP", "Formation en réflexologie périnatale", "Membre d'un syndicat professionnel de réflexologues"],
    specialties: [
      {
        slug: "detente-et-stress",
        title: "Détente et gestion du stress",
        lead: "Une séance de réflexologie invite le corps à relâcher les tensions accumulées et apaise le système nerveux.",
        sections: [
          { heading: "Un temps pour soi", text: "Vous vous installez confortablement et n'avez rien à faire : la détente vient au fil des pressions." },
          { heading: "À quel rythme ?", text: "Une séance par mois suffit en entretien ; en période chargée, trois séances rapprochées sont conseillées." },
        ],
      },
      {
        slug: "douleurs-et-tensions",
        title: "Douleurs et tensions",
        lead: "Dos noué, nuque raide, jambes lourdes : la réflexologie accompagne le relâchement des tensions du quotidien.",
        sections: [
          { heading: "Une approche globale", text: "La séance travaille l'ensemble du pied avant d'insister sur les zones en lien avec vos tensions." },
          { heading: "En complément", text: "La réflexologie ne remplace ni un diagnostic ni un traitement : elle s'ajoute au suivi de votre médecin." },
        ],
      },
      {
        slug: "grossesse",
        title: "Accompagnement de la grossesse",
        lead: "À partir du quatrième mois, la réflexologie aide à soulager les petits maux de la grossesse et à mieux dormir.",
        sections: [
          { heading: "En toute douceur", text: "Les séances sont adaptées à chaque trimestre et se font en position allongée sur le côté si besoin." },
          { heading: "Après la naissance", text: "Une séance après l'accouchement aide à récupérer et à s'accorder un moment de pause." },
        ],
      },
    ],
    prices: [
      ["Séance de réflexologie plantaire", "1 h", "60 €"],
      ["Séance découverte", "45 min", "45 €"],
      ["Forfait cinq séances", "5 h", "270 €"],
    ],
  },
];

const PRACTITIONERS = ["Camille Durand", "Claire Fontaine", "Julie Marchand", "Élise Perrin", "Dominique Garnier", "Maxime Lefèvre"] as const;

/** Villes et préfixes de numéros réservés à la fiction dans leur zone (décision de l'ARCEP). */
const PLACES = [
  { city: "Lyon", postalCode: "69003", street: "12 rue des Tilleuls", phonePrefix: "04 65 71", access: "Métro D, arrêt Garibaldi. Stationnement possible dans la rue." },
  { city: "Nantes", postalCode: "44000", street: "8 allée des Marronniers", phonePrefix: "02 61 91", access: "Tramway ligne 2, arrêt Saint-Mihiel. Parking à deux minutes à pied." },
  { city: "Toulouse", postalCode: "31000", street: "5 rue du Lavoir", phonePrefix: "05 36 49", access: "Métro B, arrêt Carmes. Cabinet au premier étage, sans ascenseur." },
  { city: "Bordeaux", postalCode: "33000", street: "21 cours des Acacias", phonePrefix: "05 36 49", access: "Tramway B, arrêt Gambetta. Accès de plain-pied." },
  { city: "Annecy", postalCode: "74000", street: "3 chemin des Sources", phonePrefix: "04 65 71", access: "Bus ligne 5, arrêt Sources. Places de stationnement devant le cabinet." },
  { city: "Rennes", postalCode: "35000", street: "14 rue de la Fontaine", phonePrefix: "02 61 91", access: "Métro A, arrêt Sainte-Anne. Local à vélos dans la cour." },
] as const;

const FAILURES: Record<string, ExternalReadError> = { bloque: "blocked", robots: "robots", vide: "empty", injoignable: "unreachable", lent: "timeout" };

/** Empreinte stable d'une chaîne (FNV-1a, 32 bits) : sert à choisir, pas à protéger. */
function seedOf(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const pick = <T>(items: readonly T[], seed: number, shift: number): T => items[(seed >>> shift) % items.length]!;

function bookingLink(platform: BookingPlatformId, profession: string, city: string, slug: string): string {
  if (platform === "doctolib") return `https://www.doctolib.fr/${slugify(profession)}/${slugify(city)}/demo-${slug}`;
  if (platform === "medoucine") return `https://www.medoucine.com/consultation/${slugify(city)}/demo-${slug}`;
  return `https://www.resalib.fr/praticien/demo-${slug}`;
}

function page(url: string, kind: ExternalPageKind, title: string, description: string, headings: string[], blocks: string[], fetchedAt: string): ExternalSitePage {
  const text = joinBlocks(blocks, EXTERNAL_SITE_LIMITS.pageChars);
  return { url, kind, title, description, headings, text, hash: sha256Hex(text), fetchedAt };
}

/** Site fictif d'un hôte : pages et faits, entièrement déterminés par le nom de l'hôte. */
export function mockSite(siteUrl: string, fetchedAt: string): { url: string; pages: ExternalSitePage[]; facts: ExternalSiteFacts } {
  const parsed = new URL(siteUrl);
  const host = bareHost(parsed.hostname);
  const base = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  const seed = seedOf(host);
  const profession = pick(PROFESSIONS, seed, 0);
  const practitioner = pick(PRACTITIONERS, seed, 8);
  const place = pick(PLACES, seed, 16);
  const label = host.split(".")[0] ?? "cabinet";
  const slug = slugify(label) || "cabinet";
  const practice = label
    .split("-")
    .filter((word) => word !== "")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  const phone = `${place.phonePrefix} ${String(seed % 100).padStart(2, "0")} ${String((seed >>> 7) % 100).padStart(2, "0")}`;
  const email = `contact@${host}`;
  const address = `${place.street}, ${place.postalCode} ${place.city}`;
  const booking = bookingLink(profession.platform, profession.title, place.city, slug);
  const hours = [
    { label: "Lundi au vendredi", value: "9h – 19h" },
    { label: "Samedi", value: "9h – 12h30" },
  ];
  const job = profession.title.toLowerCase();

  const home = page(
    `${base}/`,
    "home",
    `${practice} — ${profession.title} à ${place.city}`,
    `${practitioner}, ${job} à ${place.city}. ${profession.promise}`,
    [`${profession.title} à ${place.city}`, "Mes accompagnements", ...profession.specialties.map((specialty) => specialty.title), "Comment se passe une séance ?", "Infos pratiques"],
    [
      `${profession.title} à ${place.city}`,
      profession.promise,
      `Je suis ${practitioner}, ${job}. Je vous reçois au cabinet, à ${place.city}, ou en visio, du lundi au samedi.`,
      "Mes accompagnements",
      ...profession.specialties.flatMap((specialty) => [specialty.title, specialty.lead]),
      "Comment se passe une séance ?",
      profession.approach,
      "La première séance commence par un temps d'échange pour faire le point sur votre demande et fixer ensemble un objectif.",
      "Infos pratiques",
      `${address}. ${place.access}`,
      `Rendez-vous en ligne ou par téléphone au ${phone}.`,
    ],
    fetchedAt,
  );
  const about = page(
    `${base}/a-propos`,
    "about",
    `À propos — ${practitioner}, ${job}`,
    `Le parcours et l'approche de ${practitioner}, ${job} à ${place.city}.`,
    [`À propos de ${practitioner}`, "Mon parcours", "Mon approche", "Formations et diplômes"],
    [
      `À propos de ${practitioner}`,
      "Mon parcours",
      `Après dix ans dans un autre métier, j'ai découvert ${profession.practice} à un moment où j'en avais moi-même besoin. J'ai choisi de m'y former sérieusement, puis d'ouvrir mon cabinet à ${place.city}.`,
      "Mon approche",
      profession.approach,
      "J'accorde beaucoup d'importance à l'écoute : chaque accompagnement est construit avec vous, selon votre demande et votre rythme.",
      "Formations et diplômes",
      ...profession.credentials.map((credential) => `- ${credential}`),
    ],
    fetchedAt,
  );
  const specialties = profession.specialties.map((specialty) =>
    page(
      `${base}/${specialty.slug}`,
      "specialty",
      `${specialty.title} — ${profession.title} à ${place.city}`,
      specialty.lead,
      [specialty.title, ...specialty.sections.map((section) => section.heading)],
      [specialty.title, specialty.lead, ...specialty.sections.flatMap((section) => [section.heading, section.text]), `Vous vous reconnaissez ? Prenez rendez-vous en ligne ou appelez-moi au ${phone}.`],
      fetchedAt,
    ),
  );
  const pricing = page(
    `${base}/tarifs`,
    "pricing",
    `Tarifs — ${practice}`,
    `Tarifs et durée des séances de ${practitioner}, ${job} à ${place.city}.`,
    ["Tarifs", "Règlement et remboursement"],
    [
      "Tarifs",
      "Prestation | Durée | Tarif",
      ...profession.prices.map((row) => row.join(" | ")),
      "Règlement et remboursement",
      "Règlement par carte bancaire, chèque ou espèces. Une facture vous est remise sur demande.",
      "Certaines mutuelles prennent en charge une partie des séances : renseignez-vous auprès de la vôtre.",
      "Toute séance non annulée 24 heures à l'avance est due.",
    ],
    fetchedAt,
  );
  const contact = page(
    `${base}/contact`,
    "contact",
    `Contact et accès — ${practice}`,
    `Adresse, horaires et prise de rendez-vous : ${practice}, ${place.city}.`,
    ["Contact", "Adresse et accès", "Horaires"],
    [
      "Contact",
      `Téléphone : ${phone}`,
      `Courriel : ${email}`,
      "Adresse et accès",
      address,
      place.access,
      "Horaires",
      ...hours.map((line) => `${line.label} : ${line.value}`),
      "Les rendez-vous se prennent en ligne ou par téléphone. En cas d'empêchement, merci de prévenir au moins 24 heures à l'avance.",
    ],
    fetchedAt,
  );

  const facts: ExternalSiteFacts = {
    name: practice,
    description: `${practitioner}, ${job} à ${place.city}. ${profession.promise}`,
    language: "fr",
    phones: [phone],
    emails: [email],
    address,
    hours,
    bookingLinks: [{ url: booking, platform: profession.platform }],
    social: { instagram: `https://www.instagram.com/demo.${slug.replace(/-/g, ".")}` },
    tags: {},
    cms: "wordpress",
  };
  return { url: base, pages: [home, about, ...specialties, pricing, contact], facts };
}

/** Lecteur de démonstration : rend le site fictif de l'hôte demandé, sans réseau et sans rien inscrire au registre des appels. */
export function createMockWebsiteReader(options: { now?: () => Date } = {}): WebsiteReader {
  const now = options.now ?? (() => new Date());
  return {
    mode: "mock",
    async read(url, opts = {}): Promise<ExternalReadOutcome> {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, error: "unsafe", detail: "adresse illisible" };
      }
      if (opts.signal?.aborted) return { ok: false, error: "internal", detail: "lecture interrompue" };
      const failure = /^demo-([a-z]+)/.exec(bareHost(parsed.hostname))?.[1];
      const error = failure !== undefined && Object.hasOwn(FAILURES, failure) ? FAILURES[failure] : undefined;
      if (error) return { ok: false, error, detail: "site de démonstration" };
      const site = mockSite(parsed.href, now().toISOString());
      const maxPages = Math.max(1, Math.min(Math.trunc(opts.maxPages ?? EXTERNAL_SITE_LIMITS.maxPages) || 1, EXTERNAL_SITE_LIMITS.maxPages));
      return { ok: true, url: site.url, pages: site.pages.slice(0, maxPages), facts: site.facts, skipped: { robots: 0, failed: 0 } };
    },
  };
}
