/**
 * Planificateur Google Ads — STUB du lot B, à remplacer intégralement par le
 * lot C (`createGoogleAdsPlanner`, `googleAdsPlanSchema`, prompts,
 * `finalizeAdsPlan`, `mockAdsPlan`). Il n'existe que pour permettre au service
 * `runGoogleAdsAnalysis` (packages/jobs) de compiler et de tourner en mock :
 * toujours en mode « mock », aucun appel modèle, plan déterministe et conforme
 * à `adsPlanIssues` (titres ≤ 30, descriptions ≤ 90, pages d'atterrissage
 * parmi celles du site, budget du diagnostic).
 */

import {
  GOOGLE_ADS_RADIUS_KM,
  GOOGLE_ADS_RSA,
  adsPlanIssues,
  clampAdText,
  type GoogleAdsAdGroup,
  type GoogleAdsLandingPage,
  type GoogleAdsPlan,
  type GoogleAdsPlanInput,
  type SocialSiteBrief,
} from "@theralys/shared";
import type { completeStructured } from "./anthropic";

export type GoogleAdsPlanner = {
  mode: "anthropic" | "mock";
  plan(brief: SocialSiteBrief, input: GoogleAdsPlanInput): Promise<GoogleAdsPlan>;
};

/** Stub : mode mock quel que soit l'environnement (le lot C branche `resolveAiMode` et `completeStructured`). */
export function createGoogleAdsPlanner(
  _env: NodeJS.ProcessEnv = process.env,
  _deps: { complete?: typeof completeStructured } = {},
): GoogleAdsPlanner {
  return { mode: "mock", plan: async (brief, input) => stubAdsPlan(brief, input) };
}

function landingFor(intent: GoogleAdsAdGroup["intent"], keywords: string[], pages: GoogleAdsLandingPage[]): string {
  if (intent === "specialite") {
    const words = new Set(keywords.flatMap((k) => k.toLowerCase().split(/\s+/)).filter((w) => w.length >= 5));
    const page = pages.find((p) => p.kind === "motif" && p.title.toLowerCase().split(/\s+/).some((w) => words.has(w)));
    if (page) return page.path;
  }
  return pages.find((p) => p.kind === "home")?.path ?? "/";
}

