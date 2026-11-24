/**
 * Base de connaissances de l'équipe commerciale : ses rubriques, l'état d'une
 * fiche, la forme réduite d'une question (pour retrouver celle qu'on a déjà
 * posée) et le classement des fiches proches d'une question. Module sans
 * dépendance serveur : il sert aux écrans, aux actions et au prompt.
 */

// ─── Rubriques ───────────────────────────────────────────────────────────────

/** Dans l'ordre où la base les présente. La dernière reçoit ce qui ne va nulle part ailleurs. */
export const KNOWLEDGE_CATEGORIES = [
  { id: "offre", label: "Offre et formules", hint: "ce qu'est Harmony, ce que comprend chaque formule, à qui elle s'adresse" },
  { id: "tarifs", label: "Tarifs et engagement", hint: "prix, durées de facturation, économies, engagement, paiement" },
  { id: "site", label: "Site internet", hint: "création, contenu, nom de domaine, hébergement, site déjà existant" },
  { id: "blog", label: "Blog et référencement", hint: "articles, mots-clés, place dans Google" },
  { id: "google", label: "Fiche Google et avis", hint: "fiche d'établissement, Google Maps, avis" },
  { id: "social", label: "Réseaux sociaux", hint: "Instagram, Facebook, contenus à poster" },
  { id: "ads", label: "Publicité", hint: "Google Ads, Meta Ads, budget publicitaire" },
  { id: "accompagnement", label: "Mise en place et accompagnement", hint: "démonstration, délais, prise en main, formation, assistance" },
  { id: "concurrence", label: "Concurrence et alternatives", hint: "autre prestataire, agence, outil à faire soi-même, bouche-à-oreille" },
  { id: "autre", label: "Autres sujets" },
] as const;

export type KnowledgeCategoryId = (typeof KNOWLEDGE_CATEGORIES)[number]["id"];

export const FALLBACK_CATEGORY: KnowledgeCategoryId = "autre";

export function isKnowledgeCategory(value: unknown): value is KnowledgeCategoryId {
  return typeof value === "string" && KNOWLEDGE_CATEGORIES.some((category) => category.id === value);
}

export function categoryLabel(id: string): string {
  return KNOWLEDGE_CATEGORIES.find((category) => category.id === id)?.label ?? KNOWLEDGE_CATEGORIES[KNOWLEDGE_CATEGORIES.length - 1]!.label;
}

// ─── Type et état d'une fiche ────────────────────────────────────────────────

export const KNOWLEDGE_KINDS = ["question", "objection"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KIND_LABELS: Record<KnowledgeKind, string> = { question: "Question", objection: "Objection" };

export function isKnowledgeKind(value: unknown): value is KnowledgeKind {
  return value === "question" || value === "objection";
}

/**
 * `ai` : réponse de l'assistant, pas encore relue. `review` : à vérifier —
 * l'assistant n'avait pas l'information, ou quelqu'un de l'équipe a demandé
 * une relecture. `validated` : relue ou écrite par l'admin ; elle fait foi,
 * et l'assistant s'appuie dessus pour ses réponses suivantes.
 */
export const KNOWLEDGE_STATUSES = ["ai", "review", "validated"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  ai: "Réponse de l'assistant",
  review: "À vérifier",
  validated: "Validée par Harmony",
};

export function isKnowledgeStatus(value: unknown): value is KnowledgeStatus {
  return typeof value === "string" && (KNOWLEDGE_STATUSES as readonly string[]).includes(value);
}

/** Longueurs d'une fiche. Celles de la réponse suivent ce que l'assistant rend. */
export const KNOWLEDGE_LIMITS = { questionMin: 8, question: 500, title: 160, reply: 900, details: 2400, search: 80 } as const;

// ─── Retrouver une question déjà posée ───────────────────────────────────────

/**
 * Forme réduite d'une question : minuscules, sans accent, sans ponctuation.
 * « Y a-t-il un engagement ? » et « y a t il un engagement » sont la même.
 */
export function questionKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Mots qui ne disent rien du sujet d'une question. */
const STOPWORDS = new Set(
  "a ai au aux avec ca ce ces cette c d de des du elle en est et il ils j je l la le les leur lui m ma mais me mes moi mon n ne nos notre nous on ou par pas pour qu que quel quelle quels qui s sa se ses si son sur t ta te tes toi ton tu un une vos votre vous y deja tres trop plus moins bien comment combien pourquoi quand est-ce faut peut puis dois doit fait faire avoir etre ete suis sont dit dire".split(" "),
);

/** Mots porteurs d'une question, ramenés à leur début (« sites » et « site » se rejoignent). */
export function questionTerms(text: string): string[] {
  const terms = questionKey(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map((word) => word.slice(0, 6));
  return [...new Set(terms)];
}

/** Part des mots de la question retrouvés dans un texte (0 à 1). */
export function relevance(terms: readonly string[], text: string): number {
  if (terms.length === 0) return 0;
  const found = new Set(questionTerms(text));
  return terms.filter((term) => found.has(term)).length / terms.length;
}

/**
 * Les fiches les plus proches d'une question, de la plus proche à la moins
 * proche ; à proximité égale, l'ordre d'arrivée est gardé (les appelants
 * donnent les plus posées d'abord). `min` : proximité en dessous de laquelle
 * une fiche n'est pas retenue.
 */
export function closest<T>(question: string, items: readonly T[], textOf: (item: T) => string, limit: number, min = 0): T[] {
  const terms = questionTerms(question);
  return items
    .map((item, index) => ({ item, index, score: relevance(terms, textOf(item)) }))
    .filter((entry) => entry.score >= min)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

// ─── Filtres de la page ──────────────────────────────────────────────────────

export const KNOWLEDGE_SORTS = ["asked", "recent"] as const;
export type KnowledgeSort = (typeof KNOWLEDGE_SORTS)[number];

export type KnowledgeFilters = {
  q: string;
  category: KnowledgeCategoryId | "";
  kind: KnowledgeKind | "";
  status: KnowledgeStatus | "";
  /** Seulement les questions que la personne a posées elle-même */
  mine: boolean;
  sort: KnowledgeSort;
};

export const EMPTY_KNOWLEDGE_FILTERS: KnowledgeFilters = { q: "", category: "", kind: "", status: "", mine: false, sort: "asked" };

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parseKnowledgeFilters(params: Params): KnowledgeFilters {
  const category = first(params.rubrique);
  const kind = first(params.type);
  const status = first(params.etat);
  return {
    q: first(params.q).trim().slice(0, KNOWLEDGE_LIMITS.search),
    category: isKnowledgeCategory(category) ? category : "",
    kind: isKnowledgeKind(kind) ? kind : "",
    status: isKnowledgeStatus(status) ? status : "",
    mine: first(params.moi) === "1",
    sort: first(params.tri) === "recent" ? "recent" : "asked",
  };
}

/** Adresse de la base pour ces filtres : seuls ceux qui s'écartent du défaut y figurent. */
export function knowledgeHref(filters: KnowledgeFilters): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.category) query.set("rubrique", filters.category);
  if (filters.kind) query.set("type", filters.kind);
  if (filters.status) query.set("etat", filters.status);
  if (filters.mine) query.set("moi", "1");
  if (filters.sort !== "asked") query.set("tri", filters.sort);
  const text = query.toString();
  return text ? `/crm/questions?${text}` : "/crm/questions";
}

export function hasKnowledgeFilters(filters: KnowledgeFilters): boolean {
  return Boolean(filters.q || filters.category || filters.kind || filters.status || filters.mine);
}
