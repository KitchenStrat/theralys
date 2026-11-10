import { describe, expect, it } from "vitest";
import { metaLibraryUrl, type MetaAdLocation, type MetaAdRecord } from "./meta-ads";
import {
  META_AD_KINDS,
  META_RELEVANCE_BRAND_REACH,
  META_RELEVANCE_BRAND_VARIANTS,
  META_RELEVANCE_MIN_SCORE,
  filterRelevantAds,
  isCountryLevelLocation,
  metaAdRelevance,
  type MetaAdRelevance,
} from "./meta-relevance";

// ─── Fixtures (annonces synthétiques, noms fictifs) ──────────────────────────

function zone(name: string, type: string | null = null, excluded = false): MetaAdLocation {
  return { name, type, excluded };
}

const FRANCE = zone("France", "countries");
const COLOMIERS = zone("Colomiers, France", "CITY");
const REIMS = zone("Reims, France", "CITY");

/** Annonce nationale, en français, sans texte ni lien : chaque test n'ajoute que ce qu'il étudie. */
function ad(id: string, extra: Partial<MetaAdRecord> = {}): MetaAdRecord {
  return {
    id,
    pageId: `page-${id}`,
    pageName: `Page ${id}`,
    bodies: [],
    titles: [],
    descriptions: [],
    captions: [],
    libraryUrl: metaLibraryUrl(id),
    startedAt: "2026-10-01T00:00:00.000Z",
    stoppedAt: null,
    platforms: ["facebook", "instagram"],
    languages: ["fr"],
    euTotalReach: 2_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [FRANCE],
    payer: null,
    ...extra,
  };
}

function relevance(record: MetaAdRecord, profession = "Ostéopathe", pageAdCount?: number): MetaAdRelevance {
  return metaAdRelevance(record, { profession, pageAdCount });
}

/** Libellés des indices du journal (`reasons`), sans leurs points. */
const WHY = {
  ownPage: "métier dans le nom de page",
  practicePage: "pratique de soin dans le nom de page",
  link: "métier dans le lien",
  booking: "prise de rendez-vous en ligne",
  local: "ciblage local",
  regional: "ciblage régional",
  ownText: "métier dans le texte",
  care: "vocabulaire de soin",
  absent: "métier absent de l'annonce",
  national: "ciblage national",
  foreign: "pays étrangers ciblés",
  commerce: "commerce (",
  shop: "lien de boutique ou d'application",
  training: "formation ou service aux praticiens",
  school: "organisme de formation",
  list: "s'adresse aux praticiens",
  show: "spectacle ou événement",
  animal: "pratique animalière",
  animalCited: "animal cité dans l'annonce",
  variants: "annonces nationales de la même page",
  reach: "portée d'une marque",
  empty: "annonce sans texte",
  language: "langue étrangère",
} as const;

function reasonOf(result: MetaAdRelevance, fragment: string): string | undefined {
  return result.reasons.find((reason) => reason.includes(fragment));
}

function hasReason(result: MetaAdRelevance, fragment: string): boolean {
  return reasonOf(result, fragment) !== undefined;
}

/** Points de l'indice (signés), 0 s'il est absent : compare deux annonces sans figer le barème. */
function points(result: MetaAdRelevance, fragment: string): number {
  const reason = reasonOf(result, fragment);
  return reason ? Number.parseInt(reason, 10) : 0;
}

/** Exclusion ferme : un seul motif, sans points, qu'aucun autre indice ne rattrape. */
function isHardExclusion(result: MetaAdRelevance): boolean {
  return result.reasons.length === 1 && !/^[+-]\d/.test(result.reasons[0] ?? "");
}

const HARD = {
  school: "organisme de formation (nom de page)",
  show: "spectacle ou événement (nom de page)",
  animalPage: "pratique animalière (nom de page)",
  animalText: "pratique animalière",
} as const;

// Praticiens
const claire = ad("claire", {
  pageName: "Claire Martin - Ostéopathe",
  captions: ["clairemartin-osteopathe.fr"],
  targetLocations: [COLOMIERS],
  bodies: ["Votre ostéopathe vous accueille au cabinet de Colomiers. Prenez rendez-vous en ligne."],
});
const rendezVous = ad("rdv", {
  pageName: "Julien Morel",
  captions: ["doctolib.fr"],
  targetLocations: [zone("Épernay, France", "CITY")],
  bodies: ["Prise de rendez-vous en ligne."],
});
const visio = ad("visio", {
  pageName: "Lucie Bernard Sophrologue",
  captions: ["luciebernard-sophrologie.fr"],
  bodies: ["Séances de sophrologie en visio, partout en France."],
});
const paul = ad("paul", {
  pageName: "Paul Girard Ostéopathe",
  captions: ["paulgirard.fr"],
  targetLocations: [REIMS],
  bodies: ["Diplômé de l'Institut Supérieur d'Ostéopathie, je vous reçois au cabinet. Séances remboursées par certaines mutuelles."],
});

// Commerce
const laitInfantile = ad("lait", {
  pageName: "Petit Nuage Bébé",
  captions: ["petitnuage-bebe.fr"],
  euTotalReach: 800_000,
  titles: ["Le lait qui respecte bébé"],
  bodies: ["Notre lait de croissance bio, une formule douce pour votre nourrisson. Disponible en pharmacie."],
});
const blackMonth = ad("promo", {
  pageName: "Plume & Sommeil",
  captions: ["plume-sommeil.com"],
  titles: ["Offre Black Month"],
  bodies: ["Black Month : jusqu'à -50% sur toute la collection. Livraison offerte."],
});
const assurance = ad("assurance", {
  pageName: "Horizon Seniors",
  captions: ["horizon-seniors.fr"],
  bodies: ["Mutuelle senior : ostéopathie remboursée. Demandez votre devis gratuit en 2 minutes."],
});

// Formation et services aux praticiens
const ecole = ad("ecole", {
  pageName: "Institut de Formation en Ostéopathie",
  captions: ["ifo-osteo.fr"],
  targetLocations: [zone("Lyon, France", "CITY")],
  bodies: ["Portes ouvertes le 14 mars : découvrez notre cursus en 5 ans."],
});
const agenda = ad("agenda", {
  pageName: "Agenda Plein",
  captions: ["agendaplein.io"],
  bodies: ["Thérapeute, sophrologue, naturopathe : remplissez votre agenda grâce à notre méthode."],
});
const devenir = ad("devenir", {
  pageName: "Souffle & Sens",
  captions: ["souffle-sens.fr"],
  bodies: ["Envie de devenir sophrologue ? Découvrez notre programme."],
});

// Hors sujet
const spectacle = ad("spectacle", {
  pageName: "Théo Lambert - Hypnose en scène",
  targetLocations: [zone("Lille, France", "CITY")],
  bodies: ["Le spectacle d'hypnose qui fait rire toute la salle : un one man show à ne pas manquer."],
});
const animalier = ad("animalier", {
  pageName: "Léa Petit - Ostéopathe animalier",
  targetLocations: [REIMS],
  bodies: ["Pour votre cheval ou votre chien, je me déplace dans les écuries de la Marne."],
});
const gabarit = ad("gabarit", {
  pageName: "Nova",
  bodies: ["{{product.brand}}"],
  titles: ["{{product.name}}"],
  descriptions: ["{{product.description}}"],
});

