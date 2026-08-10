import type { GenerationInput, MotifPlan } from "./types";

const VOICE = `Tu écris en français, à la première personne (« je »), au nom du praticien.
Ton professionnel, chaleureux et sobre. Public visé : particuliers stressés ou fatigués
cherchant un accompagnement bien-être près de chez eux. Vouvoiement systématique.

MISE EN FORME (impact) :
- Mets en **gras** (double astérisque) les 2 à 4 passages clés de chaque bloc de texte :
  bénéfices concrets, mots forts, éléments différenciants.
- Paragraphes courts : 1 à 3 phrases maximum, jamais de pavé.
- Pour énumérer des points forts, formations ou bénéfices : des lignes commençant par
  « ✅ » (une par point, séparées par des retours à la ligne).`;

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

export const HOME_SYSTEM = `Tu es le rédacteur en chef de Harmony, agence spécialisée dans les
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
    { "type": "hero", "badge": "Métier à Ville", "title": "H1 orienté bénéfice, ≤ 90 caractères", "paragraphs": ["2 à 3 paragraphes courts, avec des passages **gras**"], "showGoogleRating": ${Boolean(input.googleEnrichment?.rating)}, "ctaLabel": "Prendre Rendez-Vous", "stats": [ { "icon": "…", "value": "…", "label": "…" } ] },  // exactement 2 badges de preuve sociale, chiffres plausibles pour ce métier (le praticien les ajustera) : ex. « +1000 / Patients accompagnés », « 8 ans / D'expérience »${input.googleEnrichment?.rating ? " — utilise la note Google du contexte pour l'un des deux (ex. « 5/5 / Basé sur N avis Google », icon « etoile »)" : ""}
    { "type": "highlights", "items": [ { "icon": "…", "title": "2 à 4 mots", "text": "1 phrase courte" } ] },  // exactement 4 points forts concrets (approche, personnalisation, cadre, accès/praticité)
    { "type": "specialties", "title": "…", "intro": "…", "items": [ { "slug": "slug-url", "title": "…", "excerpt": "1 phrase" } ] },  // exactement ${input.motifPageCount} items
    { "type": "future", "badge": "2-3 mots (ex. « Santé & Équilibre »)", "title": "question projective ≤ 75 caractères (ex. « Et si vous retrouviez enfin un sommeil paisible ? »)", "intro": "1 phrase avec **gras** qui introduit la liste, se terminant par « il devient possible de : »", "bullets": ["exactement 5 lignes ; chaque ligne commence par un passage **gras** (le bénéfice) suivi d'un complément concret — possibilités et mieux-être, jamais de promesse de résultat"], "ctaLabel": "Prendre Rendez-Vous" },
    { "type": "about", "title": "…", "paragraphs": ["3 à 4 paragraphes courts avec **gras** ; le dernier est une liste de lignes ✅ (parcours, formations, points forts) séparées par des retours à la ligne"], "infoCards": [ { "icon": "…", "title": "…", "text": "avec **gras**" } ] },  // exactement 3 cartes infos pratiques : durée de la séance, tarification avec des montants réalistes pour ce métier (ex. « Consultation **60 €** — séance sportive **90 €** », CB/chèque/espèces — le praticien ajustera), remboursement/mutuelles (ex. « prise en charge par de nombreuses mutuelles »)
    { "type": "reviews", "title": "…" },
    { "type": "process", "title": "Le déroulement d'une séance", "steps": [ { "title": "…", "description": "…" } ] },  // exactement 4 étapes (ex. : échange, séance, retour au calme, suivi)
    { "type": "faq", "title": "Questions fréquentes", "items": [ { "question": "…", "answer": "…" } ] },  // exactement 7 questions (déroulement, préparation, durée, tarif/règlement, nombre de séances, public concerné, complémentarité avec un suivi médical)
    { "type": "contact", "title": "Informations", "address": "…", "phone": "06 39 98 01 23", "note": "…", "infoCards": [ { "icon": "medaille", "title": "6 années d'expérience", "text": "métier" }, { "icon": "carte", "title": "Cabinet facile d'accès", "text": "parking, horaires…" } ] }  // exactement 2 cartes ; le téléphone est un numéro fictif (plage réservée), le praticien mettra le sien
  ],
  "motifsPlan": [ { "slug": "…", "title": "…", "excerpt": "…" } ]  // les mêmes ${input.motifPageCount} spécialités que la section specialties
}

Icônes autorisées pour "icon" (choisis la plus pertinente) : medaille, diplome, coeur, mains, fleur, feuille, soleil, etoile, carte, maison, calendrier, horloge, euro, document, bouclier, personnes.

MOTIFS DE CONSULTATION (crucial) :
- Les items de "specialties" et "motifsPlan" sont de VRAIS motifs de consultation : les problèmes
  concrets pour lesquels on prend rendez-vous chez un praticien de ce métier précis.
  Exemples — ostéopathie : « Mal de dos et lombalgies », « Torticolis et cervicalgies »,
  « Coliques du nourrisson » ; hypnothérapie : « Arrêt du tabac », « Peurs et phobies »,
  « Troubles du sommeil » ; naturopathie : « Troubles digestifs », « Fatigue chronique »,
  « Équilibre hormonal ».
- JAMAIS de grands thèmes vagues (« Bien-être », « Détente », « Harmonie », « Équilibre de vie »).
- Chaque motif correspond à une pratique réelle et courante de ce métier, dans le respect de son
  cadre légal, et devient une page dédiée + un mot-clé de recherche Google local.`;
}