/** Plan déterministe minimal : un groupe par intention présente (≤ 4), une annonce par groupe, jalons J+7/30/60/90. */
export function stubAdsPlan(brief: SocialSiteBrief, input: GoogleAdsPlanInput, now = new Date()): GoogleAdsPlan {
  const { profession, city, firstName, lastName } = brief.practitioner;
  const job = profession.toLowerCase();
  const instructions = input.instructions?.trim() ?? "";
  const skipTarif = /sans\s+tarif/i.test(instructions);
  const matchOf = new Map(input.keywords.keywords.map((k) => [k.keyword, k.match]));
  const groups = input.keywords.groups.filter((g) => !(skipTarif && g.intent === "tarif")).slice(0, 4);
  const fallback = [{ intent: "metier_ville" as const, label: "Métier + ville", keywords: [`${job} ${city.toLowerCase()}`.trim()] }];
  const headlines = [`${profession} à ${city}`, "Prendre rendez-vous", `Cabinet à ${city}`, "Séances sur rendez-vous", `${firstName} ${lastName}`, "Accompagnement personnalisé"];
  const descriptions = [
    `${profession} à ${city} : séances individuelles, accueil bienveillant. Prenez rendez-vous en ligne ou par téléphone.`,
    `Un accompagnement adapté à votre situation, au cabinet à ${city}. Première séance sur rendez-vous.`,
  ];
  const adGroups: GoogleAdsAdGroup[] = (groups.length > 0 ? groups : fallback).map((group) => ({
    name: `${group.label} — ${profession}`,
    intent: group.intent,
    keywords: group.keywords.slice(0, 8).map((text) => ({ text, match: matchOf.get(text) ?? "phrase" })),
    landingPath: landingFor(group.intent, group.keywords, input.landingPages),
    ads: [
      {
        headlines: [...new Set(headlines.map((h) => clampAdText(h, GOOGLE_ADS_RSA.headlineMax)).filter(Boolean))].slice(0, GOOGLE_ADS_RSA.headlinesMax),
        descriptions: descriptions.map((d) => clampAdText(d, GOOGLE_ADS_RSA.descriptionMax)),
        path1: clampAdText(city.toLowerCase().replace(/\s+/g, "-"), GOOGLE_ADS_RSA.pathMax) || null,
        path2: "rendez-vous",
      },
    ],
  }));
  const budget = input.diagnostic.budget;
  const plan: GoogleAdsPlan = {
    version: 1,
    generatedAt: now.toISOString(),
    generator: "mock",
    objective: `Obtenir des prises de contact (rendez-vous, appels) de patients cherchant un ${job} autour de ${city}.`,
    summary: `Une campagne Réseau de Recherche ciblée à ${GOOGLE_ADS_RADIUS_KM} km autour du cabinet, ${adGroups.length} groupe${adGroups.length > 1 ? "s" : ""} d'annonces par intention, un budget de ${budget.monthlyRecommendedEur} € par mois. Les conversions (clic RDV, appel) guident les enchères après le premier mois.`,
    campaign: {
      name: `Recherche — ${profession} ${city}`,
      geo: { city, radiusKm: GOOGLE_ADS_RADIUS_KM, note: "Rayon autour du cabinet ; exclure les zones où vous ne consultez pas." },
      schedule: "Tous les jours, 7 h – 21 h ; renforcer les créneaux où le téléphone est tenu.",
      bidding: "Maximiser les clics avec un CPC max le premier mois, puis Maximiser les conversions dès 15 conversions mesurées.",
      dailyBudgetEur: budget.dailyRecommendedEur,
      monthlyBudgetEur: budget.monthlyRecommendedEur,
    },
    adGroups,
    negatives: [...new Set(input.keywords.negatives)],
    extensions: {
      sitelinks: input.landingPages.slice(0, 4).map((p) => ({ title: clampAdText(p.title, 25), path: p.path })),
      callouts: ["Sur rendez-vous", "Accueil bienveillant", "Séances individuelles"],
      call: true,
      location: input.diagnostic.checks.some((c) => c.id === "profile_linked" && c.status === "ok"),
    },
    milestones: [
      { horizon: "J+7", title: "Lancement vérifié", actions: ["Vérifier la diffusion des annonces", "Contrôler les termes de recherche et ajouter des négatifs"], kpis: ["Impressions", "Taux de clics"] },
      { horizon: "J+30", title: "Premiers contacts", actions: ["Comparer les groupes d'annonces", "Ajuster le CPC max"], kpis: ["Clics", "Conversions", "Coût par contact"] },
      { horizon: "J+60", title: "Optimisation", actions: ["Mettre en pause les mots-clés sans contact", "Tester une nouvelle annonce"], kpis: ["Coût par contact", "Part d'impressions"] },
      { horizon: "J+90", title: "Bilan", actions: ["Décider du budget du trimestre suivant", "Passer aux enchères sur conversions"], kpis: ["Contacts par mois", "Retour sur dépense"] },
    ],
    tips: [
      "Répondez au téléphone pendant les heures de diffusion : l'appel est la conversion la plus fréquente.",
      "Relisez chaque semaine les termes de recherche réels et ajoutez les hors sujet en négatif.",
      "Gardez la page d'atterrissage cohérente avec l'annonce (même spécialité, même ville).",
      ...(instructions && !skipTarif ? [clampAdText(`Consigne prise en compte : ${instructions}`, 200)] : []),
      ...(skipTarif ? ["Conformément à votre consigne, aucun groupe « Tarifs » n'est proposé."] : []),
    ],
  };
  if (adsPlanIssues(plan).length > 0) throw new Error(`Plan mock non conforme : ${adsPlanIssues(plan).join(" ; ")}`);
  return plan;
}
