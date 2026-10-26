import { describe, expect, it } from "vitest";
import { GOOGLE_KEYWORDS_MAX, estimateScanCostUsd, type GoogleMapsListing } from "@theralys/shared";
import { DataForSeoError } from "@theralys/providers/dataforseo";
import {
  GOOGLE_REVIEW_TASK_MAX_AGE_DAYS,
  GOOGLE_SCAN_BATCH,
  dateOrNull,
  gridPointFrom,
  isKeywordScanDue,
  isProfileSyncDue,
  isReviewTaskExpired,
  pastDeadline,
  scanCostOnError,
  scanStatusForMissing,
  selectDueKeywords,
  selectDueSites,
  hasRealGoogleProvider,
} from "./google-profile";

const NOW = new Date("2026-10-26T06:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("relevés : issue selon les points manquants et coût à inscrire", () => {
  it("≤ 10 points manquants → done, au-delà → error, aucun point connu → error", () => {
    expect(scanStatusForMissing(0, 49)).toBe("done");
    expect(scanStatusForMissing(10, 49)).toBe("done");
    expect(scanStatusForMissing(11, 49)).toBe("error");
    expect(scanStatusForMissing(49, 49)).toBe("error");
    expect(scanStatusForMissing(0, 0)).toBe("error");
    expect(scanStatusForMissing(3, 3)).toBe("error");
  });

  it("DataForSeoError → coût déjà facturé ; autre erreur → coût estimé par prudence", () => {
    expect(scanCostOnError(new DataForSeoError("tout a échoué", 0.034))).toBe(0.034);
    expect(scanCostOnError(new DataForSeoError("rien facturé", 0))).toBe(0);
    expect(scanCostOnError(new Error("réseau"))).toBeCloseTo(estimateScanCostUsd(), 6);
    expect(scanCostOnError("boom", 0.05)).toBe(0.05);
  });

  it("gridPointFrom : point en échec → missing, rang inconnu, podium vide ; sinon rang et podium", () => {
    const own = { placeId: "own", cid: null, title: null };
    const listing = (rank: number, placeId: string): GoogleMapsListing => ({
      rank, title: `C${rank}`, placeId, cid: null, rating: 4.5, votes: 10, category: null, totalPhotos: null, isClaimed: null,
    });
    expect(gridPointFrom({ lat: 1, lng: 2 }, null, own)).toEqual({ lat: 1, lng: 2, rank: null, top: [], missing: true });
    const point = gridPointFrom({ lat: 1, lng: 2 }, [listing(1, "a"), listing(2, "own"), listing(3, "b"), listing(4, "c")], own);
    expect(point.missing).toBeUndefined();
    expect(point.rank).toBe(2);
    expect(point.top.map((t) => t.title)).toEqual(["C1", "C2", "C3"]);
    expect(gridPointFrom({ lat: 1, lng: 2 }, [listing(1, "a")], own).rank).toBeNull();
  });
});

describe("échéancier des fiches (syncGoogleProfiles)", () => {
  it("due seulement si la dernière tentative ET le dernier audit facturé ont plus de 30 jours (ou n'existent pas)", () => {
    expect(isProfileSyncDue({ attemptAt: null, billedAt: null }, NOW)).toBe(true);
    expect(isProfileSyncDue({ attemptAt: daysAgo(31), billedAt: daysAgo(45) }, NOW)).toBe(true);
    expect(isProfileSyncDue({ attemptAt: daysAgo(30), billedAt: null }, NOW)).toBe(true);
    // Tentative récente en échec (sync_attempt) : pas de relance quotidienne
    expect(isProfileSyncDue({ attemptAt: daysAgo(1), billedAt: null }, NOW)).toBe(false);
    expect(isProfileSyncDue({ attemptAt: daysAgo(29), billedAt: daysAgo(60) }, NOW)).toBe(false);
    // Audit facturé récent sans ligne d'usage (données antérieures) : pas dû non plus
    expect(isProfileSyncDue({ attemptAt: null, billedAt: daysAgo(10) }, NOW)).toBe(false);
  });

  it("selectDueSites : filtre, tri par dernière tentative croissante (jamais tentés d'abord), taille du lot", () => {
    const rows = [
      { id: "recent", attemptAt: daysAgo(2), billedAt: daysAgo(2) },
      { id: "old", attemptAt: daysAgo(40), billedAt: daysAgo(40) },
      { id: "never", attemptAt: null, billedAt: null },
      { id: "older", attemptAt: daysAgo(90), billedAt: null },
      { id: "failing", attemptAt: daysAgo(31), billedAt: null },
    ];
    expect(selectDueSites(rows, NOW).map((r) => r.id)).toEqual(["never", "older", "old", "failing"]);
    expect(selectDueSites(rows, NOW, 2).map((r) => r.id)).toEqual(["never", "older"]);
  });

  it("dateOrNull : Date, chaîne SQL, ISO JSON, valeurs absentes ou invalides", () => {
    expect(dateOrNull(NOW)).toEqual(NOW);
    expect(dateOrNull("2026-10-26 06:00:00+00")).toEqual(NOW);
    expect(dateOrNull("2026-10-26T06:00:00.000Z")).toEqual(NOW);
    expect(dateOrNull(null)).toBeNull();
    expect(dateOrNull(undefined)).toBeNull();
    expect(dateOrNull("hier")).toBeNull();
  });
});

