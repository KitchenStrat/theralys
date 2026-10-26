/**
 * Fiche Google (studio Harmony) : constantes, types JSON stockés
 * (`google_profile_audits`, `google_rank_scans`, `google_reviews.analysis`,
 * `google_posts`) et logique pure (grille de points, audit déterministe,
 * agrégation des concurrents, budget). Aucune dépendance base ou IA.
 *
 * Sans l'API Business Profile de Google (jamais validée), tout est en lecture
 * seule : les données viennent de Places API (fiche reliée) et du fournisseur
 * DataForSEO (`@theralys/providers/dataforseo`) ; le praticien publie lui-même
 * posts et réponses (copier / lien direct).
 */

import type { SocialAccentRole, SocialPillar, SocialSlide, SocialSourceRef, SocialTemplate, SocialVoice } from "./social";

// ─── Budget et quotas (≤ 5 $/mois/site, soit ≈ 4,6 €) ───────────────────────

/** Plafond dur des dépenses fournisseur par site et par mois (USD). */
export const GOOGLE_MONTHLY_BUDGET_USD = 5;
/** Mots-clés suivis simultanément (grille de visibilité). */
export const GOOGLE_KEYWORDS_MAX = 3;
/** Relevés de visibilité lancés à la demande par mois (hors relevés planifiés). */
export const GOOGLE_MANUAL_SCANS_PER_MONTH = 10;
/** Intervalle entre deux relevés planifiés d'un même mot-clé (jours). */
export const GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS = 14;
/** Posts Google « sur mesure » par mois. */
export const GOOGLE_POST_REQUESTS_PER_MONTH = 10;
/** Avis récupérés par synchronisation (multiples de 10 : facturés par tranche de 10). */
export const GOOGLE_REVIEWS_SYNC_DEPTH = 50;
/** Intervalle entre deux synchronisations complètes de la fiche (jours). */
export const GOOGLE_PROFILE_SYNC_INTERVAL_DAYS = 30;
/**
 * Points de grille en échec tolérés par relevé : au-delà, le fournisseur
 * annule les requêtes en vol et le relevé passe en erreur (le coût des points
 * aboutis reste inscrit).
 */
export const GOOGLE_SCAN_MAX_MISSING_POINTS = 10;

/** Coûts unitaires DataForSEO (USD) pour estimer avant d'appeler ; le coût réel vient de la réponse. */
export const DATAFORSEO_UNIT_COSTS = {
  /** Google Maps SERP, mode immédiat, par point de grille */
  mapsLive: 0.002,
  /** Fiche d'établissement (Business Data), mode immédiat */
  businessInfoLive: 0.0054,
  /** Avis Google, par tranche de 10 avis (file standard) */
  reviewsPer10: 0.00075,
} as const;

/** "YYYY-MM" (UTC) d'une date : clé du registre de dépenses. */
export function usageMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Reste du budget mensuel après les dépenses enregistrées (jamais négatif). */
export function budgetRemainingUsd(spentUsd: number, budgetUsd: number = GOOGLE_MONTHLY_BUDGET_USD): number {
  return Math.max(0, Math.round((budgetUsd - spentUsd) * 10000) / 10000);
}

// ─── Grille de visibilité ────────────────────────────────────────────────────

export const GOOGLE_GRID = { rows: 7, cols: 7, zoom: 14 } as const;

export const GOOGLE_GRID_RADII = [
  { id: "quartier", label: "Quartier", km: 2 },
  { id: "ville", label: "Ville", km: 5 },
  { id: "agglomeration", label: "Agglomération", km: 12 },
] as const;
export type GoogleGridRadius = (typeof GOOGLE_GRID_RADII)[number]["id"];

export function gridRadiusKm(id: GoogleGridRadius): number {
  return GOOGLE_GRID_RADII.find((r) => r.id === id)?.km ?? 5;
}

export type GeoPoint = { lat: number; lng: number };

export type GoogleScanGrid = {
  center: GeoPoint;
  rows: number;
  cols: number;
  radius: GoogleGridRadius;
  radiusKm: number;
  zoom: number;
};

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Points d'une grille rows × cols centrée sur `center`, couvrant un carré de
 * ±radiusKm (ordre : ligne par ligne, du nord-ouest au sud-est). Le point
 * central est le cabinet lui-même.
 */
