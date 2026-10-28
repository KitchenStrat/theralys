/**
 * STUB (lot B) — planificateur Meta Ads minimal, à remplacer par le lot C
 * (`createMetaAdsPlanner` réel : prompts, schémas zod, finalisation,
 * conformité). Il n'expose que la signature du contrat et des sorties mock
 * déterministes en français, conformes à `metaCreativeIssues`,
 * `metaVideoPlanIssues` et `metaPlanIssues`. En mode « anthropic » (clé
 * présente sans AI_MOCK), chaque méthode échoue explicitement : jamais de
 * textes simulés présentés comme générés sur un site client.
 */

import {
  GOOGLE_ADS_RADIUS_KM,
  META_ADS_TEXT,
  META_MARKET_MIN_LOCAL,
  clampMetaText,
  type MetaAdCreative,
  type MetaAdsCreativeSet,
  type MetaAdsCta,
  type MetaAdsGenerationInput,
  type MetaAdsMarket,
  type MetaAdsPlan,
  type MetaAdsPlanInput,
  type MetaAdsVideoPlan,
  type MetaMarketInsights,
  type MetaVideoBrief,
  type SocialSiteBrief,
} from "@theralys/shared";
import type { completeStructured } from "./anthropic";
import { resolveAiMode } from "./generate-site";

export type MetaAdsPlanner = {
  mode: "anthropic" | "mock";
  analyzeMarket(brief: SocialSiteBrief, market: MetaAdsMarket): Promise<MetaMarketInsights>;
  createCreatives(brief: SocialSiteBrief, input: MetaAdsGenerationInput): Promise<MetaAdsCreativeSet>;
  createVideoPlan(brief: SocialSiteBrief, input: MetaAdsGenerationInput): Promise<MetaAdsVideoPlan>;
  createPlan(brief: SocialSiteBrief, input: MetaAdsPlanInput): Promise<MetaAdsPlan>;
};

export type MetaAdsPlannerDeps = { complete?: typeof completeStructured };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function instructionNote(instructions: string | undefined): string[] {
  const clean = instructions?.replace(/\s+/g, " ").trim();
  return clean ? [`Instructions prises en compte : « ${clean} ».`] : [];
}

/** Synthèse mock de la veille : angles et accroches tirés des annonces les mieux notées. */
export function mockMarketInsights(brief: SocialSiteBrief, market: MetaAdsMarket): MetaMarketInsights {
  const top = [...market.ads].sort((a, b) => b.score - a.score).slice(0, 6);
  const local = market.counts.ville + market.counts.departement;
  const hooks = top.map((ad) => ad.titles[0] ?? ad.bodies[0]?.split(/[.!?]/)[0] ?? "").filter((h) => h.trim() !== "").slice(0, 5);
  const offers = market.ads
    .map((ad) => ad.bodies[0] ?? "")
    .filter((body) => /découverte|offert|€/i.test(body))
    .map((body) => body.split(/[.!?]/)[0]!.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    summary: `${market.ads.length} annonce${market.ads.length > 1 ? "s" : ""} de praticiens repérée${market.ads.length > 1 ? "s" : ""} (${local} près de ${brief.practitioner.city || "chez vous"}) : offres découverte, pédagogie sur la séance et ancrage local dominent ; peu d'annonces racontent le praticien lui-même.`,
    angles: [
      { label: "Première séance rassurante", description: "Expliquer comment se passe une séance et lever les freins.", adIds: top.slice(0, 2).map((a) => a.id) },
      { label: "Offre découverte", description: "Une séance à tarif réduit ou un premier échange offert.", adIds: top.slice(2, 4).map((a) => a.id) },
      { label: "Proximité", description: "Le cabinet, le quartier, l'accès facile.", adIds: top.slice(4, 6).map((a) => a.id) },
    ],
    hooks: hooks.length > 0 ? hooks : ["Et si vous preniez un moment pour vous ?"],
    offers: offers.length > 0 ? offers : ["Première séance sur rendez-vous"],
    formats: "Visuels fixes avec une phrase courte ; quelques vidéos courtes face caméra dans les stories.",
    seasonality: "Rentrée de septembre et janvier : pics d'annonces ; l'été est calme.",
    gaps: ["Aucune annonce ne montre le praticien et le cabinet en vidéo courte.", "Les avis Google sont rarement cités."],
    warnings: local < META_MARKET_MIN_LOCAL ? ["Peu d'annonces locales : la veille a été élargie, les repères restent indicatifs."] : [],
  };
}