// ─── Praticiens gardés ───────────────────────────────────────────────────────

describe("metaAdRelevance : annonces de praticiens gardées", () => {
  it("praticien local : métier dans le nom de page et dans le lien, ville ciblée, « cabinet » et « rendez-vous » dans le texte", () => {
    const result = relevance(claire);
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    expect(result.score).toBeGreaterThanOrEqual(META_RELEVANCE_MIN_SCORE);
    for (const why of [WHY.ownPage, WHY.link, WHY.local, WHY.care]) expect(hasReason(result, why), why).toBe(true);
    expect(reasonOf(result, WHY.care)).toContain("rendez vous");
    expect(reasonOf(result, WHY.care)).toContain("cabinet");
    for (const why of [WHY.national, WHY.absent, WHY.commerce, WHY.shop, WHY.training, WHY.school, WHY.ownText]) expect(hasReason(result, why), why).toBe(false);
  });

  it("lien de prise de rendez-vous (« doctolib.fr ») et ville ciblée : gardée même si le métier n'apparaît nulle part", () => {
    const result = relevance(rendezVous);
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    for (const why of [WHY.booking, WHY.local, WHY.absent]) expect(hasReason(result, why), why).toBe(true);
    expect(hasReason(result, WHY.ownPage)).toBe(false);
    for (const caption of ["resalib.fr", "www.medoucine.com", "calendly.com", "PERFACTIVE.FR", "liberlo.com"]) {
      expect(hasReason(relevance({ ...rendezVous, captions: [caption] }), WHY.booking), caption).toBe(true);
    }
    expect(hasReason(relevance({ ...rendezVous, captions: ["julienmorel.fr"] }), WHY.booking)).toBe(false);
  });

  it("praticien au ciblage national (séances en visio) : gardé grâce au métier dans le nom de page et à son propre domaine", () => {
    const result = relevance(visio, "Sophrologue");
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    for (const why of [WHY.ownPage, WHY.link, WHY.national]) expect(hasReason(result, why), why).toBe(true);
    expect(hasReason(result, WHY.local)).toBe(false);
    expect(points(result, WHY.national)).toBeLessThan(0);
  });

  it("« remboursé par certaines mutuelles » est la phrase d'un praticien : aucun indice de commerce", () => {
    const result = relevance(paul);
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    expect(hasReason(result, WHY.commerce)).toBe(false);
    for (const body of [
      "Séance remboursée par votre mutuelle.",
      "Consultation prise en charge par certaines mutuelles.",
      "Des soins pris en charge par les mutuelles.",
      "Remboursement possible selon votre mutuelle",
    ]) {
      expect(hasReason(relevance({ ...paul, bodies: [body] }), WHY.commerce), body).toBe(false);
    }
    // « mutuelle » hors d'une mention de remboursement reste un indice de commerce
    expect(reasonOf(relevance({ ...paul, bodies: ["Comparez les mutuelles en deux minutes."] }), WHY.commerce)).toContain("mutuelles");
  });

  it("annonce locale : les mots faibles de formation (« diplômé de l'institut… ») ne pèsent qu'un point au plus, quel que soit leur nombre", () => {
    const local = relevance(paul);
    expect(local.keep).toBe(true);
    expect(reasonOf(local, WHY.training)).toContain("institut");
    expect(hasReason(local, WHY.school)).toBe(false);
    const oneWeak = relevance({ ...paul, bodies: ["Passé par l'institut, je vous reçois au cabinet."] });
    const manyWeak = relevance({ ...paul, bodies: ["Diplômé de l'institut après une formation et une certification, je vous reçois au cabinet."] });
    expect(points(oneWeak, WHY.training)).toBeLessThan(0);
    expect(points(manyWeak, WHY.training)).toBe(points(oneWeak, WHY.training));
    expect(points(local, WHY.training)).toBe(points(oneWeak, WHY.training));
    expect(manyWeak.keep).toBe(true);
    // Ciblage régional : même plafond ; ciblage national : les mots faibles s'additionnent
    expect(points(relevance({ ...paul, targetLocations: [zone("Grand Est", "regions")] }), WHY.training)).toBe(points(local, WHY.training));
    expect(points(relevance({ ...paul, targetLocations: [FRANCE] }), WHY.training)).toBeLessThan(points(local, WHY.training));
    // Un indice fort lève le plafond, même en local
    const strong = relevance({ ...paul, bodies: ["Diplômé de l'institut, je propose une formation certifiante au cabinet."] });
    expect(points(strong, WHY.training)).toBeLessThan(points(local, WHY.training));
  });
});

describe("metaAdRelevance : phrases de praticien qui ne sont pas de la formation", () => {
  const local = ad("local", { pageName: "Paul Girard Ostéopathe", targetLocations: [REIMS] });

  it("« Nouveaux patients bienvenus. » sur la page d'un praticien local : gardée, sans indice de formation", () => {
    const result = relevance({ ...local, bodies: ["Nouveaux patients bienvenus."] });
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    expect(hasReason(result, WHY.training)).toBe(false);
    const booking = relevance({ ...rendezVous, bodies: ["Le cabinet accueille de nouveaux patients. Prise de rendez-vous en ligne."] });
    expect(booking).toMatchObject({ keep: true, kind: "praticien" });
    expect(hasReason(booking, WHY.training)).toBe(false);
  });

  it("« Tarif réduit pour les étudiants. » sur la page d'un praticien local : gardée — « étudiants » n'est qu'un mot faible", () => {
    const result = relevance({ ...local, bodies: ["Tarif réduit pour les étudiants."] });
    expect(result).toMatchObject({ keep: true, kind: "praticien" });
    expect(reasonOf(result, WHY.training)).toContain("etudiants");
    // Même poids qu'un autre mot faible seul, et plafonné en local comme eux
    expect(points(result, WHY.training)).toBe(points(relevance({ ...local, bodies: ["Passé par l'institut."] }), WHY.training));
    expect(points(relevance({ ...local, bodies: ["Tarif étudiant, sur inscription, à la rentrée."] }), WHY.training)).toBe(points(result, WHY.training));
    // Les indices forts gardent tout leur poids (« attirer des patients », « plus de patients »)
    const strong = relevance({ ...local, bodies: ["Attirer des patients sans effort."] });
    expect(points(strong, WHY.training)).toBeLessThan(points(result, WHY.training));
  });
});

// ─── Indices de ciblage ──────────────────────────────────────────────────────