describe("échéancier des relevés planifiés (runScheduledGoogleScans)", () => {
  it("un mot-clé est dû 14 jours après sa dernière tentative, tous statuts (un échec ne relance pas le lendemain)", () => {
    expect(isKeywordScanDue(null, NOW)).toBe(true);
    expect(isKeywordScanDue(daysAgo(14), NOW)).toBe(true);
    expect(isKeywordScanDue(daysAgo(13), NOW)).toBe(false);
    expect(isKeywordScanDue(daysAgo(1), NOW)).toBe(false);
  });

  it("selectDueKeywords : au plus GOOGLE_KEYWORDS_MAX par site (par position), tri par dernière tentative, lot borné", () => {
    const kw = (id: string, siteId: string, position: number, attemptAt: Date | null) => ({ id, siteId, position, attemptAt });
    const rows = [
      kw("s1-k3", "s1", 3, null),
      kw("s1-k0", "s1", 0, daysAgo(20)),
      kw("s1-k1", "s1", 1, daysAgo(3)),
      kw("s1-k2", "s1", 2, daysAgo(60)),
      kw("s2-k0", "s2", 0, null),
      kw("s2-k1", "s2", 1, daysAgo(15)),
    ];
    expect(GOOGLE_KEYWORDS_MAX).toBe(3);
    const due = selectDueKeywords(rows, NOW);
    // s1-k3 (4e par position) est exclu ; s1-k1 n'est pas dû
    expect(due.map((r) => r.id)).toEqual(["s2-k0", "s1-k2", "s1-k0", "s2-k1"]);
    expect(selectDueKeywords(rows, NOW, 2).map((r) => r.id)).toEqual(["s2-k0", "s1-k2"]);
    expect(GOOGLE_SCAN_BATCH).toBe(8);
  });
});

describe("tâches d'avis et échéance des ticks", () => {
  it("une tâche encore en attente est abandonnée sur l'âge (3 jours), pas sur un compte de lectures", () => {
    expect(GOOGLE_REVIEW_TASK_MAX_AGE_DAYS).toBe(3);
    expect(isReviewTaskExpired(daysAgo(1), NOW)).toBe(false);
    expect(isReviewTaskExpired(daysAgo(3), NOW)).toBe(false);
    expect(isReviewTaskExpired(new Date(NOW.getTime() - 3 * DAY - 1), NOW)).toBe(true);
  });

  it("pastDeadline : sans échéance jamais ; sinon seulement une fois dépassée", () => {
    expect(pastDeadline({}, NOW.getTime())).toBe(false);
    expect(pastDeadline({ deadline: NOW }, NOW.getTime())).toBe(false);
    expect(pastDeadline({ deadline: NOW }, NOW.getTime() + 1)).toBe(true);
  });
});

describe("hasRealGoogleProvider", () => {
  it("vrai avec DataForSEO (hors mock forcé) ou une clé Places", () => {
    expect(hasRealGoogleProvider({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasRealGoogleProvider({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b" } as NodeJS.ProcessEnv)).toBe(true);
    expect(hasRealGoogleProvider({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b", DATAFORSEO_MOCK: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(hasRealGoogleProvider({ GOOGLE_PLACES_API_KEY: "k" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
