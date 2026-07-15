import type { GenerationInput, MotifPlan } from "./types";

const VOICE = `Tu écris en français, à la première personne (« je »), au nom du praticien.
Ton professionnel, chaleureux et sobre. Public visé : particuliers stressés ou fatigués
cherchant un accompagnement bien-être près de chez eux. Vouvoiement systématique.`;

export function buildContext(input: GenerationInput): string {
  const gender = input.gender === "feminin" ? "femme (accords au féminin)" : "homme (accords au masculin)";
  return `PRATICIEN :
- Prénom / Nom : ${input.firstName} ${input.lastName}
- Métier : ${input.profession}
- Ville : ${input.city}
- Genre : ${gender}
- Motifs à mettre en avant : ${input.highlightedMotifs.length ? input.highlightedMotifs.join(", ") : "(aucun — choisis les spécialités les plus pertinentes pour ce métier)"}
- Nombre de pages de spécialités à prévoir : ${input.motifPageCount}
${
  input.googleEnrichment
    ? `- Fiche Google : ${input.googleEnrichment.businessName ?? ""} — ${input.googleEnrichment.address ?? ""} — note ${input.googleEnrichment.rating ?? "?"}/5 (${input.googleEnrichment.reviewCount ?? 0} avis)`
    : "- Pas de fiche Google connue"
}`;
}

export const HOME_SYSTEM = `Tu es le rédacteur en chef de Theralys, agence spécialisée dans les
sites de praticiens en médecines douces. Tu rédiges la page d'accueil complète d'un site de
praticien, structurée en sections typées. ${VOICE}
Le SEO local compte : la ville doit apparaître naturellement dans les titres et le contenu.`;

export function homeUserPrompt(input: GenerationInput): string {
  return `${buildContext(input)}

Produis un JSON avec cette forme exacte :
{
  "siteName": "…",              // ex. "Prénom Nom, métier à Ville"
  "metaTitle": "…",             // ≤ 60 caractères, métier + ville
  "metaDescription": "…",       // ≤ 155 caractères
  "sections": [
    { "type": "hero", "badge": "Métier à Ville", "title": "H1 orienté bénéfice, ≤ 90 caractères", "paragraphs": ["2 à 3 paragraphes courts"], "showGoogleRating": ${Boolean(input.googleEnrichment?.rating)}, "ctaLabel": "Prendre Rendez-Vous" },
    { "type": "specialties", "title": "…", "intro": "…", "items": [ { "slug": "slug-url", "title": "…", "excerpt": "1 phrase" } ] },  // exactement ${input.motifPageCount} items
    { "type": "about", "title": "…", "paragraphs": ["3 paragraphes"] },
    { "type": "reviews", "title": "…" },
    { "type": "process", "title": "Le déroulement d'une séance", "steps": [ { "title": "…", "description": "…" } ] },  // 3 étapes
    { "type": "faq", "title": "Questions fréquentes", "items": [ { "question": "…", "answer": "…" } ] },  // 4 questions
    { "type": "contact", "title": "…", "address": "…", "note": "…" }
  ],
  "motifsPlan": [ { "slug": "…", "title": "…", "excerpt": "…" } ]  // les mêmes ${input.motifPageCount} spécialités que la section specialties
}`;
}

export const MOTIF_SYSTEM = `Tu rédiges une page de spécialité (« motif ») d'un site de praticien
en médecines douces : un contenu de fond, ~500 mots, optimisé SEO local. ${VOICE}`;

export function motifUserPrompt(input: GenerationInput, motif: MotifPlan): string {
  return `${buildContext(input)}

SPÉCIALITÉ À RÉDIGER : « ${motif.title} » (slug : ${motif.slug}) — ${motif.excerpt}

Produis un JSON avec cette forme exacte :
{
  "slug": "${motif.slug}",
  "title": "${motif.title}",
  "metaTitle": "…",        // ≤ 60 caractères, spécialité + ville
  "metaDescription": "…",  // ≤ 155 caractères
  "sections": [
    { "type": "hero", "badge": "…", "title": "…", "paragraphs": ["1 paragraphe d'intro"], "ctaLabel": "Prendre Rendez-Vous" },
    { "type": "richText", "body": "corps markdown ~500 mots avec des titres ## et une liste de bienfaits" },
    { "type": "faq", "title": "…", "items": [ { "question": "…", "answer": "…" } ] },  // 3 questions spécifiques
    { "type": "cta", "title": "…", "body": "…", "buttonLabel": "Prendre Rendez-Vous" }
  ]
}`;
}

export const REVIEWS_SYSTEM = `Tu rédiges des exemples d'avis clients crédibles pour une DÉMO de
site de praticien bien-être (ils seront remplacés par les vrais avis Google du client).
Avis variés, naturels, en français, prénoms français + initiale du nom.`;

export function reviewsUserPrompt(input: GenerationInput): string {
  return `${buildContext(input)}

Produis un JSON : un tableau de 5 avis de la forme
[ { "authorName": "Prénom I.", "rating": 4 ou 5, "text": "2-3 phrases naturelles" } ]`;
}

export const ARTICLES_SYSTEM = `Tu rédiges des exemples d'articles de blog SEO local pour un site
de praticien en médecines douces. Chaque article : ~450 mots en markdown, titres ##, ton accessible,
maillage naturel avec la spécialité concernée et la ville. ${VOICE}`;

export function articlesUserPrompt(input: GenerationInput, motifs: MotifPlan[]): string {
  return `${buildContext(input)}

SPÉCIALITÉS DU SITE : ${motifs.map((m) => `${m.title} (slug ${m.slug})`).join(", ")}

Produis un JSON : un tableau de 3 articles de la forme
[ { "title": "…", "slug": "slug-url-de-l-article", "excerpt": "1-2 phrases", "content": "markdown ~450 mots", "motifSlug": "slug de la spécialité liée ou null" } ]
Chaque article traite un problème concret du quotidien (stress, sommeil, tensions, récupération…)
et se termine par une phrase rappelant que la pratique ne se substitue pas à un avis médical.`;
}