export const MOTIF_SYSTEM = `Tu rédiges une page de spécialité (« motif ») d'un site de praticien
en médecines douces : un contenu de fond, ~500 mots, optimisé SEO local. La page traite un VRAI
motif de consultation (le problème concret qui amène à prendre rendez-vous) : décris les
situations vécues, comment la pratique accompagne ce motif précis, à qui cela s'adresse —
sans jamais promettre de résultat. ${VOICE}`;

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

/**
 * Structure éditoriale imposée à TOUS les articles de blog (initiaux et
 * calendrier éditorial) — la page article du site public s'appuie dessus
 * (la section « Questions fréquentes » est rendue en accordéons).
 */
export const ARTICLE_STRUCTURE = `STRUCTURE OBLIGATOIRE du "content" markdown (identique pour tous les articles, ~600 mots) :
1. Un paragraphe d'accroche qui décrit la situation vécue par le lecteur (PAS de titre # — le titre s'affiche au-dessus).
2. Un « ## » pour comprendre ce qui se passe (titre libre) : 2 paragraphes courts, puis une sous-liste à puces des signes ou zones les plus fréquents (4-5 puces commençant par un passage **gras**).
3. Une citation d'une seule phrase en blockquote (« > ») : parole typique d'un patient, en italique.
4. Un « ## » sur ce que la pratique peut apporter (titre libre) : 1-2 paragraphes, puis une liste numérotée de 4-5 apports concrets (début en **gras**) — des possibilités, jamais de promesse de résultat.
5. « ### Un exercice à essayer maintenant » : 1 phrase d'introduction puis une liste numérotée de 5 à 7 étapes simples réalisables chez soi.
6. « ## Quand consulter ? » : 3-4 puces de situations où une consultation peut aider, puis 1 paragraphe rappelant que la pratique ne se substitue pas à un avis médical et qu'une douleur intense ou persistante relève d'un professionnel de santé.
7. « ## Questions fréquentes » : exactement 3 questions ; chaque question seule sur sa ligne en **gras** (ex. **Le stress peut-il causer des douleurs ?**), suivie d'un paragraphe de réponse.`;

export function articlesUserPrompt(input: GenerationInput, motifs: MotifPlan[]): string {
  return `${buildContext(input)}

MOTIFS DE CONSULTATION DU SITE : ${motifs.map((m) => `${m.title} (slug ${m.slug})`).join(", ")}

Produis un JSON : un tableau de 3 articles de la forme
[ { "title": "…", "slug": "slug-url-de-l-article", "excerpt": "1-2 phrases", "content": "markdown", "motifSlug": "slug du motif traité" } ]
Chaque article approfondit UN des motifs de consultation ci-dessus ("motifSlug" = son slug,
un motif différent par article) : il répond à une vraie question que se posent les personnes
concernées — celle qu'elles taperaient dans Google (ex. « Comment soulager une lombalgie au
bureau ? ») — avec des conseils concrets, la manière dont la pratique peut accompagner, et la
ville pour le référencement local. L'article complète la page de spécialité sans la répéter.

${ARTICLE_STRUCTURE}`;
}