export function gridPoints(center: GeoPoint, radiusKm: number, rows = GOOGLE_GRID.rows, cols = GOOGLE_GRID.cols): GeoPoint[] {
  const points: GeoPoint[] = [];
  const stepLatKm = rows > 1 ? (2 * radiusKm) / (rows - 1) : 0;
  const stepLngKm = cols > 1 ? (2 * radiusKm) / (cols - 1) : 0;
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180);
  for (let r = 0; r < rows; r++) {
    const offsetKmLat = radiusKm - r * stepLatKm;
    for (let c = 0; c < cols; c++) {
      const offsetKmLng = -radiusKm + c * stepLngKm;
      points.push({
        lat: round7(center.lat + offsetKmLat / KM_PER_DEGREE_LAT),
        lng: round7(center.lng + offsetKmLng / Math.max(kmPerDegreeLng, 1e-6)),
      });
    }
  }
  return points;
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

/** Distance à vol d'oiseau (km), formule de haversine. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Coût estimé d'un relevé (USD) avant appel : un point = une requête Maps. */
export function estimateScanCostUsd(rows = GOOGLE_GRID.rows, cols = GOOGLE_GRID.cols): number {
  return Math.round(rows * cols * DATAFORSEO_UNIT_COSTS.mapsLive * 10000) / 10000;
}

/**
 * Résultat d'un point de la grille : rang du cabinet (null = absent des 20
 * premiers) et podium local. `missing: true` = requête en échec pour ce point
 * (rang inconnu, podium vide) : hors du résumé.
 */
export type GoogleGridPoint = GeoPoint & {
  rank: number | null;
  top: { title: string; cid: string | null; rating: number | null; votes: number | null }[];
  missing?: boolean;
};

export type GoogleScanSummary = {
  /** Points où le cabinet apparaît */
  found: number;
  /** Points connus (hors points en échec) */
  total: number;
  /** Rang moyen sur les points où il apparaît */
  avgRank: number | null;
  /** Points où le cabinet est dans les 3 premiers (le « pack local ») */
  top3: number;
  top10: number;
  /** Part de visibilité 0..100 : moyenne de max(0, 21 − rang) / 20 sur les points connus */
  visibility: number;
  /** Points de grille en échec (requête fournisseur sans réponse), absent si aucun */
  missing?: number;
};

/** Résumé d'un relevé sur les points connus ; les points `missing` sont comptés à part. */
export function summarizeScan(points: GoogleGridPoint[]): GoogleScanSummary {
  const known = points.filter((p) => !p.missing);
  const missing = points.length - known.length;
  const ranks = known.map((p) => p.rank).filter((r): r is number => r !== null);
  const visibility =
    known.length === 0
      ? 0
      : Math.round(
          (known.reduce((sum, p) => sum + (p.rank === null ? 0 : Math.max(0, 21 - p.rank) / 20), 0) /
            known.length) *
            100,
        );
  return {
    found: ranks.length,
    total: known.length,
    avgRank: ranks.length > 0 ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
    top3: ranks.filter((r) => r <= 3).length,
    top10: ranks.filter((r) => r <= 10).length,
    visibility,
    ...(missing > 0 ? { missing } : {}),
  };
}

/** Couleur d'une pastille de la carte selon le rang. */
export function rankTone(rank: number | null): "top" | "good" | "weak" | "none" {
  if (rank === null) return "none";
  if (rank <= 3) return "top";
  if (rank <= 10) return "good";
  return "weak";
}

// ─── Concurrents ─────────────────────────────────────────────────────────────

export type GoogleCompetitor = {
  cid: string | null;
  placeId: string | null;
  title: string;
  rating: number | null;
  votes: number | null;
  category: string | null;
  totalPhotos: number | null;
  isClaimed: boolean | null;
  /** Nombre de points de grille où il figure dans le podium (top 3) */
  appearances: number;
  /** Rang moyen sur ces apparitions */
  avgRank: number | null;
};

export type GoogleBenchmark = {
  competitors: GoogleCompetitor[];
  medianVotes: number | null;
  medianRating: number | null;
  medianPhotos: number | null;
};

/** Résultat brut d'un point (fournisseur) : liste ordonnée des établissements. */
export type GoogleMapsListing = {
  rank: number;
  title: string;
  placeId: string | null;
  cid: string | null;
  rating: number | null;
  votes: number | null;
  category: string | null;
  totalPhotos: number | null;
  isClaimed: boolean | null;
};

/**
 * Le cabinet lui-même dans une liste : par place_id, par cid, sinon par titre
 * normalisé — égalité stricte, ou inclusion seulement quand le titre propre
 * compte au moins deux mots significatifs (≥ 3 lettres) : « Claire Dupont »
 * reconnaît « Claire Dupont — Sophrologue », mais « Zen » ne s'attribue pas
 * « Pause Zen Thérapies ».
 */
