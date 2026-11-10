/**
 * Pertinence d'une annonce de la bibliothèque publicitaire Meta pour la veille
 * d'un praticien : on ne garde que les annonces de praticiens, cabinets et
 * centres qui proposent leurs séances au public. Sont écartés d'office le
 * commerce (produits, compléments, applications, mutuelles, boutiques), la
 * formation et les services vendus aux praticiens (écoles, CPF, « remplissez
 * votre agenda »), les pratiques animalières et les annonces en langue
 * étrangère.
 *
 * Classement déterministe à points, réglé sur un relevé réel de la
 * bibliothèque (3 675 annonces, 16 métiers et spécialités) : chaque indice
 * ajoute ou retire des points, l'annonce est gardée à partir de
 * META_RELEVANCE_MIN_SCORE. Aucune dépendance base ou IA.
 */

import { adsProfessionFamily, normalizeAdsText } from "./google-ads";
import type { MetaAdLocation, MetaAdRecord } from "./meta-ads";

export const META_AD_KINDS = ["praticien", "formation", "commerce", "autre"] as const;
export type MetaAdKind = (typeof META_AD_KINDS)[number];

export type MetaAdRelevance = {
  kind: MetaAdKind;
  keep: boolean;
  score: number;
  /** Indices retenus, signés (« +3 métier dans le nom de page ») — journal et tests */
  reasons: string[];
};

/** Score à partir duquel une annonce est gardée. */
export const META_RELEVANCE_MIN_SCORE = 3;
/** Annonces d'une même page au-delà desquelles un ciblage national signe une marque. */
export const META_RELEVANCE_BRAND_VARIANTS = 8;
/** Portée européenne au-delà de laquelle l'annonceur n'est plus un cabinet. */
export const META_RELEVANCE_BRAND_REACH = 150_000;

/** Racines des métiers du soin et du bien-être, toutes familles confondues (début de mot). */
const PRACTICE_ROOTS: readonly string[] = [
  "osteo", "sophro", "hypno", "naturo", "reflexo", "reiki", "shiatsu", "kinesio", "acupunct", "chiro", "etiop", "magnet", "energet",
  "psychoprat", "psychotherap", "psycholog", "therapeut", "masseu", "massage", "massotherap", "dietet", "nutritionn", "coach", "yoga", "pilates",
  "meditation", "praticien", "cabinet", "sexolog", "doula", "relaxolog", "ayurved", "gestalt", "emdr", "fasciatherap", "microkine", "kinesither",
  "sonotherap", "art therap", "qi gong",
];

/** Métiers cités en liste dans une annonce qui s'adresse aux praticiens (« Sophrologue, naturopathe, coach : … »). */
const PROFESSION_LIST_ROOTS: readonly string[] = ["osteo", "sophro", "hypno", "naturo", "reflexo", "kinesio", "psychoprat", "therapeut", "coach", "masseu", "dietet", "energet", "magnet", "acupunct"];

/** Plateformes de prise de rendez-vous : le lien d'un praticien qui reçoit du public. */
const BOOKING_DOMAINS: readonly string[] = ["doctolib", "resalib", "medoucine", "crenolibre", "liberlo", "perfactive", "calendly", "planity", "clicrdv", "rdv360", "maiia", "ubiclic", "treatwell", "zencal", "simplybook"];

const CARE_MARKERS: readonly string[] = [
  "rendez vous", "rdv", "seance", "seances", "consultation", "consultations", "cabinet", "je vous accueille", "je vous accompagne", "je vous recois",
  "vous accueille", "vous recoit", "prise en charge", "a domicile", "votre osteopathe", "votre sophrologue", "votre hypnotherapeute", "votre naturopathe",
  "votre praticien", "votre praticienne", "votre therapeute", "atelier", "ateliers", "soin", "soins", "massage", "massages", "bilan", "creneau", "creneaux",
  "je vous aide", "vous aide", "j accompagne", "vous accompagne",
];

const COMMERCE_STRONG: readonly string[] = [
  "livraison", "code promo", "black friday", "black week", "black weeks", "black month", "black november", "cyber monday", "soldes", "en stock",
  "satisfait ou rembourse", "jours d essai", "nuits d essai", "complement alimentaire", "complements alimentaires", "gelule", "gelules", "matelas",
  "oreiller", "telecharger", "telechargez", "mutuelle", "mutuelles", "assurance", "comparateur", "pharmacie", "pharmacies", "best seller", "bestseller",
  "expedie", "expedition", "retour gratuit", "retours gratuits", "notre gamme", "nos produits", "ebook", "e book", "application mobile", "appli",
  "commandez", "commander", "ajouter au panier", "panier", "boutique en ligne", "notre boutique", "stock limite", "economisez", "paiement en 3",
  "paiement en 4", "lait infantile", "podcast",
];
const COMMERCE_WEAK: readonly string[] = [
  "promo", "boutique", "commande", "produit", "produits", "cure", "formule", "reduction", "reductions", "remise", "offre limitee", "achetez", "acheter",
  "application", "abonnement", "devis", "credit", "garantie", "ingredients", "marque", "livre",
];