describe("metaAdRelevance : ciblage local, régional, national, étranger", () => {
  const base = ad("zone", { pageName: "Paul Girard Ostéopathe", bodies: ["Séances au cabinet."] });
  const targeting = (...locations: MetaAdLocation[]) => relevance({ ...base, targetLocations: locations });

  it("types réels de la bibliothèque : ville, commune, code postal, quartier, département → local ; `regions` → régional ; `countries` → national", () => {
    for (const location of [
      zone("Colomiers, France", "CITY"),
      zone("Épernay", "COMMUNE"),
      zone("51100, France", "zips"),
      zone("5e arrondissement de Paris", "NEIGHBORHOOD"),
      zone("Marne", "DEPARTMENT"),
      zone("Reims", "MUNICIPALITY"),
      zone("Toulouse, Occitanie", "city"),
      zone("Toulouse"),
    ]) {
      const result = targeting(location);
      expect(hasReason(result, WHY.local), location.name).toBe(true);
      expect(hasReason(result, WHY.regional) || hasReason(result, WHY.national), location.name).toBe(false);
    }
    for (const location of [zone("Grand Est", "regions"), zone("Occitanie", "region")]) {
      const result = targeting(location);
      expect(hasReason(result, WHY.regional), location.name).toBe(true);
      expect(hasReason(result, WHY.local) || hasReason(result, WHY.national), location.name).toBe(false);
    }
    for (const location of [FRANCE, zone("France", "country"), zone("France"), zone("Europe", "country_groups")]) {
      const result = targeting(location);
      expect(hasReason(result, WHY.national), `${location.name} ${location.type}`).toBe(true);
      expect(hasReason(result, WHY.local) || hasReason(result, WHY.regional), location.name).toBe(false);
    }
  });

  it("le ciblage local rapporte plus que le régional, le national coûte ; une zone locale efface le « ciblage national »", () => {
    expect(points(targeting(REIMS), WHY.local)).toBeGreaterThan(points(targeting(zone("Grand Est", "regions")), WHY.regional));
    expect(points(targeting(zone("Grand Est", "regions")), WHY.regional)).toBeGreaterThan(0);
    expect(points(targeting(FRANCE), WHY.national)).toBeLessThan(0);
    const mixed = targeting(FRANCE, REIMS);
    expect(hasReason(mixed, WHY.local)).toBe(true);
    expect(hasReason(mixed, WHY.national)).toBe(false);
    // Ville et région ciblées : seul l'indice local est compté
    expect(hasReason(targeting(REIMS, zone("Grand Est", "regions")), WHY.regional)).toBe(false);
  });

  it("zones exclues ignorées ; sans zone ciblée : ni bonus ni malus de ciblage", () => {
    const excluded = targeting(FRANCE, zone("Reims, France", "CITY", true));
    expect(hasReason(excluded, WHY.local)).toBe(false);
    expect(hasReason(excluded, WHY.national)).toBe(true);
    const none = targeting();
    for (const why of [WHY.local, WHY.regional, WHY.national, WHY.foreign]) expect(hasReason(none, why), why).toBe(false);
  });

  it("pays étrangers ciblés (Belgique, Suisse, Europe) : indice contraire de plus, jamais pour la France seule", () => {
    expect(hasReason(targeting(FRANCE, zone("Belgique", "countries")), WHY.foreign)).toBe(true);
    expect(hasReason(targeting(FRANCE, zone("Suisse")), WHY.foreign)).toBe(true);
    expect(hasReason(targeting(zone("Europe", "country_groups")), WHY.foreign)).toBe(true);
    expect(hasReason(targeting(FRANCE), WHY.foreign)).toBe(false);
    expect(hasReason(targeting(FRANCE, zone("Belgique", "countries", true)), WHY.foreign)).toBe(false);
    expect(relevance({ ...base, targetLocations: [FRANCE, zone("Belgique", "countries")] }).score).toBeLessThan(relevance(base).score);
  });
});

// ─── Commerce ────────────────────────────────────────────────────────────────

