/**
 * Filtres de la liste des prospects. Ils vivent dans l'adresse de la page :
 * une vue filtrée se partage, se met en favori et survit au rechargement.
 * Module sans dépendance serveur.
 */

import { CRM_STAGES, STAGE_META, isCrmStage, sourceLabel, type CrmStage } from "./model";
import { cleanText } from "./normalize";

export const PAGE_SIZE = 50;
/** Cartes affichées par colonne du pipeline ; au-delà, la colonne renvoie à la liste. */
export const PIPELINE_COLUMN_LIMIT = 30;

export const REACH_OPTIONS = { email: "Avec e-mail", phone: "Avec téléphone", both: "E-mail et téléphone", none: "Sans moyen de contact" } as const;
export const ACTION_OPTIONS = { overdue: "Tâche en retard", today: "Tâche aujourd'hui", week: "Tâche dans les 7 jours", none: "Sans tâche prévue" } as const;
export const CREATED_OPTIONS = { "7": "Ajoutés depuis 7 jours", "30": "Ajoutés depuis 30 jours", "90": "Ajoutés depuis 90 jours" } as const;
export const TOUCHED_OPTIONS = { never: "Jamais contactés", "30": "Pas contactés depuis 30 jours", "90": "Pas contactés depuis 90 jours" } as const;
// Clés : les valeurs enregistrées de l'offre (`PLAN_SITE`, `PLAN_SCALE`, `PLAN_COMPLETE` de @theralys/db)
export const PLAN_OPTIONS = { starter: "Formule Site envisagée", boost: "Formule Scale envisagée", scale: "Les deux formules envisagées", none: "Formule non renseignée" } as const;
export const DNC_OPTIONS = { hide: "Masquer « ne pas contacter »", only: "Seulement « ne pas contacter »" } as const;
export const SORT_OPTIONS = { recent: "Ajout récent", updated: "Dernière modification", name: "Nom", action: "Prochaine tâche", stage: "Étape" } as const;

export type CrmView = "liste" | "pipeline";

/** Filtre « Commercial » (admin) : valeur des prospects que personne ne suit. */
export const UNASSIGNED = "none";

export type CrmFilters = {
  view: CrmView;
  q: string;
  stages: CrmStage[];
  source: string;
  profession: string;
  city: string;
  department: string;
  tag: string;
  importId: string;
  /** Commercial propriétaire : son identifiant, `UNASSIGNED`, ou rien. Réservé à l'admin (un commercial ne voit que ses fiches). */
  owner: string;
  reach: keyof typeof REACH_OPTIONS | "";
  action: keyof typeof ACTION_OPTIONS | "";
  created: keyof typeof CREATED_OPTIONS | "";
  touched: keyof typeof TOUCHED_OPTIONS | "";
  plan: keyof typeof PLAN_OPTIONS | "";
  dnc: keyof typeof DNC_OPTIONS | "";
  sort: keyof typeof SORT_OPTIONS;
  page: number;
};

export const EMPTY_FILTERS: CrmFilters = {
  view: "pipeline",
  q: "",
  stages: [],
  source: "",
  profession: "",
  city: "",
  department: "",
  tag: "",
  importId: "",
  owner: "",
  reach: "",
  action: "",
  created: "",
  touched: "",
  plan: "",
  dnc: "",
  sort: "recent",
  page: 1,
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, key: string): string {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  return cleanText(Array.isArray(value) ? value[0] : value, 200);
}