/** 4 créas (5 avec des avis Google rassurants), un angle différent chacune, textes dans les bornes de META_ADS_TEXT. */
export function mockMetaCreatives(brief: SocialSiteBrief, input: MetaAdsGenerationInput): MetaAdsCreativeSet {
  const { practitioner } = brief;
  const practice = practitioner.practiceName;
  const city = practitioner.city || "votre ville";
  const photoId = brief.photos[0]?.id ?? null;
  const template = photoId ? "photo-titre" : "affirmation";
  const home = input.landingPages.find((p) => p.kind === "home")?.path ?? input.landingPages[0]?.path ?? "/";
  const motif = input.landingPages.find((p) => p.kind === "motif")?.path ?? home;
  const cta: MetaAdsCta = brief.hasBookingUrl ? "BOOK_NOW" : "CONTACT_US";
  const t = (text: string, max: number) => clampMetaText(text, max);
  const creative = (c: Omit<MetaAdCreative, "template" | "accentRole" | "photoId">): MetaAdCreative => ({ ...c, template, accentRole: "primary", photoId });
  const creatives: MetaAdCreative[] = [
    creative({
      id: "c1",
      angle: "reassurance",
      name: t("Première séance en douceur", 40),
      primaryText: `Une première séance de ${practice}, c'est d'abord un temps d'écoute. On avance à votre rythme, sans objectif de performance. Cabinet à ${city}, sur rendez-vous.`,
      headline: t(`${capitalize(practice)} à ${city}`, META_ADS_TEXT.headlineMax),
      description: t("Sur rendez-vous", META_ADS_TEXT.descriptionMax),
      cta,
      hook: t("Un temps pour vous, à votre rythme", META_ADS_TEXT.hookMax),
      subline: t(`${capitalize(practice)} à ${city} · première séance sur rendez-vous`, META_ADS_TEXT.sublineMax),
      altText: `${practitioner.firstName} ${practitioner.lastName}, ${practitioner.profession} à ${city}`,
      landingPath: home,
    }),
    creative({
      id: "c2",
      angle: "education",
      name: t("Une séance, concrètement", 40),
      primaryText: `Comment se passe une séance de ${practice} ? Un échange, des exercices simples de respiration et de relâchement, puis un temps de retour. Pas besoin d'expérience.`,
      headline: t("Une séance, concrètement", META_ADS_TEXT.headlineMax),
      description: t("Respiration, détente, écoute", META_ADS_TEXT.descriptionMax),
      cta: "LEARN_MORE",
      hook: t("Comment se passe une séance ?", META_ADS_TEXT.hookMax),
      subline: t("Un échange, des exercices simples, un temps de retour", META_ADS_TEXT.sublineMax),
      altText: `Déroulé d'une séance de ${practice}`,
      landingPath: motif,
    }),
    creative({
      id: "c3",
      angle: "local",
      name: t(`Le cabinet à ${city}`, 40),
      primaryText: `${practitioner.firstName} ${practitioner.lastName}, ${practitioner.profession} à ${city}. Un cabinet calme, facile d'accès, et des créneaux en semaine comme le samedi. Prise de rendez-vous en ligne.`,
      headline: t(`${practitioner.firstName} ${practitioner.lastName}, ${practitioner.profession}`, META_ADS_TEXT.headlineMax),
      description: t(`Cabinet à ${city}`, META_ADS_TEXT.descriptionMax),
      cta,
      hook: t(`Votre cabinet de ${practice} à ${city}`, META_ADS_TEXT.hookMax),
      subline: t("Accès facile, créneaux en semaine et le samedi", META_ADS_TEXT.sublineMax),
      altText: `Le cabinet de ${practitioner.firstName} ${practitioner.lastName} à ${city}`,
      landingPath: home,
    }),
    creative({
      id: "c4",
      angle: "decouverte",
      name: t("Franchir le pas", 40),
      primaryText: `Et si vous franchissiez le pas ? Une première séance de ${practice} pour découvrir la démarche, poser vos questions et repartir avec un exercice à reprendre chez vous.`,
      headline: t("Et si vous franchissiez le pas ?", META_ADS_TEXT.headlineMax),
      description: t("Première séance découverte", META_ADS_TEXT.descriptionMax),
      cta,
      hook: t("Et si vous franchissiez le pas ?", META_ADS_TEXT.hookMax),
      subline: t("Une première séance pour découvrir la démarche", META_ADS_TEXT.sublineMax),
      altText: `Première séance de ${practice} à ${city}`,
      landingPath: motif,
    }),
  ];
  if (brief.google && brief.google.rating >= 4.3 && brief.google.reviewCount >= 10) {
    creatives.push(
      creative({
        id: "c5",
        angle: "temoignage",
        name: t("Ils en parlent", 40),
        primaryText: `${brief.google.reviewCount} avis Google, note ${brief.google.rating.toFixed(1).replace(".", ",")} : merci pour vos retours. Ce qui revient le plus souvent : l'écoute et des outils concrets à reprendre chez soi.`,
        headline: t(`${brief.google.reviewCount} avis Google`, META_ADS_TEXT.headlineMax),
        description: t(`Note ${brief.google.rating.toFixed(1).replace(".", ",")} sur 5`, META_ADS_TEXT.descriptionMax),
        cta: "LEARN_MORE",
        hook: t("Ils en parlent mieux que nous", META_ADS_TEXT.hookMax),
        subline: t(`${brief.google.reviewCount} avis Google, note ${brief.google.rating.toFixed(1).replace(".", ",")}`, META_ADS_TEXT.sublineMax),
        altText: "Avis Google du cabinet",
        landingPath: home,
      }),
    );
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: "mock",
    creatives,
    notes: ["Testez les créas deux par deux pendant 14 jours et gardez celle qui génère le plus de prises de contact.", "Le visuel compte plus que le texte : une photo de vous au cabinet, lumineuse, sans filtre.", ...instructionNote(input.instructions)],
  };
}