const TRAINING_STRONG: readonly string[] = [
  "cpf", "certifiante", "diplomante", "se former", "formez vous", "devenez", "reconversion", "cursus", "portes ouvertes", "webinaire", "webinar",
  "masterclass", "professionnels de sante", "professionnels du bien etre", "votre patientele", "attirer des patients", "attirer des clients",
  "plus de patients", "plus de clients", "nouveaux patients", "remplir votre agenda", "votre agenda", "developper votre cabinet",
  "developper votre activite", "developpez votre", "boostez votre", "remplissez votre agenda", "votre activite", "lancer votre activite", "vos patients",
  "vos clients", "formation continue", "formation professionnelle", "etudiant", "etudiants", "logiciel", "recrute", "recrutement", "franchise", "franchises",
  "rejoignez notre reseau", "bouche a oreille", "annuaire", "chiffre d affaires",
];
/** Mots que la présentation d'un praticien emploie aussi (« diplômé de l'institut… », « mon site internet ») : un point au plus sans indice fort. */
const TRAINING_WEAK: readonly string[] = [
  "formation", "formations", "ecole", "institut", "diplome", "certification", "inscription", "inscriptions", "rentree", "therapeutes", "praticiens",
  "coachs", "module", "modules", "stagiaires", "site internet",
];
/** Un nom de page qui porte ces mots est un organisme de formation. */
const TRAINING_PAGE_WORDS: readonly string[] = ["formation", "formations", "ecole", "academie", "academy", "campus", "college", "universite", "school", "institut de formation"];

/** Spectacles et événements : l'hypnose de scène n'est pas une séance. */
const SHOW_MARKERS: readonly string[] = ["spectacle", "spectacles", "concert", "one man show", "stand up", "humour", "humoriste", "billetterie", "hypnose de rue", "show"];

const ANIMAL_MARKERS: readonly string[] = ["animalier", "animaliere", "animaux", "animal", "equin", "equine", "canin", "canine", "cheval", "chevaux", "chien", "chiens", "veterinaire", "equestre"];

/** Pays et groupes de pays hors de France : un ciblage qui les inclut n'est pas celui d'un cabinet. */
const FOREIGN_ZONES: readonly string[] = [
  "belgique", "luxembourg", "suisse", "espagne", "portugal", "italie", "allemagne", "pays bas", "canada", "royaume uni", "irlande", "worldwide", "europe",
  "european economic area eea",
];

/** Mots d'un domaine qui signent une boutique ou une application. */
const SHOP_DOMAIN_WORDS: readonly string[] = ["shop", "store", "boutique"];
/** Hébergeurs et messageries dont le nom finit par « app » sans être une application à vendre. */
const APP_SUFFIX_EXCEPTIONS = new Set(["app", "whatsapp"]);

/** « Remboursé par votre mutuelle », « prise en charge par certaines mutuelles » : la phrase d'un praticien, pas celle d'un assureur. */
const REIMBURSEMENT = /(?:rembours\w*|prise? en charge|pris en charge)[^.·!?]{0,40}?mutuelles?/g;

const COUNTRY_TYPES = new Set(["country", "countries", "country_group", "country_groups"]);
const REGION_TYPES = new Set(["region", "regions"]);

/** Zone ciblée à l'échelle d'un pays ou d'un groupe de pays (type de la bibliothèque, sinon nom « France »). */
export function isCountryLevelLocation(location: Pick<MetaAdLocation, "name" | "type">): boolean {
  const type = (location.type ?? "").toLowerCase();
  if (type !== "") return COUNTRY_TYPES.has(type);
  const name = normalizeAdsText(location.name);
  return name === "france" || FOREIGN_ZONES.includes(name);
}

function markerHits(text: string, markers: readonly string[]): string[] {
  const padded = ` ${text} `;
  return markers.filter((marker) => padded.includes(` ${marker} `));
}

function hasRootIn(text: string, roots: readonly string[]): boolean {
  if (text === "") return false;
  const words = text.split(" ");
  return roots.some((root) => (root.includes(" ") ? text.includes(root) : words.some((w) => w.startsWith(root))));
}