function oneOf<T extends string>(value: string, options: Record<T, string>): T | "" {
  return Object.prototype.hasOwnProperty.call(options, value) ? (value as T) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Filtres lus dans l'adresse ; toute valeur inconnue est ignorée. */
export function parseFilters(params: Params): CrmFilters {
  const stages = read(params, "etape")
    .split(",")
    .filter(isCrmStage)
    .filter((stage, index, all) => all.indexOf(stage) === index);
  const page = Number.parseInt(read(params, "page"), 10);
  const importId = read(params, "liste");
  const owner = read(params, "commercial");
  return {
    view: read(params, "vue") === "liste" ? "liste" : "pipeline",
    q: read(params, "q").slice(0, 120),
    stages,
    source: read(params, "source").slice(0, 60),
    profession: read(params, "metier").slice(0, 120),
    city: read(params, "ville").slice(0, 120),
    department: /^(\d{2,3}|2[AB])$/i.test(read(params, "dept")) ? read(params, "dept").toUpperCase() : "",
    tag: read(params, "tag").slice(0, 40),
    importId: isUuid(importId) ? importId : "",
    owner: owner === UNASSIGNED || isUuid(owner) ? owner : "",
    reach: oneOf(read(params, "joindre"), REACH_OPTIONS),
    action: oneOf(read(params, "action"), ACTION_OPTIONS),
    created: oneOf(read(params, "cree"), CREATED_OPTIONS),
    touched: oneOf(read(params, "relance"), TOUCHED_OPTIONS),
    plan: oneOf(read(params, "formule"), PLAN_OPTIONS),
    dnc: oneOf(read(params, "opposition"), DNC_OPTIONS),
    sort: oneOf(read(params, "tri"), SORT_OPTIONS) || "recent",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Paramètres d'adresse d'un jeu de filtres ; les valeurs par défaut ne sont pas écrites. */
export function filtersToParams(filters: CrmFilters): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value) params.set(key, value);
  };
  if (filters.view === "liste") params.set("vue", "liste");
  set("q", filters.q);
  set("etape", filters.stages.join(","));
  set("source", filters.source);
  set("metier", filters.profession);
  set("ville", filters.city);
  set("dept", filters.department);
  set("tag", filters.tag);
  set("liste", filters.importId);
  set("commercial", filters.owner);
  set("joindre", filters.reach);
  set("action", filters.action);
  set("cree", filters.created);
  set("relance", filters.touched);
  set("formule", filters.plan);
  set("opposition", filters.dnc);
  if (filters.sort !== "recent") params.set("tri", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function filtersHref(filters: CrmFilters, base = "/crm"): string {
  const query = filtersToParams(filters).toString();
  return query ? `${base}?${query}` : base;
}

/** Critères qui restreignent la liste (la vue, le tri et la page n'en sont pas). */
const CRITERIA = ["q", "stages", "source", "profession", "city", "department", "tag", "importId", "owner", "reach", "action", "created", "touched", "plan", "dnc"] as const;
export type Criterion = (typeof CRITERIA)[number];

export function activeCriteria(filters: CrmFilters): Criterion[] {
  return CRITERIA.filter((key) => (key === "stages" ? filters.stages.length > 0 : filters[key] !== ""));
}

/** Les mêmes filtres sans un critère (pour le retirer d'un clic), page remise à 1. */
export function withoutCriterion(filters: CrmFilters, criterion: Criterion): CrmFilters {
  return { ...filters, [criterion]: criterion === "stages" ? [] : "", page: 1 };
}

/** Libellé d'un critère actif, tel qu'il s'affiche sur sa pastille. */
export function criterionLabel(filters: CrmFilters, criterion: Criterion, lists: Record<string, string> = {}, reps: Record<string, string> = {}): string {
  switch (criterion) {
    case "q":
      return `Recherche : « ${filters.q} »`;
    case "stages":
      return `Étape : ${filters.stages.map((stage) => STAGE_META[stage].label).join(", ")}`;
    case "source":
      return `Provenance : ${sourceLabel(filters.source)}`;
    case "profession":
      return `Métier : ${filters.profession}`;
    case "city":
      return `Ville : ${filters.city}`;
    case "department":
      return `Département : ${filters.department}`;
    case "tag":
      return `Étiquette : ${filters.tag}`;
    case "importId":
      return `Liste : ${lists[filters.importId] ?? "liste importée"}`;
    case "owner":
      return filters.owner === UNASSIGNED ? "Non attribué" : `Commercial : ${reps[filters.owner] ?? "compte supprimé"}`;
    case "reach":
      return filters.reach ? REACH_OPTIONS[filters.reach] : "";
    case "action":
      return filters.action ? ACTION_OPTIONS[filters.action] : "";
    case "created":
      return filters.created ? CREATED_OPTIONS[filters.created] : "";
    case "touched":
      return filters.touched ? TOUCHED_OPTIONS[filters.touched] : "";
    case "plan":
      return filters.plan ? PLAN_OPTIONS[filters.plan] : "";
    case "dnc":
      return filters.dnc ? DNC_OPTIONS[filters.dnc] : "";
  }
}

/** Ordre des étapes, pour trier par avancement dans le cycle de vente. */
export const STAGE_ORDER: Record<CrmStage, number> = Object.fromEntries(CRM_STAGES.map((stage, index) => [stage, index])) as Record<CrmStage, number>;

/**
 * Bornes d'une journée à Paris, en temps universel : « aujourd'hui » et « en
 * retard » se comptent sur le fuseau du cabinet, pas sur celui du serveur.
 */
export function parisDayBounds(now: Date): { start: Date; end: Date } {
  const start = parisMidnightBefore(now);
  // 26 heures plus loin, on est le lendemain à Paris quel que soit le changement d'heure
  return { start, end: parisMidnightBefore(new Date(start.getTime() + 26 * 3_600_000)) };
}

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", day: "2-digit" });

/** Le premier du mois à minuit, heure de Paris : « ce mois-ci » se compte sur le fuseau du cabinet. */
export function parisMonthStart(now: Date): Date {
  const { start } = parisDayBounds(now);
  // Midi du premier jour, à une heure près selon le changement d'heure : on retombe sur son minuit exact
  return parisMidnightBefore(new Date(start.getTime() - (Number(PARIS_DAY.format(now)) - 1) * 86_400_000 + 12 * 3_600_000));
}

const PARIS_CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Millisecondes affichées à l'horloge de Paris depuis minuit, pour un instant donné. */
function parisClockMs(date: Date): number {
  const parts = PARIS_CLOCK.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000 + date.getMilliseconds();
}

/** Le minuit de Paris qui précède un instant (ou cet instant, s'il est minuit). */
function parisMidnightBefore(date: Date): Date {
  let candidate = new Date(date.getTime() - parisClockMs(date));
  // Un jour de changement d'heure, l'horloge a avancé ou reculé d'une heure depuis minuit : on recale
  const drift = parisClockMs(candidate);
  if (drift !== 0) candidate = new Date(candidate.getTime() + (drift > 12 * 3_600_000 ? 24 * 3_600_000 - drift : -drift));
  return candidate;
}