/** 3 vidéos de 30 s en 9:16, 5 temps forts chacune. */
export function mockMetaVideoPlan(brief: SocialSiteBrief, input: MetaAdsGenerationInput): MetaAdsVideoPlan {
  const { practitioner } = brief;
  const practice = practitioner.practiceName;
  const city = practitioner.city || "votre ville";
  const cta: MetaAdsCta = brief.hasBookingUrl ? "BOOK_NOW" : "CONTACT_US";
  const common = {
    durationSeconds: 30,
    format: "9:16" as const,
    cta,
    doSay: ["Parlez à la première personne, calmement, comme à un visiteur du cabinet.", "Décrivez ce qui se passe pendant une séance, pas ce que la personne ressent."],
    dontSay: ["Jamais « vous souffrez », « votre stress » ni d'avant / après.", "Aucune promesse de résultat ni de guérison."],
  };
  const video = (v: Omit<MetaVideoBrief, keyof typeof common>): MetaVideoBrief => ({ ...common, ...v });
  const videos: MetaVideoBrief[] = [
    video({
      id: "v1",
      title: "Bienvenue au cabinet",
      angle: "local",
      goal: "Montrer le lieu et le praticien pour lever la peur de l'inconnu.",
      hook: `Voici le cabinet de ${practice} à ${city}, en 30 secondes.`,
      beats: [
        { at: 0, say: `Bonjour, je suis ${practitioner.firstName}, ${practitioner.profession} à ${city}.`, onScreen: clampMetaText(`${practitioner.firstName}, ${practitioner.profession} à ${city}`, 60), shot: "Face caméra devant la porte du cabinet, lumière du jour" },
        { at: 3, say: "Je vous fais visiter : voici la salle où l'on travaille ensemble.", onScreen: "La salle de séance", shot: "Travelling lent dans la salle, fauteuil, lumière douce" },
        { at: 10, say: "On commence toujours par un échange, puis des exercices simples.", onScreen: "Un échange, puis des exercices simples", shot: "Praticien assis, mains posées, cadrage poitrine" },
        { at: 20, say: "Le cabinet est facile d'accès, avec des créneaux en semaine et le samedi.", onScreen: "Semaine et samedi", shot: "Extérieur : rue, entrée, parking" },
        { at: 27, say: "Prenez rendez-vous en ligne, à bientôt.", onScreen: "Rendez-vous en ligne", shot: "Face caméra, sourire, bouton à l'écran" },
      ],
      shotList: ["Porte du cabinet (plan fixe)", "Salle de séance (travelling lent)", "Praticien face caméra", "Extérieur et accès"],
      caption: `Le cabinet de ${practice} à ${city} : un lieu calme, facile d'accès. Rendez-vous en ligne.`,
    }),
    video({
      id: "v2",
      title: "Une séance expliquée en 30 secondes",
      angle: "education",
      goal: "Expliquer concrètement le déroulé d'une séance.",
      hook: "Comment se passe une séance ? Je vous explique en 30 secondes.",
      beats: [
        { at: 0, say: "Comment se passe une séance ? En trois temps.", onScreen: "Une séance en 3 temps", shot: "Face caméra, cadrage serré" },
        { at: 3, say: "Un : un temps d'échange pour comprendre ce qui vous amène.", onScreen: "1. Un temps d'échange", shot: "Deux fauteuils face à face, plan large" },
        { at: 12, say: "Deux : des exercices simples de respiration et de relâchement.", onScreen: "2. Des exercices simples", shot: "Démonstration d'une respiration, plan moyen" },
        { at: 21, say: "Trois : un temps de retour, et un exercice à reprendre chez vous.", onScreen: "3. Un temps de retour", shot: "Carnet, stylo, plan rapproché" },
        { at: 27, say: "Des questions ? Écrivez-moi ou prenez rendez-vous.", onScreen: "Prenez rendez-vous", shot: "Face caméra, bouton à l'écran" },
      ],
      shotList: ["Face caméra (3 prises)", "Fauteuils face à face", "Démonstration de respiration", "Carnet et stylo"],
      caption: `Une séance de ${practice}, concrètement : un échange, des exercices simples, un temps de retour. Rendez-vous en ligne.`,
    }),
    video({
      id: "v3",
      title: "Trois idées reçues",
      angle: "reassurance",
      goal: "Lever les freins les plus fréquents avec humour et douceur.",
      hook: `Trois idées reçues sur ${practice}, et ce qu'il en est vraiment.`,
      beats: [
        { at: 0, say: `Trois idées reçues sur ${practice}.`, onScreen: "3 idées reçues", shot: "Face caméra, fond neutre" },
        { at: 3, say: "« Il faut y croire. » Non : on fait des exercices concrets, c'est tout.", onScreen: "« Il faut y croire » : non", shot: "Face caméra, geste de la main" },
        { at: 12, say: "« C'est long. » Une séance dure environ une heure, et chacun avance à son rythme.", onScreen: "« C'est long » : une heure environ", shot: "Horloge du cabinet, plan rapproché" },
        { at: 21, say: "« Ce n'est pas pour moi. » On en parle lors d'un premier échange, sans engagement.", onScreen: "« Pas pour moi » : parlons-en", shot: "Face caméra, sourire" },
        { at: 27, say: "Première séance sur rendez-vous.", onScreen: "Première séance sur rendez-vous", shot: "Bouton à l'écran" },
      ],
      shotList: ["Face caméra (4 prises courtes)", "Horloge du cabinet", "Plan d'ambiance"],
      caption: `Trois idées reçues sur ${practice} : il faut y croire, c'est long, ce n'est pas pour moi. On en parle lors d'une première séance.`,
    }),
  ];
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: "mock",
    videos,
    equipment: ["Smartphone récent, en mode portrait, stabilisé sur un trépied.", "Lumière de face (fenêtre ou lampe douce), jamais à contre-jour.", "Micro-cravate ou pièce silencieuse ; parlez à 50 cm du téléphone."],
    editingTips: ["Coupez les silences : un plan toutes les 3 à 5 secondes.", "Sous-titres obligatoires (80 % des vidéos sont vues sans son).", "Musique discrète, export vertical 1080 × 1920.", ...instructionNote(input.instructions)],
  };
}