function distinctRoots(text: string, roots: readonly string[]): number {
  const words = text.split(" ");
  return roots.filter((root) => words.some((w) => w.startsWith(root))).length;
}

/** Texte publié hors gabarits dynamiques (« {{product.brand}} ») : ces champs ne disent rien de l'annonce. */
function realTexts(values: readonly string[]): string[] {
  return values.filter((v) => !/\{\{[^}]*\}\}/.test(v));
}

export type MetaRelevanceContext = {
  /** Métier du praticien (famille : racines du métier recherché) */
  profession: string;
  /** Annonces de la même page dans le relevé (une marque décline ses annonces par dizaines) */
  pageAdCount?: number;
};

/**
 * Classe une annonce : praticien (gardée) ou commerce, formation, autre
 * (écartées). `reasons` détaille les points pour le journal et les tests.
 */
export function metaAdRelevance(ad: MetaAdRecord, ctx: MetaRelevanceContext): MetaAdRelevance {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, why: string) => {
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${points} ${why}`);
  };

  if (ad.languages.length > 0 && !ad.languages.some((l) => l.toLowerCase().startsWith("fr"))) {
    return { kind: "autre", keep: false, score: -9, reasons: ["langue étrangère"] };
  }

  const family = adsProfessionFamily(ctx.profession);
  const ownRoots = family.roots.filter((r) => r.length >= 3);
  const page = normalizeAdsText(ad.pageName);
  const rawText = [...realTexts(ad.bodies), ...realTexts(ad.titles), ...realTexts(ad.descriptions)].join(" · ");
  const text = normalizeAdsText(rawText);
  // Texte sans les mentions de remboursement : « mutuelle » y reste un indice de commerce
  const commerceText = normalizeAdsText(rawText).replace(REIMBURSEMENT, " ");
  const caption = normalizeAdsText(ad.captions.join(" "));
  const everything = `${page} ${text} ${caption}`;

  const targeted = ad.targetLocations.filter((l) => !l.excluded);
  const countries = targeted.filter(isCountryLevelLocation);
  const regions = targeted.filter((l) => REGION_TYPES.has((l.type ?? "").toLowerCase()));
  const local = targeted.filter((l) => !isCountryLevelLocation(l) && !REGION_TYPES.has((l.type ?? "").toLowerCase()));
  const foreign = countries.filter((l) => FOREIGN_ZONES.includes(normalizeAdsText(l.name)));
  const isLocal = local.length > 0 || regions.length > 0;

  // ── Indices d'un praticien ──
  const pageOwn = hasRootIn(page, ownRoots);
  const pagePractice = pageOwn || hasRootIn(page, PRACTICE_ROOTS);
  if (pageOwn) add(4, "métier dans le nom de page");
  else if (pagePractice) add(2, "pratique de soin dans le nom de page");
  if (hasRootIn(caption, PRACTICE_ROOTS) || hasRootIn(caption, ownRoots)) add(2, "métier dans le lien");
  if (BOOKING_DOMAINS.some((d) => caption.includes(d))) add(3, "prise de rendez-vous en ligne");
  if (local.length > 0) add(2, "ciblage local");
  else if (regions.length > 0) add(1, "ciblage régional");
  if (!pageOwn && hasRootIn(text, ownRoots)) add(1, "métier dans le texte");
  const care = markerHits(text, CARE_MARKERS);
  if (care.length > 0) add(Math.min(2, care.length), `vocabulaire de soin (${care.slice(0, 3).join(", ")})`);

  // ── Indices contraires ──
  if (ownRoots.length > 0 && !hasRootIn(everything, ownRoots)) add(-2, "métier absent de l'annonce");
  if (!isLocal && countries.length > 0) add(-1, "ciblage national");
  if (foreign.length > 0) add(-1, "pays étrangers ciblés");

  const commerceStrong = markerHits(`${commerceText} ${page}`, COMMERCE_STRONG);
  const commerceWeak = markerHits(`${commerceText} ${page}`, COMMERCE_WEAK);
  const discount = /(?:-|jusqu['’]?\s?à\s?-?)\s?\d{1,2}\s?%/i.test(rawText) ? 1 : 0;
  const commercePoints = commerceStrong.length * 2 + commerceWeak.length + discount;
  const commerceWords = [...commerceStrong, ...commerceWeak].slice(0, 4).join(", ") || "remise en %";
  if (commercePoints >= 4) add(-5, `commerce (${commerceWords})`);
  else if (commercePoints >= 2) add(-3, `commerce (${commerceWords})`);
  else if (commercePoints === 1) add(-1, `commerce (${commerceWords})`);
  const shopDomain = caption
    .split(" ")
    .some((token) => SHOP_DOMAIN_WORDS.some((w) => token.includes(w)) || (token.endsWith("app") && !APP_SUFFIX_EXCEPTIONS.has(token)));
  if (shopDomain) add(-3, "lien de boutique ou d'application");

  const trainingStrong = markerHits(everything, TRAINING_STRONG);
  const trainingWeak = markerHits(everything, TRAINING_WEAK);
  const becoming = new RegExp(`\\bdevenir (?:${[...PRACTICE_ROOTS, "professeur", "formateur"].map((r) => r.replace(/ /g, "\\s")).join("|")})`).test(text) ? 1 : 0;
  const trainingStrongCount = trainingStrong.length + becoming;
  // Annonce locale sans indice fort : les mots faibles (« diplômé de l'institut… », « inscription à l'atelier ») ne pèsent qu'un point
  const weakCapped = trainingStrongCount === 0 && isLocal;
  const trainingPoints = trainingStrongCount * 2 + (weakCapped ? Math.min(1, trainingWeak.length) : trainingWeak.length);
  const trainingWords = [...trainingStrong, ...trainingWeak].slice(0, 4).join(", ") || "devenir praticien";
  if (trainingPoints >= 4) add(-6, `formation ou service aux praticiens (${trainingWords})`);
  else if (trainingPoints >= 2) add(-4, `formation ou service aux praticiens (${trainingWords})`);
  else if (trainingPoints === 1) add(-1, `formation ou service aux praticiens (${trainingWords})`);
  const trainingPage = markerHits(page, TRAINING_PAGE_WORDS).length > 0;
  if (trainingPage) add(-6, "organisme de formation");
  if (!isLocal && !pagePractice && distinctRoots(text, PROFESSION_LIST_ROOTS) >= 3) add(-3, "s'adresse aux praticiens (métiers en liste)");

  const show = markerHits(`${page} ${text}`, SHOW_MARKERS).length > 0;
  if (show) add(-6, "spectacle ou événement");

  const ownAnimal = hasRootIn(normalizeAdsText(ctx.profession), ANIMAL_MARKERS);
  const animal = !ownAnimal && markerHits(`${page} ${text}`, ANIMAL_MARKERS).length > 0;
  if (animal) add(-4, "pratique animalière");

  const brandVariants = (ctx.pageAdCount ?? 1) >= META_RELEVANCE_BRAND_VARIANTS && !isLocal;
  if (brandVariants) add(-3, `${ctx.pageAdCount} annonces nationales de la même page`);
  const brandReach = (ad.euTotalReach ?? 0) >= META_RELEVANCE_BRAND_REACH;
  if (brandReach) add(-2, "portée d'une marque");
  if (text === "" && !pagePractice) add(-1, "annonce sans texte");

  const keep = score >= META_RELEVANCE_MIN_SCORE;
  const kind: MetaAdKind = keep
    ? "praticien"
    : trainingPage || (trainingPoints >= 2 && trainingPoints >= commercePoints)
      ? "formation"
      : commercePoints >= 1 || shopDomain || brandVariants || brandReach
        ? "commerce"
        : "autre";
  return { kind, keep, score, reasons };
}

export type MetaRelevanceSummary = Record<Exclude<MetaAdKind, "praticien">, number>;

/**
 * Trie un relevé : annonces gardées et décompte des écartées par motif. Le
 * nombre d'annonces par page est compté sur le relevé entier (dédoublonné
 * par identifiant).
 */
export function filterRelevantAds(records: readonly MetaAdRecord[], ctx: Pick<MetaRelevanceContext, "profession">): { kept: MetaAdRecord[]; filtered: MetaRelevanceSummary } {
  const unique = new Map<string, MetaAdRecord>();
  for (const record of records) if (record.id && !unique.has(record.id)) unique.set(record.id, record);
  const perPage = new Map<string, number>();
  const pageKey = (ad: MetaAdRecord) => ad.pageId ?? normalizeAdsText(ad.pageName);
  for (const ad of unique.values()) perPage.set(pageKey(ad), (perPage.get(pageKey(ad)) ?? 0) + 1);
  const kept: MetaAdRecord[] = [];
  const filtered: MetaRelevanceSummary = { formation: 0, commerce: 0, autre: 0 };
  for (const ad of unique.values()) {
    const relevance = metaAdRelevance(ad, { profession: ctx.profession, pageAdCount: perPage.get(pageKey(ad)) ?? 1 });
    if (relevance.keep) kept.push(ad);
    else if (relevance.kind !== "praticien") filtered[relevance.kind]++;
  }
  return { kept, filtered };
}