export function findOwnListing(
  listings: GoogleMapsListing[],
  own: { placeId?: string | null; cid?: string | null; title?: string | null },
): GoogleMapsListing | null {
  const byId = listings.find(
    (l) => (own.placeId && l.placeId === own.placeId) || (own.cid && l.cid === own.cid),
  );
  if (byId) return byId;
  const title = fold(own.title ?? "");
  if (title === "") return null;
  const exact = listings.find((l) => fold(l.title) === title);
  if (exact) return exact;
  if (!isDistinctiveTitle(title)) return null;
  return listings.find((l) => fold(l.title).includes(title)) ?? null;
}

/** Au moins deux mots de 3 lettres ou plus (titre normalisé par `fold`). */
export function isDistinctiveTitle(folded: string): boolean {
  return folded.split(" ").filter((word) => word.length >= 3).length >= 2;
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Concurrents agrégés sur tous les points d'un relevé (établissements du
 * podium, hors le cabinet), triés par apparitions puis rang moyen ; au plus 8.
 * Un point `null` (requête en échec chez le fournisseur) est ignoré.
 */
export function aggregateCompetitors(
  pointsListings: (GoogleMapsListing[] | null)[],
  own: { placeId?: string | null; cid?: string | null; title?: string | null },
  limit = 8,
): GoogleCompetitor[] {
  const map = new Map<string, GoogleCompetitor & { rankSum: number }>();
  for (const listings of pointsListings) {
    if (listings === null) continue;
    const self = findOwnListing(listings, own);
    for (const l of listings.slice(0, 3)) {
      if (self && l === self) continue;
      const key = l.cid ?? l.placeId ?? fold(l.title);
      const entry = map.get(key) ?? {
        cid: l.cid,
        placeId: l.placeId,
        title: l.title,
        rating: l.rating,
        votes: l.votes,
        category: l.category,
        totalPhotos: l.totalPhotos,
        isClaimed: l.isClaimed,
        appearances: 0,
        avgRank: null,
        rankSum: 0,
      };
      entry.appearances += 1;
      entry.rankSum += l.rank;
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .map(({ rankSum, ...c }) => ({ ...c, avgRank: Math.round((rankSum / c.appearances) * 10) / 10 }))
    .sort((a, b) => b.appearances - a.appearances || (a.avgRank ?? 99) - (b.avgRank ?? 99))
    .slice(0, limit);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function benchmarkFrom(competitors: GoogleCompetitor[]): GoogleBenchmark {
  return {
    competitors,
    medianVotes: median(competitors.map((c) => c.votes).filter((v): v is number => v !== null)),
    medianRating: median(competitors.map((c) => c.rating).filter((v): v is number => v !== null)),
    medianPhotos: median(competitors.map((c) => c.totalPhotos).filter((v): v is number => v !== null)),
  };
}

/**
 * Identifiant de fiche factice (`MockGooglePlacesProvider`, démos créées sans
 * clé Places) : jamais envoyé à un fournisseur réel ; la section propose alors
 * de relier la vraie fiche.
 */
export function isMockPlaceId(placeId: string | null | undefined): boolean {
  return typeof placeId === "string" && placeId.startsWith("mock-");
}

// ─── Instantané de la fiche ──────────────────────────────────────────────────

export type GoogleProfileSnapshot = {
  source: "dataforseo" | "places" | "mock";
  /** ISO 8601 */
  fetchedAt: string;
  placeId: string | null;
  cid: string | null;
  title: string;
  /** Description rédigée par le praticien (DataForSEO seulement ; null = inconnue) */
  description: string | null;
  category: string | null;
  additionalCategories: string[];
  address: string | null;
  phone: string | null;
  website: string | null;
  isClaimed: boolean | null;
  rating: number | null;
  votes: number | null;
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number> | null;
  /** null = inconnu (Places ne renvoie que 10 photos au plus) */
  totalPhotos: number | null;
  /** Horaires renseignés (null = inconnu) */
  hasHours: boolean | null;
  /** Jour → plages « 09:00–12:00 » (facultatif, affichage) */
  hours: Record<string, string[]> | null;
  attributes: string[];
  bookOnlineUrl: string | null;
  mainImage: string | null;
  location: GeoPoint | null;
};

// ─── Audit déterministe ──────────────────────────────────────────────────────

export type GoogleCheckStatus = "ok" | "warn" | "missing" | "unknown";

export type GoogleAuditCheck = {
  id: string;
  label: string;
  status: GoogleCheckStatus;
  points: number;
  maxPoints: number;
  detail: string;
};

export type GoogleActionItem = {
  id: string;
  title: string;
  why: string;
  how: string;
  impact: "fort" | "moyen" | "faible";
  effort: "5 min" | "30 min" | "continu";
};

export type GoogleAudit = {
  /** 0..100, calculé sur les contrôles connus */
  score: number;
  grade: "A" | "B" | "C" | "D";
  checks: GoogleAuditCheck[];
  actions: GoogleActionItem[];
  benchmark: GoogleBenchmark | null;
  /** ISO 8601 */
  computedAt: string;
};

export type GoogleAuditInput = {
  snapshot: GoogleProfileSnapshot;
  benchmark: GoogleBenchmark | null;
  /** Avis connus (synchronisés) : récence et taux de réponse */
  reviews: { rating: number; reviewedAt: Date | string | null; ownerReply: string | null }[];
  /** Les avis portent-ils l'information « réponse du propriétaire » ? (false : Places seul) */
  reviewsHaveOwnerReplies: boolean;
  site: { url: string; hasBookingUrl: boolean };
  now: Date;
};

export function auditGrade(score: number): GoogleAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Audit de la fiche : contrôles notés (points / maximum), statut `unknown`
 * quand la donnée n'est pas disponible (hors du calcul), score ramené sur 100
 * et plan d'action trié par impact. Pur et testé ; aucun appel IA.
 */
export function auditGoogleProfile(input: GoogleAuditInput): GoogleAudit {
  const { snapshot: s, benchmark, reviews, site } = input;
  const checks: GoogleAuditCheck[] = [];
  const actions: GoogleActionItem[] = [];
  const push = (check: GoogleAuditCheck, action?: GoogleActionItem) => {
    checks.push(check);
    if (action && check.status !== "ok" && check.status !== "unknown") actions.push(action);
  };

  // 1. Fiche revendiquée
  push(
    s.isClaimed === null
      ? { id: "claimed", label: "Fiche revendiquée", status: "unknown", points: 0, maxPoints: 10, detail: "Information non disponible." }
      : s.isClaimed
        ? { id: "claimed", label: "Fiche revendiquée", status: "ok", points: 10, maxPoints: 10, detail: "Vous êtes propriétaire de la fiche." }
        : { id: "claimed", label: "Fiche revendiquée", status: "missing", points: 0, maxPoints: 10, detail: "La fiche n'est pas revendiquée : personne ne peut la gérer." },
    {
      id: "claim",
      title: "Revendiquez votre fiche Google",
      why: "Sans revendication, vous ne pouvez ni répondre aux avis, ni corriger vos informations, ni publier.",
      how: "Sur Google Maps, ouvrez votre fiche puis « Vous êtes le propriétaire de cet établissement ? » et suivez la vérification.",
      impact: "fort",
      effort: "30 min",
    },
  );

  // 2. Catégories
  push(
    s.category
      ? { id: "category", label: "Catégorie principale", status: "ok", points: 8, maxPoints: 8, detail: `Catégorie : ${s.category}.` }
      : { id: "category", label: "Catégorie principale", status: "missing", points: 0, maxPoints: 8, detail: "Aucune catégorie principale." },
    {
      id: "set-category",
      title: "Choisissez une catégorie principale précise",
      why: "La catégorie est le premier critère de classement sur Google Maps.",
      how: "Dans votre fiche → Modifier le profil → Catégorie : choisissez votre métier exact (ex. « Sophrologue »), pas une catégorie générique.",
      impact: "fort",
      effort: "5 min",
    },
  );
  push(
    s.additionalCategories.length > 0
      ? { id: "categories", label: "Catégories supplémentaires", status: "ok", points: 4, maxPoints: 4, detail: s.additionalCategories.join(", ") }
      : { id: "categories", label: "Catégories supplémentaires", status: "warn", points: 0, maxPoints: 4, detail: "Aucune catégorie secondaire." },
    {
      id: "add-categories",
      title: "Ajoutez une ou deux catégories secondaires",
      why: "Elles élargissent les recherches sur lesquelles vous apparaissez (ex. « Praticien bien-être », « Centre de relaxation »).",
      how: "Fiche → Modifier le profil → Catégories → Ajouter une catégorie.",
      impact: "moyen",
      effort: "5 min",
    },
  );

  // 3. Coordonnées : téléphone, site
  push(
    s.phone
      ? { id: "phone", label: "Téléphone", status: "ok", points: 6, maxPoints: 6, detail: s.phone }
      : { id: "phone", label: "Téléphone", status: "missing", points: 0, maxPoints: 6, detail: "Aucun numéro affiché." },
    {
      id: "add-phone",
      title: "Renseignez votre numéro de téléphone",
      why: "Le bouton « Appeler » est le premier contact depuis mobile.",
      how: "Fiche → Modifier le profil → Coordonnées → Téléphone.",
      impact: "fort",
      effort: "5 min",
    },
  );
  const siteHost = hostOf(site.url);
  const websiteHost = hostOf(s.website);
  push(
    s.website
      ? websiteHost && siteHost && websiteHost === siteHost
        ? { id: "website", label: "Site web", status: "ok", points: 8, maxPoints: 8, detail: `Lien vers votre site Harmony (${websiteHost}).` }
        : { id: "website", label: "Site web", status: "warn", points: 5, maxPoints: 8, detail: `Lien vers ${websiteHost ?? s.website}, pas vers votre site Harmony.` }
      : { id: "website", label: "Site web", status: "missing", points: 0, maxPoints: 8, detail: "Aucun site web sur la fiche." },
    {
      id: "link-website",
      title: "Reliez la fiche à votre site Harmony",
      why: "Le lien envoie les visiteurs Google vers vos pages de spécialité et votre prise de rendez-vous.",
      how: `Fiche → Modifier le profil → Site web : ${site.url}`,
      impact: "fort",
      effort: "5 min",
    },
  );

  // 4. Horaires
  push(
    s.hasHours === null
      ? { id: "hours", label: "Horaires", status: "unknown", points: 0, maxPoints: 8, detail: "Information non disponible." }
      : s.hasHours
        ? { id: "hours", label: "Horaires", status: "ok", points: 8, maxPoints: 8, detail: "Horaires renseignés." }
        : { id: "hours", label: "Horaires", status: "missing", points: 0, maxPoints: 8, detail: "Aucun horaire : Google affiche « Horaires inconnus »." },
    {
      id: "add-hours",
      title: "Renseignez vos horaires",
      why: "Une fiche sans horaires est moins affichée et inquiète les patients.",
      how: "Fiche → Modifier le profil → Horaires (indiquez aussi les jours fermés).",
      impact: "fort",
      effort: "5 min",
    },
  );

  // 5. Description
  push(
    s.description === null
      ? { id: "description", label: "Description", status: "unknown", points: 0, maxPoints: 8, detail: "Information non disponible." }
      : s.description.trim().length >= 250
        ? { id: "description", label: "Description", status: "ok", points: 8, maxPoints: 8, detail: `${s.description.trim().length} caractères.` }
        : s.description.trim().length > 0
          ? { id: "description", label: "Description", status: "warn", points: 4, maxPoints: 8, detail: `${s.description.trim().length} caractères : développez (250 à 750 conseillés).` }
          : { id: "description", label: "Description", status: "missing", points: 0, maxPoints: 8, detail: "Aucune description." },
    {
      id: "write-description",
      title: "Rédigez une description de 250 à 750 caractères",
      why: "Elle présente votre approche et vos spécialités avec vos mots-clés, sans promesse de résultat.",
      how: "Fiche → Modifier le profil → Description. Reprenez l'accroche de votre site : qui vous êtes, pour qui, où.",
      impact: "moyen",
      effort: "30 min",
    },
  );

  // 6. Photos
  const photos = s.totalPhotos;
  const photoTarget = benchmark?.medianPhotos ?? 10;
  push(
    photos === null
      ? { id: "photos", label: "Photos", status: "unknown", points: 0, maxPoints: 10, detail: "Information non disponible." }
      : photos >= Math.max(10, photoTarget)
        ? { id: "photos", label: "Photos", status: "ok", points: 10, maxPoints: 10, detail: `${photos} photos.` }
        : photos >= 5
          ? { id: "photos", label: "Photos", status: "warn", points: 6, maxPoints: 10, detail: `${photos} photos : visez ${Math.max(10, Math.round(photoTarget))}.` }
          : photos >= 1
            ? { id: "photos", label: "Photos", status: "warn", points: 3, maxPoints: 10, detail: `${photos} photo${photos > 1 ? "s" : ""} seulement.` }
            : { id: "photos", label: "Photos", status: "missing", points: 0, maxPoints: 10, detail: "Aucune photo." },
    {
      id: "add-photos",
      title: `Ajoutez des photos (objectif ${Math.max(10, Math.round(photoTarget))})`,
      why: "Les fiches avec photos reçoivent nettement plus de clics et d'appels.",
      how: "Fiche → Photos : façade, salle de pratique, vous en situation, accès. Une nouvelle photo par mois entretient la fiche.",
      impact: "moyen",
      effort: "30 min",
    },
  );

  // 7. Nombre d'avis (vs médiane des concurrents)
  const votes = s.votes ?? 0;
  const medianVotes = benchmark?.medianVotes ?? null;
  const target = medianVotes !== null ? Math.ceil(medianVotes) : 20;
  push(
    votes >= target
      ? { id: "reviews-count", label: "Nombre d'avis", status: "ok", points: 12, maxPoints: 12, detail: `${votes} avis${medianVotes !== null ? ` (médiane des concurrents : ${Math.round(medianVotes)})` : ""}.` }
      : votes >= target / 2
        ? { id: "reviews-count", label: "Nombre d'avis", status: "warn", points: 7, maxPoints: 12, detail: `${votes} avis, objectif ${target}.` }
        : { id: "reviews-count", label: "Nombre d'avis", status: "missing", points: votes > 0 ? 3 : 0, maxPoints: 12, detail: `${votes} avis, objectif ${target}.` },
    {
      id: "get-reviews",
      title: `Obtenez ${Math.max(1, target - votes)} avis de plus`,
      why: medianVotes !== null
        ? `Les cabinets du podium local ont ${Math.round(medianVotes)} avis en médiane : c'est le seuil pour rivaliser.`
        : "Le volume d'avis est un critère majeur de classement et de confiance.",
      how: "Demandez un avis en fin de séance aux patients satisfaits, avec le lien court de votre fiche (bouton « Demander des avis » dans Google).",
      impact: "fort",
      effort: "continu",
    },
  );

  // 8. Note moyenne
  const rating = s.rating;
  push(
    rating === null
      ? { id: "rating", label: "Note moyenne", status: "unknown", points: 0, maxPoints: 8, detail: "Pas encore de note." }
      : rating >= 4.7
        ? { id: "rating", label: "Note moyenne", status: "ok", points: 8, maxPoints: 8, detail: `${rating}/5.` }
        : rating >= 4.3
          ? { id: "rating", label: "Note moyenne", status: "warn", points: 5, maxPoints: 8, detail: `${rating}/5.` }
          : { id: "rating", label: "Note moyenne", status: "warn", points: rating >= 4 ? 3 : 0, maxPoints: 8, detail: `${rating}/5 : en dessous des attentes du secteur (4,7).` },
    {
      id: "raise-rating",
      title: "Remontez votre note moyenne",
      why: "En dessous de 4,5, une fiche perd des clics face à ses voisines.",
      how: "Répondez aux avis négatifs avec calme (proposez un échange direct) et sollicitez les patients satisfaits.",
      impact: "moyen",
      effort: "continu",
    },
  );

  // 9. Récence du dernier avis
  const dates = reviews
    .map((r) => (r.reviewedAt ? new Date(r.reviewedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const last = dates.length > 0 ? Math.max(...dates) : null;
  const daysSince = last === null ? null : Math.floor((input.now.getTime() - last) / 86_400_000);
  push(
    daysSince === null
      ? { id: "recency", label: "Avis récents", status: reviews.length === 0 && votes === 0 ? "missing" : "unknown", points: 0, maxPoints: 6, detail: reviews.length === 0 ? "Aucun avis synchronisé." : "Dates inconnues." }
      : daysSince <= 60
        ? { id: "recency", label: "Avis récents", status: "ok", points: 6, maxPoints: 6, detail: `Dernier avis il y a ${daysSince} jour${daysSince > 1 ? "s" : ""}.` }
        : daysSince <= 180
          ? { id: "recency", label: "Avis récents", status: "warn", points: 3, maxPoints: 6, detail: `Dernier avis il y a ${daysSince} jours.` }
          : { id: "recency", label: "Avis récents", status: "missing", points: 0, maxPoints: 6, detail: `Dernier avis il y a ${daysSince} jours.` },
    {
      id: "fresh-reviews",
      title: "Relancez la collecte d'avis",
      why: "Google valorise les avis récents : un avis par mois suffit à garder une fiche vivante.",
      how: "Mettez le lien d'avis dans votre e-mail de confirmation ou un QR code au cabinet.",
      impact: "moyen",
      effort: "continu",
    },
  );

  // 10. Taux de réponse aux avis
  if (input.reviewsHaveOwnerReplies && reviews.length > 0) {
    const answered = reviews.filter((r) => (r.ownerReply ?? "").trim() !== "").length;
    const rate = Math.round((answered / reviews.length) * 100);
    push(
      rate >= 80
        ? { id: "replies", label: "Réponses aux avis", status: "ok", points: 8, maxPoints: 8, detail: `${rate} % des avis ont une réponse.` }
        : rate >= 50
          ? { id: "replies", label: "Réponses aux avis", status: "warn", points: 5, maxPoints: 8, detail: `${rate} % des avis ont une réponse.` }
          : { id: "replies", label: "Réponses aux avis", status: rate > 0 ? "warn" : "missing", points: rate >= 20 ? 2 : 0, maxPoints: 8, detail: `${rate} % des avis ont une réponse.` },
      {
        id: "reply-reviews",
        title: "Répondez à chaque avis",
        why: "Une réponse montre que vous êtes à l'écoute et compte dans le classement.",
        how: "Onglet Avis de cette section : copiez la réponse proposée, puis collez-la dans votre fiche Google.",
        impact: "moyen",
        effort: "continu",
      },
    );
  } else {
    push({ id: "replies", label: "Réponses aux avis", status: "unknown", points: 0, maxPoints: 8, detail: "Disponible après la première synchronisation complète des avis." });
  }

  // 11. Réservation
  push(
    s.bookOnlineUrl || site.hasBookingUrl
      ? { id: "booking", label: "Lien de réservation", status: s.bookOnlineUrl ? "ok" : "warn", points: s.bookOnlineUrl ? 4 : 2, maxPoints: 4, detail: s.bookOnlineUrl ? "Bouton « Réserver » présent." : "Votre site propose la prise de rendez-vous, mais la fiche n'affiche pas de bouton « Réserver »." }
      : { id: "booking", label: "Lien de réservation", status: "missing", points: 0, maxPoints: 4, detail: "Aucun lien de réservation." },
    {
      id: "add-booking",
      title: "Ajoutez votre lien de prise de rendez-vous",
      why: "Le bouton « Réserver » transforme une recherche en rendez-vous sans passer par le téléphone.",
      how: "Fiche → Modifier le profil → Réservation : collez l'adresse de votre agenda en ligne.",
      impact: "moyen",
      effort: "5 min",
    },
  );

  // 12. Attributs
  push(
    s.source === "places"
      ? { id: "attributes", label: "Attributs", status: "unknown", points: 0, maxPoints: 4, detail: "Information non disponible." }
      : s.attributes.length >= 3
        ? { id: "attributes", label: "Attributs", status: "ok", points: 4, maxPoints: 4, detail: s.attributes.slice(0, 4).join(", ") }
        : { id: "attributes", label: "Attributs", status: "warn", points: s.attributes.length > 0 ? 2 : 0, maxPoints: 4, detail: s.attributes.length > 0 ? s.attributes.join(", ") : "Aucun attribut (accès PMR, sur rendez-vous, paiement…)." },
    {
      id: "add-attributes",
      title: "Renseignez les attributs de votre cabinet",
      why: "Accessibilité, sur rendez-vous, moyens de paiement : des filtres de recherche et des gages de sérieux.",
      how: "Fiche → Modifier le profil → Plus (attributs).",
      impact: "faible",
      effort: "5 min",
    },
  );

  // 13. Nom de la fiche sobre (pas de bourrage de mots-clés)
  const title = s.title.trim();
  const stuffed = title.length > 60 || (title.match(/[-|•·,]/g) ?? []).length >= 3;
  push(
    stuffed
      ? { id: "title", label: "Nom de la fiche", status: "warn", points: 0, maxPoints: 4, detail: "Le nom semble contenir des mots-clés ajoutés : Google peut suspendre la fiche." }
      : { id: "title", label: "Nom de la fiche", status: "ok", points: 4, maxPoints: 4, detail: title },
    {
      id: "clean-title",
      title: "Gardez le nom réel de votre cabinet",
      why: "Google interdit l'ajout de mots-clés ou de villes dans le nom et peut suspendre la fiche.",
      how: "Fiche → Modifier le profil → Nom : votre nom ou celui du cabinet, sans mention de métier ou de ville supplémentaire.",
      impact: "faible",
      effort: "5 min",
    },
  );

  const known = checks.filter((c) => c.status !== "unknown");
  const max = known.reduce((sum, c) => sum + c.maxPoints, 0);
  const points = known.reduce((sum, c) => sum + c.points, 0);
  const score = max > 0 ? Math.round((points / max) * 100) : 0;
  const impactOrder = { fort: 0, moyen: 1, faible: 2 } as const;
  actions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  return { score, grade: auditGrade(score), checks, actions, benchmark, computedAt: input.now.toISOString() };
}

// ─── Avis : analyse et réponses proposées ────────────────────────────────────

export type GoogleReviewSentiment = "positif" | "mitige" | "negatif";

export const GOOGLE_REVIEW_TOPICS = [
  { id: "accueil", label: "Accueil" },
  { id: "ecoute", label: "Écoute" },
  { id: "efficacite", label: "Efficacité" },
  { id: "douceur", label: "Douceur" },
  { id: "explications", label: "Explications" },
  { id: "locaux", label: "Locaux" },
  { id: "tarifs", label: "Tarifs" },
  { id: "ponctualite", label: "Ponctualité" },
  { id: "disponibilite", label: "Disponibilité" },
  { id: "suivi", label: "Suivi" },
] as const;
export type GoogleReviewTopic = (typeof GOOGLE_REVIEW_TOPICS)[number]["id"];

/** Longueur maximale d'une réponse proposée (Google accepte 4 096, 600 reste lisible). */
export const GOOGLE_REPLY_MAX = 600;

export type GoogleReviewAnalysis = {
  sentiment: GoogleReviewSentiment;
  topics: GoogleReviewTopic[];
  /** Réponse proposée, prête à coller (voix du praticien, sans promesse médicale, sans donnée personnelle) */
  suggestedReply: string;
  /** ISO 8601 */
  generatedAt: string;
  generator: "anthropic" | "mock";
  voice: SocialVoice;
};

/** Sentiment par défaut d'après la note (repli, et base du mock). */
export function sentimentFromRating(rating: number): GoogleReviewSentiment {
  if (rating >= 4) return "positif";
  if (rating === 3) return "mitige";
  return "negatif";
}

// ─── Posts Google (calendrier + générateur) ──────────────────────────────────

/** Boutons d'action proposés par Google sur un post. */
export const GOOGLE_POST_CTAS = [
  { id: "BOOK", label: "Réserver" },
  { id: "CALL", label: "Appeler" },
  { id: "LEARN_MORE", label: "En savoir plus" },
  { id: "NONE", label: "Sans bouton" },
] as const;
export type GooglePostCta = (typeof GOOGLE_POST_CTAS)[number]["id"];

/** Texte d'un post Google (Google accepte 1 500 caractères). */
export const GOOGLE_POST_SUMMARY_MAX = 1500;
/** Image recommandée par Google : 1200 × 900 (4:3) — taille `landscape` du moteur de rendu social. */
export const GOOGLE_POST_IMAGE = { w: 1200, h: 900 } as const;
/** Jour de publication hebdomadaire des posts Google (ISO : mardi). */
export const GOOGLE_POST_DAY = 2;

export type GooglePostContent = {
  pillar: SocialPillar;
  accentRole: SocialAccentRole;
  /** Texte du post (≤ GOOGLE_POST_SUMMARY_MAX), sans hashtags ni « lien dans ma bio » */
  summary: string;
  cta: { type: GooglePostCta; url: string | null };
  /** Visuel 4:3 rendu par le moteur social (template statique) */
  slide: SocialSlide;
  altText: string;
  sourceRefs: SocialSourceRef[];
  note?: string;
  voice: SocialVoice;
  generator: "anthropic" | "mock";
  planDays?: number[];
};

/** Templates statiques utilisables pour un visuel de post Google. */
export const GOOGLE_POST_TEMPLATES: readonly SocialTemplate[] = [
  "photo-titre",
  "affirmation",
  "question-reponse",
  "liste-conseils",
  "infos-pratiques",
  "avis",
];

/**
 * Texte d'un post Google à partir d'une légende sociale : hashtags, ligne
 * « lien dans ma bio » et signature retirés, longueur bornée.
 */
export function captionToGoogleSummary(caption: string, bioLine: string): string {
  const paragraphs = caption
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "" && p !== bioLine.trim() && !/^(#\S+\s*)+$/.test(p));
  const text = paragraphs.join("\n\n").replace(/\s*#[\p{L}\p{N}_]+/gu, "").trim();
  return text.length > GOOGLE_POST_SUMMARY_MAX ? `${text.slice(0, GOOGLE_POST_SUMMARY_MAX - 1).trimEnd()}…` : text;
}