describe("metaAdRelevance : commerce écarté", () => {
  it("marque de lait infantile : « formule », « pharmacie », ciblage national, portée d'une marque, métier absent", () => {
    const result = relevance(laitInfantile);
    expect(result).toMatchObject({ keep: false, kind: "commerce" });
    expect(result.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    for (const why of [WHY.absent, WHY.national, WHY.commerce, WHY.reach]) expect(hasReason(result, why), why).toBe(true);
    expect(reasonOf(result, WHY.commerce)).toContain("pharmacie");
    expect(reasonOf(result, WHY.commerce)).toContain("formule");
    for (const why of [WHY.ownPage, WHY.practicePage, WHY.link, WHY.local, WHY.care]) expect(hasReason(result, why), why).toBe(false);
  });

  it("portée d'une marque : à partir de META_RELEVANCE_BRAND_REACH, jamais en dessous ni sans portée connue", () => {
    expect(hasReason(relevance({ ...claire, euTotalReach: META_RELEVANCE_BRAND_REACH }), WHY.reach)).toBe(true);
    expect(hasReason(relevance({ ...claire, euTotalReach: META_RELEVANCE_BRAND_REACH - 1 }), WHY.reach)).toBe(false);
    expect(hasReason(relevance({ ...claire, euTotalReach: null }), WHY.reach)).toBe(false);
    expect(relevance({ ...claire, euTotalReach: META_RELEVANCE_BRAND_REACH }).score).toBeLessThan(relevance(claire).score);
  });

  it("e-commerce : « Black Month », « -50% », « livraison » et 15 déclinaisons nationales de la même page", () => {
    const result = relevance(blackMonth, "Ostéopathe", 15);
    expect(result).toMatchObject({ keep: false, kind: "commerce" });
    expect(reasonOf(result, WHY.commerce)).toContain("black month");
    expect(reasonOf(result, WHY.commerce)).toContain("livraison");
    expect(reasonOf(result, WHY.variants)).toContain("15 annonces nationales de la même page");
    // Sans le compte de la page : toujours du commerce, l'indice de marque en moins
    const alone = relevance(blackMonth);
    expect(alone).toMatchObject({ keep: false, kind: "commerce" });
    expect(hasReason(alone, WHY.variants)).toBe(false);
    expect(alone.score).toBeGreaterThan(result.score);
  });

  it("remise en pourcentage (« -50% », « jusqu'à 30 % ») : indice de commerce à elle seule", () => {
    for (const body of ["-50% sur tout le site", "Jusqu'à -30 % cette semaine", "jusqu’à 20% d'économie"]) {
      const result = relevance(ad("remise", { pageName: "Nova", bodies: [body] }));
      expect(hasReason(result, WHY.commerce), body).toBe(true);
      expect(result.kind, body).toBe("commerce");
    }
    expect(reasonOf(relevance(ad("remise", { pageName: "Nova", bodies: ["-50% sur tout le site"] })), WHY.commerce)).toContain("remise en %");
    expect(hasReason(relevance(ad("remise", { pageName: "Nova", bodies: ["Ouvert à 100 % aux débutants"] })), WHY.commerce)).toBe(false);
  });

  it("assurance : « mutuelle senior », « devis », ciblage national — même si « ostéopathie » figure dans le texte", () => {
    const result = relevance(assurance);
    expect(result).toMatchObject({ keep: false, kind: "commerce" });
    expect(reasonOf(result, WHY.commerce)).toContain("mutuelle");
    expect(reasonOf(result, WHY.commerce)).toContain("devis");
    expect(hasReason(result, WHY.ownText)).toBe(true);
    expect(hasReason(result, WHY.national)).toBe(true);
  });

  it("plus les mots de commerce s'accumulent, plus la pénalité est lourde ; le nom de page compte aussi", () => {
    const one = relevance(ad("c1", { pageName: "Nova", bodies: ["Découvrez notre boutique."] }));
    const two = relevance(ad("c2", { pageName: "Nova", bodies: ["Livraison rapide."] }));
    const many = relevance(ad("c3", { pageName: "Nova", bodies: ["Livraison rapide, code promo et soldes sur nos produits."] }));
    expect(points(one, WHY.commerce)).toBeLessThan(0);
    expect(points(two, WHY.commerce)).toBeLessThanOrEqual(points(one, WHY.commerce));
    expect(points(many, WHY.commerce)).toBeLessThan(points(one, WHY.commerce));
    expect(reasonOf(relevance(ad("c4", { pageName: "Ma Pharmacie Verte", bodies: ["Bienvenue."] })), WHY.commerce)).toContain("pharmacie");
  });

  it("lien de boutique ou d'application (« kureapp.health », « shop-xyz.com ») : écarté comme commerce", () => {
    const app = relevance(ad("app", { pageName: "Respire Demain", captions: ["kureapp.health"], bodies: ["Arrêtez de fumer grâce à l'hypnose."] }), "Hypnothérapeute");
    expect(app).toMatchObject({ keep: false, kind: "commerce" });
    expect(hasReason(app, WHY.shop)).toBe(true);
    expect(hasReason(app, WHY.commerce)).toBe(false);
    const shop = relevance(ad("shop", { pageName: "Zenova", captions: ["shop-xyz.com"], bodies: ["Le coussin qui soulage votre dos."] }));
    expect(shop).toMatchObject({ keep: false, kind: "commerce" });
    expect(hasReason(shop, WHY.shop)).toBe(true);
    for (const caption of ["zenova-store.com", "store-zen.com", "MA-BOUTIQUE-ZEN.FR", "eshop.zenova.fr", "shopping-zen.fr", "sereniteapp.io"]) {
      expect(hasReason(relevance({ ...claire, captions: [caption] }), WHY.shop), caption).toBe(true);
    }
    // Un nom qui finit par « store » ou « shop » n'est pas une boutique (« Pastore », « restore », « bishop »)
    for (const caption of ["pastore-osteopathe.fr", "restore-osteo.fr", "bishop-osteo.fr"]) {
      expect(hasReason(relevance({ ...claire, captions: [caption] }), WHY.shop), caption).toBe(false);
    }
  });

  it("lien vers un magasin d'applications (« apps.apple.com », « play.google.com ») : même indice", () => {
    for (const caption of ["apps.apple.com", "APPS.APPLE.COM", "play.google.com"]) {
      const result = relevance(ad("store", { pageName: "Respire Demain", captions: [caption], bodies: ["Arrêtez de fumer grâce à l'hypnose."] }), "Hypnothérapeute");
      expect(hasReason(result, WHY.shop), caption).toBe(true);
      expect(result.keep, caption).toBe(false);
      expect(result.kind, caption).toBe("commerce");
    }
    for (const caption of ["apple.com", "google.com", "maps.google.com"]) {
      expect(hasReason(relevance({ ...claire, captions: [caption] }), WHY.shop), caption).toBe(false);
    }
  });

  it("« whatsapp », « monsite.lovable.app » ou « bishop-osteo.fr » ne sont ni une boutique ni une application à vendre", () => {
    for (const caption of ["whatsapp", "WHATSAPP", "api.whatsapp.com", "wa.me", "monsite.lovable.app", "bishop-osteo.fr", "workshop-zen.fr", "clairemartin-osteopathe.fr", "doctolib.fr"]) {
      const result = relevance({ ...claire, captions: [caption] });
      expect(hasReason(result, WHY.shop), caption).toBe(false);
      expect(result.keep, caption).toBe(true);
    }
  });

  it("« Satisfait ou remboursé. Mutuelle santé dès 15 € » : deux phrases distinctes, la ponctuation borne la mention de remboursement et les indices de commerce restent", () => {
    const result = relevance(ad("garantie", { pageName: "Nova Santé", bodies: ["Satisfait ou remboursé. Mutuelle santé dès 15 € par mois."] }));
    expect(result).toMatchObject({ keep: false, kind: "commerce" });
    expect(reasonOf(result, WHY.commerce)).toContain("satisfait ou rembourse");
    expect(reasonOf(result, WHY.commerce)).toContain("mutuelle");
    // Même lecture quand les deux phrases sont séparées par « ! », un retour à la ligne ou deux champs de l'annonce
    for (const extra of [
      { bodies: ["Satisfait ou remboursé ! Mutuelle santé dès 15 € par mois"] },
      { bodies: ["Satisfait ou remboursé\nMutuelle santé dès 15 € par mois"] },
      { titles: ["Satisfait ou remboursé"], bodies: ["Mutuelle santé dès 15 € par mois"] },
    ]) {
      const other = relevance(ad("garantie", { pageName: "Nova Santé", ...extra }));
      expect(reasonOf(other, WHY.commerce), JSON.stringify(extra)).toContain("mutuelle");
      expect(other.kind, JSON.stringify(extra)).toBe("commerce");
    }
    // Dans la même phrase, la mention d'un praticien reste neutre, majuscules et pluriels compris
    for (const body of ["SÉANCES REMBOURSÉES PAR VOTRE MUTUELLE", "Consultations prises en charge par de nombreuses mutuelles."]) {
      expect(hasReason(relevance({ ...paul, bodies: [body] }), WHY.commerce), body).toBe(false);
    }
  });
});

// ─── Formation et services aux praticiens ────────────────────────────────────

describe("metaAdRelevance : formation et services aux praticiens écartés", () => {
  it("école : « Institut de Formation en Ostéopathie » — écartée d'office sur son nom de page, malgré le métier dans ce nom et le ciblage local", () => {
    const result = relevance(ecole);
    expect(result).toMatchObject({ keep: false, kind: "formation", reasons: [HARD.school] });
    expect(result.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    expect(isHardExclusion(result)).toBe(true);
  });

  it("école dont le nom de page ne dit rien : « portes ouvertes » et « cursus » dans le texte suffisent à l'écarter", () => {
    const result = relevance({ ...ecole, pageName: "IFO Lyon", bodies: ["Portes ouvertes le 14 mars : découvrez notre cursus d'ostéopathie en 5 ans."] });
    expect(result).toMatchObject({ keep: false, kind: "formation" });
    expect(isHardExclusion(result)).toBe(false);
    expect(reasonOf(result, WHY.training)).toContain("portes ouvertes");
    expect(reasonOf(result, WHY.training)).toContain("cursus");
    for (const why of [WHY.link, WHY.local, WHY.ownText]) expect(hasReason(result, why), why).toBe(true);
    expect(hasReason(result, WHY.school)).toBe(false);
  });

  it("marketing vendu aux praticiens : « Thérapeute, sophrologue, naturopathe : remplissez votre agenda », ciblage national", () => {
    const result = relevance(agenda, "Sophrologue");
    expect(result).toMatchObject({ keep: false, kind: "formation" });
    for (const why of [WHY.training, WHY.list, WHY.national]) expect(hasReason(result, why), why).toBe(true);
    expect(reasonOf(result, WHY.training)).toContain("remplissez votre agenda");
    for (const body of ["Attirer des patients sans y passer vos soirées.", "Le logiciel qui remplit votre cabinet.", "Développez votre activité de thérapeute.", "Plus de clients grâce à notre annuaire."]) {
      const other = relevance({ ...agenda, bodies: [body] }, "Sophrologue");
      expect(other.keep, body).toBe(false);
      expect(other.kind, body).toBe("formation");
    }
  });

  it("métiers cités en liste : l'indice ne vaut que pour une annonce nationale dont la page ne porte aucune pratique", () => {
    const list = ad("liste", { pageName: "Agenda Plein", bodies: ["Thérapeute, sophrologue, naturopathe : bienvenue."] });
    expect(hasReason(relevance(list, "Sophrologue"), WHY.list)).toBe(true);
    expect(hasReason(relevance({ ...list, targetLocations: [REIMS] }, "Sophrologue"), WHY.list)).toBe(false);
    expect(hasReason(relevance({ ...list, pageName: "Cabinet des Tilleuls" }, "Sophrologue"), WHY.list)).toBe(false);
    // Deux métiers ne font pas une liste
    expect(hasReason(relevance({ ...list, bodies: ["Sophrologue et naturopathe : bienvenue."] }, "Sophrologue"), WHY.list)).toBe(false);
  });

  it("« devenir sophrologue » (ou coach, professeur de yoga, art-thérapeute) : formation, même sans autre mot-clé", () => {
    const result = relevance(devenir, "Sophrologue");
    expect(result).toMatchObject({ keep: false, kind: "formation" });
    expect(hasReason(result, WHY.training)).toBe(true);
    expect(hasReason(result, WHY.school)).toBe(false);
    for (const [body, profession] of [
      ["Devenir coach de vie en six mois.", "Coach"],
      ["Devenir professeur de yoga.", "Professeur de yoga"],
      ["Devenir art-thérapeute, c'est possible.", "Sophrologue"],
      ["Devenez hypnothérapeute.", "Hypnothérapeute"],
      ["Une reconversion qui a du sens.", "Sophrologue"],
      ["Formation éligible au CPF.", "Sophrologue"],
    ] as const) {
      const other = relevance({ ...devenir, bodies: [body] }, profession);
      expect(other.keep, body).toBe(false);
      expect(other.kind, body).toBe("formation");
      expect(hasReason(other, WHY.training), body).toBe(true);
    }
    // « devenir » sans métier derrière n'est pas un indice
    expect(hasReason(relevance({ ...devenir, bodies: ["Devenir plus serein, séance après séance."] }, "Sophrologue"), WHY.training)).toBe(false);
  });

  it("un nom de page qui porte « Formation », « École », « Académie » (ou Campus, Academy) est un organisme de formation : exclusion ferme, un seul motif", () => {
    for (const pageName of ["Sophro Formation", "École du Souffle", "Académie Sophrologie Nantes", "Campus Bien-Être", "Hypno Academy", "Sophrologie - Formations en ligne", "Institut de formation Respire"]) {
      const result = relevance(ad("organisme", { pageName, bodies: ["Des séances pour souffler."] }), "Sophrologue");
      expect(result.reasons, pageName).toEqual([HARD.school]);
      expect(result.keep, pageName).toBe(false);
      expect(result.kind, pageName).toBe("formation");
      expect(result.score, pageName).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    }
    // Aucun indice de praticien ne la rattrape : métier dans le nom et le lien, ville ciblée, prise de rendez-vous, vocabulaire de soin
    const rescued = relevance(
      ad("organisme-local", { pageName: "Sophro Formation", captions: ["sophro-formation.fr", "doctolib.fr"], targetLocations: [REIMS], bodies: ["Séances et ateliers au cabinet, sur rendez-vous."] }),
      "Sophrologue",
    );
    expect(rescued).toMatchObject({ keep: false, kind: "formation", reasons: [HARD.school] });
    // Mot entier seulement : « Transformation », « Informations » ne sont pas « Formation »
    for (const pageName of ["Sophrologie & Transformation", "Informations Sophrologie Nantes", "Sophrologue Lucie Bernard"]) {
      expect(hasReason(relevance(ad("praticien", { pageName, bodies: ["Des séances pour souffler."] }), "Sophrologue"), WHY.school), pageName).toBe(false);
    }
  });

  it("à égalité de points, la formation l'emporte sur le commerce ; plus de commerce que de formation → commerce", () => {
    const training = relevance(ad("mixte-1", { pageName: "Nova", bodies: ["Reconversion : livraison du kit incluse."] }), "Sophrologue");
    expect(training).toMatchObject({ keep: false, kind: "formation" });
    expect(hasReason(training, WHY.training) && hasReason(training, WHY.commerce)).toBe(true);
    const commerce = relevance(ad("mixte-2", { pageName: "Nova", bodies: ["Livraison offerte, code promo et soldes : le kit de formation certifiante."] }), "Sophrologue");
    expect(commerce).toMatchObject({ keep: false, kind: "commerce" });
  });
});

// ─── Hors sujet ──────────────────────────────────────────────────────────────

describe("metaAdRelevance : hors sujet écarté (« autre »)", () => {
  it("langue étrangère (`languages: [\"nl\"]`) : écartée d'office, avant tout autre indice", () => {
    const result = relevance({ ...claire, languages: ["nl"] });
    expect(result).toMatchObject({ keep: false, kind: "autre", reasons: [WHY.language] });
    expect(result.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    expect(relevance({ ...claire, languages: ["en", "de"] })).toMatchObject({ keep: false, kind: "autre" });
    // Le français parmi les langues, ou aucune langue déclarée : l'annonce est notée normalement
    for (const languages of [["fr"], ["nl", "fr"], ["FR"], ["fr_FR"], []]) {
      const kept = relevance({ ...claire, languages });
      expect(kept.keep, JSON.stringify(languages)).toBe(true);
      expect(hasReason(kept, WHY.language), JSON.stringify(languages)).toBe(false);
    }
  });

  it("spectacle d'hypnose dans le texte : deux mots de spectacle (« spectacle », « one man show ») → exclusion ferme ; un seul → indice contraire", () => {
    const result = relevance(spectacle, "Hypnothérapeute");
    expect(result).toMatchObject({ keep: false, kind: "autre" });
    expect(isHardExclusion(result)).toBe(true);
    expect(result.reasons).toEqual(["spectacle ou événement"]);
    for (const body of ["Billetterie ouverte pour la tournée.", "Hypnose de rue ce samedi place de la mairie.", "Un one man show d'hypnose."]) {
      const single = relevance({ ...spectacle, bodies: [body] }, "Hypnothérapeute");
      expect(hasReason(single, WHY.show), body).toBe(true);
      expect(points(single, WHY.show), body).toBeLessThan(0);
      expect(isHardExclusion(single), body).toBe(false);
      expect(hasReason(single, WHY.ownPage), body).toBe(true);
    }
    // L'affiche d'une représentation locale, avec le métier dans le nom de page et le lien : écartée malgré tout
    const affiche = relevance(
      { ...spectacle, pageName: "Théo Lambert - Hypnose en scène", captions: ["hypnose-lambert.fr"], bodies: ["Spectacle d'hypnose : deux séances samedi, billetterie en ligne."] },
      "Hypnothérapeute",
    );
    expect(affiche).toMatchObject({ keep: false, kind: "autre" });
    expect(hasReason(relevance({ ...spectacle, bodies: ["Séance d'hypnose au cabinet, sur rendez-vous."] }, "Hypnothérapeute"), WHY.show)).toBe(false);
  });

  it("spectacle annoncé par le nom de page (« Spectacle », « Show », « Humoriste ») : exclusion ferme, quoi que dise l'annonce", () => {
    for (const pageName of ["Théo Lambert - Spectacle d'hypnose", "Hypno Show", "Théo Lambert, humoriste et hypnotiseur", "Billetterie Hypnose Lille"]) {
      const result = relevance({ ...spectacle, pageName, captions: ["hypnose-lambert.fr"], bodies: ["Séances d'hypnose au cabinet, sur rendez-vous."] }, "Hypnothérapeute");
      expect(result.reasons, pageName).toEqual([HARD.show]);
      expect(result.keep, pageName).toBe(false);
      expect(result.kind, pageName).toBe("autre");
      expect(result.score, pageName).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    }
    // Mot entier seulement
    expect(isHardExclusion(relevance({ ...spectacle, pageName: "Showroom Hypnose Lille", bodies: ["Séances d'hypnose au cabinet."] }, "Hypnothérapeute"))).toBe(false);
  });

  it("ostéopathe animalier pour un ostéopathe : écarté d'office sur son nom de page ; rien de tel quand le praticien est lui-même animalier", () => {
    const result = relevance(animalier, "Ostéopathe");
    expect(result).toMatchObject({ keep: false, kind: "autre", reasons: [HARD.animalPage] });
    expect(result.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    for (const pageName of ["Ostéopathie équine du Val", "Cabinet d'ostéopathie canine", "Ostéopathe pour chevaux et chiens", "Léa Petit - Ostéo animaux"]) {
      expect(relevance(ad("animal", { pageName, bodies: ["Séances à domicile."] })).reasons, pageName).toEqual([HARD.animalPage]);
    }

    for (const profession of ["Ostéopathe animalier", "Ostéopathe équin et canin"]) {
      const own = relevance(animalier, profession);
      expect(hasReason(own, WHY.animal), profession).toBe(false);
      expect(hasReason(own, WHY.animalCited), profession).toBe(false);
      expect(own.keep, profession).toBe(true);
      expect(own.kind, profession).toBe("praticien");
    }
    // Aucun mot animalier : rien à signaler pour un praticien « humain »
    expect(hasReason(relevance(claire), WHY.animal)).toBe(false);
    expect(hasReason(relevance(claire), WHY.animalCited)).toBe(false);
  });

  it("ostéopathe animalier local, avec son site et son vocabulaire de soin : écarté de la veille d'un ostéopathe, aucun indice ne le rattrape", () => {
    const typical = ad("animalier-local", {
      pageName: "Léa Petit - Ostéopathe animalier",
      captions: ["leapetit-osteopathe-animalier.fr", "doctolib.fr"],
      targetLocations: [REIMS],
      bodies: ["Séances d'ostéopathie pour votre cheval ou votre chien, à domicile et sur rendez-vous."],
    });
    expect(relevance(typical, "Ostéopathe")).toMatchObject({ keep: false, kind: "autre", reasons: [HARD.animalPage] });
    expect(relevance(typical, "Ostéopathe animalier")).toMatchObject({ keep: true, kind: "praticien" });
  });

  it("animaux dans le texte : plusieurs mots (« cheval », « chien ») → pratique animalière, exclusion ferme ; un seul (« animaux non admis ») → simple indice contraire", () => {
    // Page sans mot animalier : c'est le texte qui tranche
    const practice = ad("texte-animal", {
      pageName: "Léa Petit - Ostéopathe",
      captions: ["leapetit-osteopathe.fr"],
      targetLocations: [REIMS],
      bodies: ["Séances d'ostéopathie pour votre cheval ou votre chien, à domicile et sur rendez-vous."],
    });
    const excluded = relevance(practice);
    expect(excluded).toMatchObject({ keep: false, kind: "autre", reasons: [HARD.animalText] });
    expect(excluded.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
    expect(relevance({ ...practice, bodies: ["Ostéopathie équine et canine dans toute la Marne."] }).reasons).toEqual([HARD.animalText]);

    const mention = relevance({ ...paul, bodies: ["Je vous reçois au cabinet sur rendez-vous. Animaux non admis."] });
    expect(mention).toMatchObject({ keep: true, kind: "praticien" });
    expect(isHardExclusion(mention)).toBe(false);
    expect(points(mention, WHY.animalCited)).toBeLessThan(0);
    expect(hasReason(mention, WHY.animal)).toBe(false);
    expect(mention.score).toBeLessThan(relevance({ ...paul, bodies: ["Je vous reçois au cabinet sur rendez-vous."] }).score);

    // Praticien animalier : ses propres mots ne comptent pas contre lui
    const own = relevance(practice, "Ostéopathe animalier");
    expect(own).toMatchObject({ keep: true, kind: "praticien" });
    expect(hasReason(own, WHY.animal) || hasReason(own, WHY.animalCited)).toBe(false);
  });

  it("gabarits dynamiques seuls (« {{product.brand}} ») et page sans pratique : annonce sans texte, écartée", () => {
    const result = relevance(gabarit);
    expect(result).toMatchObject({ keep: false, kind: "autre" });
    expect(hasReason(result, WHY.empty)).toBe(true);
    expect(hasReason(result, WHY.care)).toBe(false);
    // Même verdict sans aucun champ texte
    expect(hasReason(relevance(ad("vide", { pageName: "Nova" })), WHY.empty)).toBe(true);
    // Une page qui porte une pratique n'est pas pénalisée pour ses gabarits
    const practice = relevance({ ...gabarit, pageName: "Cabinet Nova Ostéopathie" });
    expect(hasReason(practice, WHY.empty)).toBe(false);
    expect(hasReason(practice, WHY.ownPage)).toBe(true);
  });

  it("un champ à gabarit ne dit rien de l'annonce : ses mots ne comptent ni pour ni contre, les autres champs restent lus", () => {
    const templated = relevance(ad("gabarit-2", { pageName: "Nova", bodies: ["{{product.name}} : livraison offerte au cabinet"], titles: ["Ostéopathe à Reims"] }));
    expect(hasReason(templated, WHY.commerce)).toBe(false);
    expect(hasReason(templated, WHY.care)).toBe(false);
    expect(hasReason(templated, WHY.ownText)).toBe(true);
    expect(hasReason(templated, WHY.empty)).toBe(false);
  });
});

// ─── Barème : invariants ─────────────────────────────────────────────────────

describe("metaAdRelevance : un même animal cité au singulier et au pluriel", () => {
  it("« animaux » et « animal », « chien » et « chiens » : un seul indice, pas une exclusion ferme", () => {
    for (const body of ["Animaux non admis au cabinet. Merci de laisser votre animal à la maison.", "Votre chien est le bienvenu, les chiens d'assistance aussi."]) {
      const result = relevance({ ...claire, bodies: [`${claire.bodies[0] ?? ""} ${body}`] });
      expect(isHardExclusion(result), body).toBe(false);
      expect(result.reasons.some((reason) => reason.includes("animal cité dans l'annonce")), body).toBe(true);
      expect(result.keep, body).toBe(true);
    }
  });
});

describe("metaAdRelevance : invariants du classement", () => {
  const cases: [MetaAdRecord, string, number?][] = [
    [claire, "Ostéopathe"],
    [rendezVous, "Ostéopathe"],
    [visio, "Sophrologue"],
    [paul, "Ostéopathe"],
    [laitInfantile, "Ostéopathe"],
    [blackMonth, "Ostéopathe", 15],
    [assurance, "Ostéopathe"],
    [ecole, "Ostéopathe"],
    [agenda, "Sophrologue"],
    [devenir, "Sophrologue"],
    [spectacle, "Hypnothérapeute"],
    [animalier, "Ostéopathe"],
    [gabarit, "Ostéopathe"],
    [{ ...claire, languages: ["nl"] }, "Ostéopathe"],
  ];

  it("gardée ⇔ score ≥ META_RELEVANCE_MIN_SCORE ⇔ classée « praticien » ; le motif d'écart est l'un des trois autres", () => {
    expect(META_AD_KINDS).toEqual(["praticien", "formation", "commerce", "autre"]);
    for (const [record, profession, pageAdCount] of cases) {
      const result = relevance(record, profession, pageAdCount);
      expect(META_AD_KINDS, record.id).toContain(result.kind);
      expect(result.keep, record.id).toBe(result.score >= META_RELEVANCE_MIN_SCORE);
      expect(result.kind === "praticien", record.id).toBe(result.keep);
    }
  });

  it("journal : hors exclusion ferme, chaque indice est signé et le score est la somme des points", () => {
    const scored = cases.map(([record, profession, pageAdCount]) => [record.id, relevance(record, profession, pageAdCount)] as const).filter(([, result]) => !isHardExclusion(result));
    expect(scored.map(([id]) => id)).toEqual(["claire", "rdv", "visio", "paul", "lait", "promo", "assurance", "agenda", "devenir", "gabarit"]);
    for (const [id, result] of scored) {
      expect(result.reasons.length, id).toBeGreaterThan(0);
      for (const reason of result.reasons) expect(reason, id).toMatch(/^[+-]\d+ \S/);
      expect(result.reasons.reduce((sum, reason) => sum + Number.parseInt(reason, 10), 0), id).toBe(result.score);
    }
  });

  it("exclusions fermes (langue étrangère, nom de page, pratique animalière) : un seul motif sans points, même score pour toutes, jamais gardées", () => {
    const hard = [
      relevance({ ...claire, languages: ["nl"] }),
      relevance(ecole),
      relevance({ ...spectacle, pageName: "Hypno Show" }, "Hypnothérapeute"),
      relevance(animalier),
      relevance({ ...paul, bodies: ["Pour votre cheval ou votre chien."] }),
    ];
    expect(hard.map((result) => result.reasons)).toEqual([[WHY.language], [HARD.school], [HARD.show], [HARD.animalPage], [HARD.animalText]]);
    expect(hard.map((result) => result.kind)).toEqual(["autre", "formation", "autre", "autre", "autre"]);
    for (const result of hard) {
      expect(isHardExclusion(result)).toBe(true);
      expect(result.keep).toBe(false);
      expect(result.score).toBeLessThan(META_RELEVANCE_MIN_SCORE);
      expect(result.score).toBe(hard[0]!.score);
    }
  });

  it("classement déterministe, sans effet sur l'annonce ; le métier fait le tri (ostéopathe gardé pour un ostéopathe, moins bien noté pour un sophrologue)", () => {
    const before = JSON.stringify(claire);
    expect(relevance(claire)).toEqual(relevance(claire));
    expect(JSON.stringify(claire)).toBe(before);
    const other = relevance(claire, "Sophrologue");
    expect(other.score).toBeLessThan(relevance(claire).score);
    expect(hasReason(other, WHY.ownPage)).toBe(false);
    expect(hasReason(other, WHY.practicePage)).toBe(true);
    expect(hasReason(other, WHY.absent)).toBe(true);
  });
});

// ─── Annonces d'une même page (marques) ──────────────────────────────────────

describe("metaAdRelevance : annonces nationales d'une même page", () => {
  const national = ad("serie", { pageName: "Paul Girard Ostéopathe", bodies: ["Séances au cabinet."] });

  it("à partir de META_RELEVANCE_BRAND_VARIANTS annonces de la page, un ciblage national signe une marque", () => {
    expect(relevance(national).keep).toBe(true);
    expect(hasReason(relevance(national, "Ostéopathe", META_RELEVANCE_BRAND_VARIANTS - 1), WHY.variants)).toBe(false);
    const brand = relevance(national, "Ostéopathe", META_RELEVANCE_BRAND_VARIANTS);
    expect(reasonOf(brand, WHY.variants)).toContain(`${META_RELEVANCE_BRAND_VARIANTS} annonces nationales de la même page`);
    expect(brand.score).toBeLessThan(relevance(national).score);
    // Écartée pour ce seul motif : rangée avec le commerce
    expect(brand).toMatchObject({ keep: false, kind: "commerce" });
  });

  it("un ciblage local ou régional n'est jamais pénalisé, quel que soit le nombre d'annonces de la page", () => {
    for (const location of [REIMS, zone("Grand Est", "regions")]) {
      const result = relevance({ ...national, targetLocations: [location] }, "Ostéopathe", 40);
      expect(hasReason(result, WHY.variants), location.name).toBe(false);
      expect(result.keep, location.name).toBe(true);
    }
    expect(hasReason(relevance({ ...national, targetLocations: [] }, "Ostéopathe", 40), WHY.variants)).toBe(true);
  });
});

// ─── Zone de niveau pays ─────────────────────────────────────────────────────

describe("isCountryLevelLocation", () => {
  it("d'après le type de la bibliothèque (casse indifférente) : pays et groupes de pays seulement", () => {
    for (const type of ["countries", "country", "country_groups", "country_group", "COUNTRIES", "Country"]) {
      expect(isCountryLevelLocation({ name: "France", type }), type).toBe(true);
      expect(isCountryLevelLocation({ name: "Saint-Martin", type }), type).toBe(true);
    }
    for (const type of ["CITY", "city", "COMMUNE", "zips", "regions", "region", "NEIGHBORHOOD", "DEPARTMENT", "MUNICIPALITY"]) {
      expect(isCountryLevelLocation({ name: "Reims, France", type }), type).toBe(false);
      // Le type l'emporte sur le nom
      expect(isCountryLevelLocation({ name: "Belgique", type }), type).toBe(false);
    }
  });

  it("sans type (null ou vide) : d'après le nom — « France », pays et groupes de pays étrangers connus", () => {
    for (const name of ["France", "france", "FRANCE", "Belgique", "Suisse", "Pays-Bas", "Royaume-Uni", "Europe", "Worldwide", "European Economic Area (EEA)"]) {
      expect(isCountryLevelLocation({ name, type: null }), name).toBe(true);
      expect(isCountryLevelLocation({ name, type: "" }), name).toBe(true);
    }
    for (const name of ["Paris, France", "Toulouse", "Occitanie", "Île-de-France", "Grand Est", "51100, France", ""]) {
      expect(isCountryLevelLocation({ name, type: null }), name).toBe(false);
    }
  });
});

// ─── Tri d'un relevé ─────────────────────────────────────────────────────────

describe("filterRelevantAds", () => {
  it("garde les annonces de praticiens dans l'ordre du relevé et compte les écartées par motif", () => {
    const records = [laitInfantile, claire, ecole, { ...rendezVous, languages: ["nl"] }, paul, assurance, gabarit];
    const { kept, filtered } = filterRelevantAds(records, { profession: "Ostéopathe" });
    expect(kept.map((a) => a.id)).toEqual(["claire", "paul"]);
    expect(kept[0]).toBe(claire);
    expect(filtered).toEqual({ formation: 1, commerce: 2, autre: 2 });
    expect(kept.length + filtered.formation + filtered.commerce + filtered.autre).toBe(records.length);
  });

  it("relevé vide ou entièrement pertinent : compteurs à zéro", () => {
    expect(filterRelevantAds([], { profession: "Ostéopathe" })).toEqual({ kept: [], filtered: { formation: 0, commerce: 0, autre: 0 } });
    expect(filterRelevantAds([claire, paul], { profession: "Ostéopathe" })).toEqual({ kept: [claire, paul], filtered: { formation: 0, commerce: 0, autre: 0 } });
  });

  it("dédoublonne par identifiant (la première occurrence l'emporte) et ignore les identifiants vides", () => {
    const records = [claire, { ...laitInfantile, id: "claire" }, laitInfantile, { ...laitInfantile }, { ...claire, id: "" }, { ...laitInfantile, id: "" }];
    const { kept, filtered } = filterRelevantAds(records, { profession: "Ostéopathe" });
    expect(kept).toEqual([claire]);
    expect(filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    // Le relevé n'est pas modifié
    expect(records).toHaveLength(6);
  });

  it("le métier du praticien fait le tri : la même annonce est gardée pour un sophrologue, écartée pour un ostéopathe", () => {
    expect(filterRelevantAds([visio], { profession: "Sophrologue" }).kept).toEqual([visio]);
    const other = filterRelevantAds([visio], { profession: "Ostéopathe" });
    expect(other.kept).toEqual([]);
    expect(other.filtered.formation + other.filtered.commerce + other.filtered.autre).toBe(1);
  });

  describe("annonces par page, comptées sur le relevé entier", () => {
    /** `count` annonces nationales d'une même page de praticien, chacune gardée si elle était seule. */
    const series = (count: number, extra: Partial<MetaAdRecord> = {}, prefix = "s") =>
      Array.from({ length: count }, (_, i) => ad(`${prefix}${i + 1}`, { pageId: "page-serie", pageName: "Paul Girard Ostéopathe", bodies: ["Séances au cabinet."], ...extra }));

    it("une page aux META_RELEVANCE_BRAND_VARIANTS annonces nationales est pénalisée : toutes écartées (commerce) ; une de moins, toutes gardées", () => {
      const brand = filterRelevantAds(series(META_RELEVANCE_BRAND_VARIANTS), { profession: "Ostéopathe" });
      expect(brand.kept).toEqual([]);
      expect(brand.filtered).toEqual({ formation: 0, commerce: META_RELEVANCE_BRAND_VARIANTS, autre: 0 });
      const practitioner = filterRelevantAds(series(META_RELEVANCE_BRAND_VARIANTS - 1), { profession: "Ostéopathe" });
      expect(practitioner.kept).toHaveLength(META_RELEVANCE_BRAND_VARIANTS - 1);
      expect(practitioner.filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
    });

    it("le compte se fait après dédoublonnage : des doublons d'identifiant ne font pas une marque", () => {
      const records = [...series(META_RELEVANCE_BRAND_VARIANTS - 1), ...series(3)];
      expect(filterRelevantAds(records, { profession: "Ostéopathe" }).kept).toHaveLength(META_RELEVANCE_BRAND_VARIANTS - 1);
    });

    it("le compte porte sur toutes les annonces de la page, mais seules ses annonces nationales sont pénalisées", () => {
      const local = series(2, { targetLocations: [REIMS] }, "local-");
      const national = series(META_RELEVANCE_BRAND_VARIANTS - 2, {}, "national-");
      const { kept, filtered } = filterRelevantAds([...national, ...local], { profession: "Ostéopathe" });
      expect(kept.map((a) => a.id)).toEqual(["local-1", "local-2"]);
      expect(filtered.commerce).toBe(META_RELEVANCE_BRAND_VARIANTS - 2);
      // Les mêmes annonces locales, en nombre : jamais pénalisées
      expect(filterRelevantAds(series(20, { targetLocations: [REIMS] }), { profession: "Ostéopathe" }).kept).toHaveLength(20);
    });

    it("sans `pageId`, la page se reconnaît à son nom normalisé ; deux `pageId` différents restent deux pages", () => {
      const byName = series(META_RELEVANCE_BRAND_VARIANTS, { pageId: null }).map((record, i) => (i % 2 === 0 ? record : { ...record, pageName: "PAUL GIRARD — ostéopathe" }));
      expect(filterRelevantAds(byName, { profession: "Ostéopathe" }).kept).toEqual([]);
      const twoPages = series(META_RELEVANCE_BRAND_VARIANTS).map((record, i) => ({ ...record, pageId: i % 2 === 0 ? "page-a" : "page-b" }));
      expect(filterRelevantAds(twoPages, { profession: "Ostéopathe" }).kept).toHaveLength(META_RELEVANCE_BRAND_VARIANTS);
    });

    it("des pages sans rapport ne sont jamais comptées ensemble : noms en cyrillique, en idéogrammes, en émojis, ou sans nom du tout", () => {
      const names = ["Йога Студия", "瑜伽", "🌿", "✨✨", "Ёлка", "•", "—", "♥"];
      expect(names).toHaveLength(META_RELEVANCE_BRAND_VARIANTS);
      const practitioner = { pageId: null, captions: ["osteopathe-exemple.fr"], bodies: ["Ostéopathe : séances au cabinet, sur rendez-vous."] };
      const distinct = names.map((pageName, i) => ad(`d${i + 1}`, { ...practitioner, pageName }));
      expect(filterRelevantAds(distinct, { profession: "Ostéopathe" }).kept).toHaveLength(META_RELEVANCE_BRAND_VARIANTS);
      const nameless = names.map((_, i) => ad(`s${i + 1}`, { ...practitioner, pageName: i % 2 === 0 ? "" : "  " }));
      expect(filterRelevantAds(nameless, { profession: "Ostéopathe" }).kept).toHaveLength(META_RELEVANCE_BRAND_VARIANTS);
      // La même page au nom non latin, elle, reste une seule page
      const same = names.map((_, i) => ad(`c${i + 1}`, { ...practitioner, pageName: i % 2 === 0 ? "Йога Студия" : " йога студия " }));
      const merged = filterRelevantAds(same, { profession: "Ostéopathe" });
      expect(merged.kept).toEqual([]);
      expect(merged.filtered.commerce).toBe(META_RELEVANCE_BRAND_VARIANTS);
    });

    it("même verdict que metaAdRelevance appelé avec le compte de la page", () => {
      const records = [...series(META_RELEVANCE_BRAND_VARIANTS), claire, blackMonth];
      const { kept, filtered } = filterRelevantAds(records, { profession: "Ostéopathe" });
      const verdicts = records.map((record) => relevance(record, "Ostéopathe", record.pageId === "page-serie" ? META_RELEVANCE_BRAND_VARIANTS : 1));
      expect(kept).toEqual(records.filter((_, i) => verdicts[i]!.keep));
      for (const kind of ["formation", "commerce", "autre"] as const) {
        expect(filtered[kind], kind).toBe(verdicts.filter((v) => !v.keep && v.kind === kind).length);
      }
    });
  });
});