/** Plan : conversions dès que le Pixel est installé (check `pixel` ok), sinon trafic ; deux ensembles (large + reciblage) ; budget du diagnostic. */
export function mockMetaPlan(brief: SocialSiteBrief, input: MetaAdsPlanInput): MetaAdsPlan {
  const { diagnostic } = input;
  const hasPixel = diagnostic.checks.some((c) => c.id === "pixel" && c.status === "ok");
  const hasBooking = diagnostic.checks.some((c) => c.id === "booking" && c.status === "ok");
  const city = brief.practitioner.city || "votre ville";
  const creativeIds = [...(input.creatives?.creatives.map((c) => c.id) ?? []), ...(input.videoPlan?.videos.map((v) => v.id) ?? [])];
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: "mock",
    objective: {
      type: hasPixel ? "conversions_site" : "traffic",
      pixelEvent: hasBooking ? "Schedule" : "Contact",
      rationale: hasPixel
        ? "Le Pixel mesure les prises de contact sur le site : Meta optimise la diffusion vers les personnes qui prennent rendez-vous ou appellent."
        : "Installez le Pixel (onglet Paramétrage & suivi) : en attendant, l'objectif de trafic amène des visites sans mesurer les prises de contact.",
    },
    campaign: {
      name: `Meta Ads — ${brief.practitioner.practiceName} ${city}`,
      geo: { city, radiusKm: GOOGLE_ADS_RADIUS_KM, note: `Rayon de ${GOOGLE_ADS_RADIUS_KM} km autour du cabinet : le temps de trajet acceptable pour une séance.` },
      ages: { min: 25, max: 60 },
      gender: "all",
      placements: "Advantage+ (fil Facebook et Instagram, stories, Reels) ; retirez Audience Network.",
      language: "fr",
      schedule: "Diffusion continue, 7 jours sur 7 ; point hebdomadaire sur les résultats.",
    },
    adSets: [
      { name: "Large", audience: "large", details: `Audience Advantage+ dans un rayon de ${GOOGLE_ADS_RADIUS_KM} km autour de ${city}, 25–60 ans.`, creativeIds },
      { name: "Reciblage", audience: "retargeting", details: "Visiteurs du site des 30 derniers jours (Pixel) sans prise de contact.", creativeIds: creativeIds.slice(0, 2) },
    ],
    budget: {
      dailyEur: diagnostic.budget.dailyRecommendedEur,
      monthlyEur: diagnostic.budget.monthlyRecommendedEur,
      testPlan: "14 jours avec 3 créas dans l'ensemble « Large », puis conservez les deux meilleures et ajoutez une vidéo.",
    },
    milestones: [
      { horizon: "J+7", title: "Vérifier la diffusion", actions: ["Contrôler que chaque créa est approuvée et diffusée.", "Vérifier les événements Pixel dans le gestionnaire d'événements."], kpis: ["Couverture", "CPM", "Taux de clic ≥ 1 %"] },
      { horizon: "J+30", title: "Garder ce qui marche", actions: ["Couper la créa la moins performante.", "Ajouter une vidéo courte."], kpis: ["Coût par prise de contact", "Prises de contact ≥ 5"] },
      { horizon: "J+60", title: "Ajuster le budget", actions: ["Augmenter de 20 % si le coût par contact tient.", "Renouveler les visuels."], kpis: ["Coût par contact stable", "Part du reciblage"] },
    ],
    tips: ["Répondez aux commentaires sous vos annonces : cela compte dans la diffusion.", "Une seule modification à la fois, puis 7 jours d'observation.", ...instructionNote(input.instructions)],
  };
}

/**
 * Stub du contrat : mode « mock » (AI_MOCK=1 ou clé absente) → sorties
 * déterministes ; mode « anthropic » → échec explicite tant que le lot C
 * n'est pas intégré (l'analyse reste `done` sans créas, à régénérer).
 */
export function createMetaAdsPlanner(env: NodeJS.ProcessEnv = process.env, _deps: MetaAdsPlannerDeps = {}): MetaAdsPlanner {
  const mode = resolveAiMode(env);
  if (mode === "anthropic") {
    const notReady = async (): Promise<never> => {
      throw new Error("Planificateur Meta Ads non intégré (stub du lot B) : génération réelle indisponible");
    };
    return { mode, analyzeMarket: notReady, createCreatives: notReady, createVideoPlan: notReady, createPlan: notReady };
  }
  return {
    mode,
    analyzeMarket: async (brief, market) => mockMarketInsights(brief, market),
    createCreatives: async (brief, input) => mockMetaCreatives(brief, input),
    createVideoPlan: async (brief, input) => mockMetaVideoPlan(brief, input),
    createPlan: async (brief, input) => mockMetaPlan(brief, input),
  };
}
