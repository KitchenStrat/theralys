import { describe, expect, it } from "vitest";
import { API_PROVIDER_IDS, API_PROVIDERS, resolveApiUsagePeriod, USD_TO_EUR_RATE } from "@theralys/shared";
import {
  applyPlacesBilling,
  billJournal,
  buildApiUsageReport,
  buildDailySeries,
  canonicalUsageHref,
  CHART_OTHER_KEY,
  CHART_PROVIDER_ORDER,
  clientSitesCost,
  computePlacesBilling,
  formatAxisEur,
  formatBucket,
  formatCompact,
  formatCount,
  formatDateTime,
  formatDayTime,
  formatDelta,
  formatDuration,
  formatEur,
  formatLongDate,
  formatLongDateTime,
  formatPercent,
  formatPrice,
  formatRelative,
  formatTime,
  formatTokens,
  formatUnits,
  formatUsd,
  formatUsdAsEur,
  hasUsageFilters,
  isMetaTokenError,
  isMissingTableError,
  journalPaging,
  listBuckets,
  matchesUsageFilters,
  metaTokenState,
  niceScale,
  NO_USAGE_FILTERS,
  parseUsageFilters,
  parseUsagePage,
  percentDelta,
  periodRevenueShare,
  placesCostRatio,
  placesFreeTier,
  PLATFORM_SITE_LABEL,
  scrapeCreatorsBalance,
  summarizeAnthropic,
  summarizeByFeature,
  summarizeByModel,
  summarizeByProvider,
  summarizeBySite,
  summarizeTotals,
  sumUsage,
  usageHref,
  usdToEur,
  type ApiUsageReportInput,
  type Billed,
  type UsageCubeRow,
  type UsageJournalRow,
  type UsageSeriesRow,
  type UsageSite,
} from "./api-usage";

/** Les nombres français portent des espaces insécables : on les ramène à des espaces simples pour comparer. */
const plain = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const SITE_DEMO = "33333333-3333-4333-8333-333333333333";

function cube(overrides: Partial<UsageCubeRow> = {}): UsageCubeRow {
  return {
    month: "2026-11",
    provider: "anthropic",
    operation: "messages",
    feature: "blog",
    siteId: SITE_A,
    model: "claude-opus-5",
    costSource: "tariff",
    status: "ok",
    calls: 1,
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    units: 0,
    costUsd: 0,
    durationMs: 0,
    timedCalls: 0,
    fallbackCalls: 0,
    lastAt: null,
    ...overrides,
  };
}

const billed = (rows: UsageCubeRow[]): Billed<UsageCubeRow>[] => applyPlacesBilling(rows, computePlacesBilling([]));

describe("formatEur", () => {
  it("adapte la précision au montant", () => {
    expect(plain(formatEur(0))).toBe("0 €");
    expect(plain(formatEur(1234.5))).toBe("1 235 €");
    expect(plain(formatEur(12.345))).toBe("12,35 €");
    expect(plain(formatEur(1))).toBe("1,00 €");
    expect(plain(formatEur(0.35))).toBe("0,35 €");
    expect(plain(formatEur(0.1))).toBe("0,10 €");
    expect(plain(formatEur(0.032))).toBe("0,032 €");
    expect(plain(formatEur(0.03))).toBe("0,03 €");
    expect(plain(formatEur(0.004))).toBe("0,004 €");
    expect(plain(formatEur(0.0004))).toBe("0,0004 €");
    expect(plain(formatEur(0.00004))).toBe("0,00004 €");
    expect(plain(formatEur(0.000001))).toBe("< 0,00001 €");
  });

  it("écrit les montants négatifs avec un vrai signe moins et tolère les valeurs absentes", () => {
    expect(plain(formatEur(-12.3))).toBe("−12,30 €");
    expect(plain(formatEur(null))).toBe("0 €");
    expect(plain(formatEur(Number.NaN))).toBe("0 €");
  });

  it("convertit les dollars du registre en euros", () => {
    expect(usdToEur(100)).toBeCloseTo(100 * USD_TO_EUR_RATE, 10);
    expect(plain(formatUsdAsEur(10))).toBe(plain(formatEur(10 * USD_TO_EUR_RATE)));
    expect(plain(formatUsd(0.035))).toBe("0,035 $");
    expect(plain(formatUsd(47))).toBe("47,00 $");
  });

  it("écrit les prix d'abonnement sans décimales quand ils sont ronds", () => {
    expect(plain(formatPrice(79))).toBe("79 €");
    expect(plain(formatPrice(1234))).toBe("1 234 €");
    expect(plain(formatPrice(65.833))).toBe("65,83 €");
    expect(plain(formatPrice(0))).toBe("0 €");
    expect(plain(formatPrice(null))).toBe("0 €");
  });
});

describe("formatCompact, formatTokens, formatUnits", () => {
  it("abrège les grands nombres", () => {
    expect(plain(formatCompact(0))).toBe("0");
    expect(plain(formatCompact(999))).toBe("999");
    expect(plain(formatCompact(1234))).toBe("1,2 k");
    expect(plain(formatCompact(340_000))).toBe("340 k");
    expect(plain(formatCompact(999_600))).toBe("1 M");
    expect(plain(formatCompact(1_200_000))).toBe("1,2 M");
    expect(plain(formatCompact(3_400_000_000))).toBe("3,4 Md");
    expect(plain(formatCompact(12.34))).toBe("12,3");
  });

  it("écrit le volume Anthropic en tokens d'entrée et de sortie", () => {
    expect(plain(formatTokens(1_200_000, 340_000))).toBe("1,2 M entrée / 340 k sortie");
  });

  it("accorde l'unité du fournisseur au nombre", () => {
    expect(plain(formatUnits(1, "images"))).toBe("1 image");
    expect(plain(formatUnits(0, "requêtes"))).toBe("0 requête");
    expect(plain(formatUnits(49, "requêtes"))).toBe("49 requêtes");
    expect(plain(formatUnits(2500, "crédits"))).toBe("2,5 k crédits");
  });

  it("formate les entiers à la française", () => {
    expect(plain(formatCount(1234567))).toBe("1 234 567");
    expect(plain(formatCount(null))).toBe("0");
  });
});

describe("formatPercent, formatDelta, formatDuration", () => {
  it("écrit parts et taux", () => {
    expect(plain(formatPercent(0))).toBe("0 %");
    expect(plain(formatPercent(0.0004))).toBe("< 0,1 %");
    expect(plain(formatPercent(0.004))).toBe("0,4 %");
    expect(plain(formatPercent(0.034))).toBe("3,4 %");
    expect(plain(formatPercent(0.123))).toBe("12 %");
    expect(plain(formatPercent(1))).toBe("100 %");
    expect(plain(formatPercent(-0.25))).toBe("−25 %");
  });

  it("écrit la variation par rapport à la période précédente", () => {
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(0.001)).toBe("stable");
    expect(plain(formatDelta(0.123))).toBe("+12 %");
    expect(plain(formatDelta(-0.081))).toBe("−8,1 %");
    expect(plain(formatDelta(11))).toBe("× 12");
  });

  it("écrit les durées d'appel", () => {
    expect(plain(formatDuration(850))).toBe("850 ms");
    expect(plain(formatDuration(2400))).toBe("2,4 s");
    expect(plain(formatDuration(42_000))).toBe("42 s");
    expect(plain(formatDuration(72_000))).toBe("1 min 12 s");
    expect(plain(formatDuration(null))).toBe("0 ms");
  });
});

describe("dates d'affichage (heure de Paris)", () => {
  const date = new Date("2026-11-11T13:32:05Z");

  it("heure, date longue et horodatage du journal", () => {
    expect(formatTime(date)).toBe("14:32");
    expect(formatLongDate(date)).toBe("11 novembre 2026");
    expect(formatLongDateTime(date)).toBe("11 novembre 2026 à 14:32");
    expect(formatDateTime(date)).toBe("11/11/2026 14:32:05");
    expect(formatDayTime(date)).toBe("11/11 14:32:05");
  });

  it("ancienneté courte d'un appel, puis la date au-delà d'un mois", () => {
    const ago = (ms: number) => plain(formatRelative(new Date(date.getTime() - ms), date));
    expect(ago(20_000)).toBe("à l'instant");
    expect(ago(3 * 60_000)).toBe("il y a 3 min");
    expect(ago(2 * 3_600_000)).toBe("il y a 2 h");
    expect(ago(5 * 86_400_000)).toBe("il y a 5 j");
    expect(ago(40 * 86_400_000)).toBe("2 oct. 2026");
  });

  it("graduations d'axe homogènes, au nombre de décimales du pas", () => {
    expect(plain(formatAxisEur(0, 0.005))).toBe("0 €");
    expect(plain(formatAxisEur(0.01, 0.005))).toBe("0,010 €");
    expect(plain(formatAxisEur(0.5, 0.25))).toBe("0,50 €");
    expect(plain(formatAxisEur(1, 0.5))).toBe("1,00 €");
    expect(plain(formatAxisEur(4, 2))).toBe("4 €");
    expect(plain(formatAxisEur(1250, 250))).toBe("1 250 €");
    expect(plain(formatAxisEur(0.0025, 0.0025))).toBe("0,0025 €");
    // Pas de 2,5 : jamais d'arrondi trompeur (« 3 € » pour 2,50 €)
    expect(plain(formatAxisEur(2.5, 2.5))).toBe("2,50 €");
    expect(plain(formatAxisEur(10, 2.5))).toBe("10,00 €");
  });

  it("libellés des intervalles du graphique", () => {
    expect(formatBucket("2026-11-03")).toBe("3 nov.");
    expect(formatBucket("2026-11-03", "long")).toBe("mardi 3 novembre");
    expect(plain(formatBucket("2026-11-11T14"))).toBe("15 h");
    expect(plain(formatBucket("2026-11-11T23", "long"))).toBe("de 0 h à 1 h");
    expect(formatBucket("n'importe quoi")).toBe("n'importe quoi");
  });
});

describe("parseUsageFilters", () => {
  it("accepte les valeurs des listes et l'identifiant de site au format UUID", () => {
    expect(parseUsageFilters({ fournisseur: "anthropic", fonctionnalite: "blog", site: "ABCDEF12-3456-4789-ABCD-EF1234567890", statut: "erreur" })).toEqual({
      provider: "anthropic",
      feature: "blog",
      siteId: "abcdef12-3456-4789-abcd-ef1234567890",
      status: "error",
    });
    expect(parseUsageFilters({ fonctionnalite: "aucune", site: "aucun", statut: "ok" })).toEqual({
      provider: null,
      feature: "none",
      siteId: "none",
      status: "ok",
    });
  });

  it("ignore toute valeur hors liste (injection, format invalide)", () => {
    expect(
      parseUsageFilters({
        fournisseur: "anthropic'; drop table api_usage;--",
        fonctionnalite: "blog or 1=1",
        site: "1 or 1=1",
        statut: "tous",
      }),
    ).toEqual(NO_USAGE_FILTERS);
    expect(parseUsageFilters({ site: "11111111-1111-4111-8111-11111111111" }).siteId).toBeNull();
    expect(parseUsageFilters({}).provider).toBeNull();
  });

  it("garde un fournisseur absent du barème s'il a la forme d'un identifiant, et la première valeur d'un paramètre répété", () => {
    expect(parseUsageFilters({ fournisseur: "deepl" }).provider).toBe("deepl");
    expect(parseUsageFilters({ fournisseur: ["fal", "anthropic"] }).provider).toBe("fal");
  });

  it("borne le numéro de page", () => {
    expect(parseUsagePage(undefined)).toBe(1);
    expect(parseUsagePage("3")).toBe(3);
    expect(parseUsagePage("0")).toBe(1);
    expect(parseUsagePage("-2")).toBe(1);
    expect(parseUsagePage("2; drop")).toBe(1);
    expect(parseUsagePage("999999")).toBe(2000);
  });

  it("écrit l'adresse d'une vue sans les paramètres par défaut", () => {
    expect(usageHref("/couts")).toBe("/couts");
    expect(usageHref("/couts", { period: "mois" })).toBe("/couts");
    expect(usageHref("/couts", { period: "7j", filters: { provider: "fal", feature: "none", siteId: "none", status: "error" }, page: 2, hash: "journal" })).toBe(
      "/couts?periode=7j&fournisseur=fal&fonctionnalite=aucune&site=aucun&statut=erreur&page=2#journal",
    );
    expect(hasUsageFilters(NO_USAGE_FILTERS)).toBe(false);
    expect(hasUsageFilters({ ...NO_USAGE_FILTERS, status: "ok" })).toBe(true);
  });

  it("ramène une adresse à sa forme canonique (paramètres vides, invalides ou inconnus retirés)", () => {
    expect(canonicalUsageHref("/couts", {}, "mois")).toEqual({ href: "/couts", isCanonical: true });
    expect(canonicalUsageHref("/couts", { periode: "7j", fournisseur: "fal", page: "2" }, "7j")).toEqual({
      href: "/couts?periode=7j&fournisseur=fal&page=2",
      isCanonical: true,
    });
    // Formulaire envoyé avec des listes laissées sur « Tous »
    expect(canonicalUsageHref("/couts", { periode: "7j", fournisseur: "", fonctionnalite: "", site: "", statut: "erreur" }, "7j")).toEqual({
      href: "/couts?periode=7j&statut=erreur",
      isCanonical: false,
    });
    expect(canonicalUsageHref("/couts", { periode: "mois" }, "mois")).toEqual({ href: "/couts", isCanonical: false });
    expect(canonicalUsageHref("/couts", { site: "1 or 1=1", page: "1" }, "mois")).toEqual({ href: "/couts", isCanonical: false });
    expect(canonicalUsageHref("/couts", { utm_source: "mail" }, "mois").isCanonical).toBe(false);
    expect(canonicalUsageHref("/couts", { site: "ABCDEF12-3456-4789-ABCD-EF1234567890" }, "mois")).toEqual({
      href: "/couts?site=abcdef12-3456-4789-abcd-ef1234567890",
      isCanonical: false,
    });
  });
});

describe("isMissingTableError", () => {
  it("reconnaît l'erreur Postgres 42P01, même enveloppée", () => {
    const pgError = Object.assign(new Error('relation "api_usage" does not exist'), { code: "42P01" });
    expect(isMissingTableError(pgError)).toBe(true);
    expect(isMissingTableError(new Error("Failed query", { cause: pgError }))).toBe(true);
    expect(isMissingTableError(new Error("niveau 2", { cause: new Error("niveau 1", { cause: pgError }) }))).toBe(true);
  });

  it("laisse passer les autres erreurs", () => {
    expect(isMissingTableError(Object.assign(new Error("colonne inconnue"), { code: "42703" }))).toBe(false);
    expect(isMissingTableError(new Error("connexion refusée"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError("42P01")).toBe(false);
  });
});

describe("computePlacesBilling — franchise gratuite Google Places", () => {
  it("aucun appel : rien à facturer, ratio neutre", () => {
    const billing = computePlacesBilling([]);
    expect(billing).toEqual({ lines: [], listUsd: 0, billedUsd: 0, ratios: {} });
    expect(placesCostRatio(billing, "google_places", "2026-11", "text_search")).toBe(1);
  });

  it("sous la franchise : le prix catalogue est entièrement effacé", () => {
    const billing = computePlacesBilling([{ month: "2026-11", operation: "text_search", before: 100, within: 200, listUsd: 200 * 0.035 }]);
    expect(billing.billedUsd).toBe(0);
    expect(billing.listUsd).toBeCloseTo(7, 6);
    expect(billing.lines[0]).toMatchObject({ freeCalls: 200, billedCalls: 0, ratio: 0, label: "Recherche d'établissement" });
    expect(placesCostRatio(billing, "google_places", "2026-11", "text_search")).toBe(0);
  });

  it("à cheval sur la franchise : seuls les appels au-delà du 1 000ᵉ du mois sont facturés", () => {
    // 900 appels avant la période, 300 pendant : 100 gratuits, 200 facturés
    const billing = computePlacesBilling([{ month: "2026-11", operation: "text_search", before: 900, within: 300, listUsd: 300 * 0.035 }]);
    expect(billing.billedUsd).toBeCloseTo(200 * 0.035, 6);
    expect(billing.lines[0]).toMatchObject({ freeCalls: 100, billedCalls: 200 });
    expect(billing.lines[0]?.ratio).toBeCloseTo(2 / 3, 6);
  });

  it("franchise déjà épuisée avant la période : tout est facturé au prix catalogue", () => {
    const billing = computePlacesBilling([{ month: "2026-11", operation: "place_photo", before: 1500, within: 10, listUsd: 10 * 0.007 }]);
    expect(billing.lines[0]?.ratio).toBe(1);
    expect(billing.billedUsd).toBeCloseTo(0.07, 6);
  });

  it("période sur deux mois : chaque mois a sa propre franchise", () => {
    const billing = computePlacesBilling([
      // Octobre : 950 avant la période, 100 pendant → 50 facturés
      { month: "2026-10", operation: "place_details", before: 950, within: 100, listUsd: 100 * 0.025 },
      // Novembre : la période couvre le début du mois, 1 200 appels → 200 facturés
      { month: "2026-11", operation: "place_details", before: 0, within: 1200, listUsd: 1200 * 0.025 },
    ]);
    expect(billing.lines.map((line) => [line.month, line.billedCalls])).toEqual([
      ["2026-10", 50],
      ["2026-11", 200],
    ]);
    expect(placesCostRatio(billing, "google_places", "2026-10", "place_details")).toBeCloseTo(0.5, 6);
    expect(placesCostRatio(billing, "google_places", "2026-11", "place_details")).toBeCloseTo(200 / 1200, 6);
    expect(billing.billedUsd).toBeCloseTo(250 * 0.025, 6);
    expect(billing.listUsd).toBeCloseTo(1300 * 0.025, 6);
  });

  it("chaque type d'appel a sa franchise ; un type inconnu garde son prix catalogue", () => {
    const billing = computePlacesBilling([
      { month: "2026-11", operation: "text_search", before: 0, within: 1100, listUsd: 1100 * 0.035 },
      { month: "2026-11", operation: "place_photo", before: 0, within: 900, listUsd: 900 * 0.007 },
      { month: "2026-11", operation: "autocomplete", before: 0, within: 5000, listUsd: 14 },
    ]);
    expect(billing.lines).toHaveLength(2);
    expect(billing.billedUsd).toBeCloseTo(100 * 0.035, 6);
    expect(placesCostRatio(billing, "google_places", "2026-11", "place_photo")).toBe(0);
    expect(placesCostRatio(billing, "google_places", "2026-11", "autocomplete")).toBe(1);
    // Un nom d'opération qui existe sur tout objet JavaScript n'est pas un type d'appel du barème
    expect(computePlacesBilling([{ month: "2026-11", operation: "toString", before: 0, within: 5, listUsd: 1 }]).lines).toEqual([]);
  });

  it("ne dépasse jamais le prix catalogue inscrit et cumule les lignes d'un même mois", () => {
    // Prix inscrit inférieur au barème (0,01 $ l'appel) : le ratio est borné à 1
    const cheap = computePlacesBilling([{ month: "2026-11", operation: "text_search", before: 2000, within: 10, listUsd: 0.1 }]);
    expect(cheap.lines[0]?.ratio).toBe(1);
    expect(cheap.billedUsd).toBeCloseTo(0.1, 6);

    const merged = computePlacesBilling([
      { month: "2026-11", operation: "text_search", before: 600, within: 300, listUsd: 300 * 0.035 },
      { month: "2026-11", operation: "text_search", before: 300, within: 200, listUsd: 200 * 0.035 },
    ]);
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]).toMatchObject({ before: 900, within: 500, billedCalls: 400 });
  });

  it("applique le ratio aux seules lignes Google Places, pour que tous les totaux concordent", () => {
    const billing = computePlacesBilling([{ month: "2026-11", operation: "text_search", before: 900, within: 300, listUsd: 300 * 0.035 }]);
    const rows = applyPlacesBilling(
      [
        cube({ provider: "google_places", operation: "text_search", feature: "prospecting", siteId: null, calls: 180, costUsd: 180 * 0.035 }),
        cube({ provider: "google_places", operation: "text_search", feature: "google_profile", calls: 120, costUsd: 120 * 0.035 }),
        cube({ provider: "google_places", operation: "text_search", month: "2026-10", calls: 10, costUsd: 0.35 }),
        cube({ provider: "anthropic", calls: 3, costUsd: 1.5 }),
      ],
      billing,
    );
    expect(rows.map((row) => row.listCostUsd)).toEqual([180 * 0.035, 120 * 0.035, 0.35, 1.5]);
    expect((rows[0]?.costUsd ?? 0) + (rows[1]?.costUsd ?? 0)).toBeCloseTo(billing.billedUsd, 6);
    // Autre mois (hors facturation calculée) et autre fournisseur : inchangés
    expect(rows[2]?.costUsd).toBe(0.35);
    expect(rows[3]?.costUsd).toBe(1.5);
    expect(summarizeByProvider(rows).find((p) => p.id === "google_places")?.costUsd).toBeCloseTo(7 + 0.35, 6);
  });

  it("consommation de la franchise du mois en cours, type par type", () => {
    const lines = placesFreeTier(
      [
        { month: "2026-11", operation: "text_search", before: 0, within: 412, listUsd: 412 * 0.035 },
        { month: "2026-11", operation: "place_photo", before: 0, within: 1150, listUsd: 1150 * 0.007 },
        { month: "2026-10", operation: "place_details", before: 0, within: 999, listUsd: 1 },
      ],
      "2026-11",
    );
    expect(lines.map((line) => [line.operation, line.used, line.freePerMonth, line.billedCalls])).toEqual([
      ["text_search", 412, 1000, 0],
      ["place_details", 0, 1000, 0],
      ["place_photo", 1150, 1000, 150],
    ]);
    expect(lines[2]?.billedUsd).toBeCloseTo(150 * 0.007, 6);
  });
});

describe("totaux et filtres", () => {
  const rows = billed([
    cube({ calls: 10, costUsd: 2, inputTokens: 1000, outputTokens: 500, durationMs: 30_000, timedCalls: 10 }),
    cube({ calls: 2, status: "error", durationMs: 4000, timedCalls: 2 }),
    cube({ provider: "resend", operation: "email", feature: "notifications", siteId: null, model: null, costSource: "free", calls: 8, units: 8 }),
    cube({ provider: "dataforseo", operation: "scan", feature: "google_profile", siteId: SITE_B, model: null, costSource: "provider", calls: 4, units: 196, costUsd: 0.4 }),
    cube({ provider: "deepl", operation: "translate", feature: "traduction", siteId: null, model: null, calls: 1, costUsd: 0.1 }),
  ]);

  it("additionne appels, erreurs, coût, tokens et durée moyenne des appels mesurés", () => {
    const totals = summarizeTotals(rows);
    expect(totals.calls).toBe(25);
    expect(totals.errors).toBe(2);
    expect(totals.errorRate).toBeCloseTo(0.08, 6);
    expect(totals.costUsd).toBeCloseTo(2.5, 6);
    expect(totals.inputTokens).toBe(1000);
    expect(totals.avgCostUsd).toBeCloseTo(0.1, 6);
    expect(totals.avgDurationMs).toBeCloseTo(34_000 / 12, 6);
    expect(summarizeTotals([])).toMatchObject({ calls: 0, errorRate: 0, avgCostUsd: 0, avgDurationMs: null });
    expect(sumUsage(rows)).toEqual({ calls: 25, errors: 2, costUsd: 2.5 });
  });

  it("filtre par fournisseur, fonctionnalité, site et statut", () => {
    const count = (filters: Parameters<typeof matchesUsageFilters>[1]) => sumUsage(rows.filter((row) => matchesUsageFilters(row, filters))).calls;
    expect(count(NO_USAGE_FILTERS)).toBe(25);
    expect(count({ ...NO_USAGE_FILTERS, provider: "anthropic" })).toBe(12);
    expect(count({ ...NO_USAGE_FILTERS, feature: "google_profile" })).toBe(4);
    // « Non attribué » : fonctionnalité absente ou inconnue du barème
    expect(count({ ...NO_USAGE_FILTERS, feature: "none" })).toBe(1);
    expect(count({ ...NO_USAGE_FILTERS, siteId: SITE_B })).toBe(4);
    expect(count({ ...NO_USAGE_FILTERS, siteId: "none" })).toBe(9);
    expect(count({ ...NO_USAGE_FILTERS, status: "error" })).toBe(2);
    expect(count({ ...NO_USAGE_FILTERS, status: "ok" })).toBe(23);
    expect(count({ provider: "anthropic", feature: "blog", siteId: SITE_A, status: "ok" })).toBe(10);
  });

  it("variation relative, sans point de comparaison quand la période précédente est vide", () => {
    expect(percentDelta(12, 10)).toBeCloseTo(0.2, 6);
    expect(percentDelta(5, 10)).toBeCloseTo(-0.5, 6);
    expect(percentDelta(5, 0)).toBeNull();
    expect(percentDelta(0, 0)).toBeNull();
  });
});

describe("summarizeByProvider", () => {
  const at = (iso: string) => new Date(iso);
  const rows = billed([
    cube({ calls: 10, costUsd: 2, inputTokens: 1000, outputTokens: 500, durationMs: 30_000, timedCalls: 10, lastAt: at("2026-11-10T08:00:00Z") }),
    cube({ calls: 2, status: "error", lastAt: at("2026-11-11T09:00:00Z") }),
    cube({ provider: "dataforseo", operation: "scan", model: null, costSource: "provider", calls: 4, units: 196, costUsd: 0.5 }),
    cube({ provider: "resend", operation: "email", model: null, costSource: "free", calls: 8, units: 8 }),
    cube({ provider: "deepl", operation: "translate", model: null, calls: 1, costUsd: 0.1 }),
  ]);
  const providers = summarizeByProvider(rows, [
    { provider: "anthropic", operation: "messages", error: "  529 Overloaded ", createdAt: at("2026-11-11T09:00:00Z") },
    { provider: "anthropic", operation: "messages", error: "plus ancienne", createdAt: at("2026-11-02T09:00:00Z") },
    { provider: "fal", operation: "image", error: null, createdAt: at("2026-11-03T09:00:00Z") },
  ]);

  it("liste tous les fournisseurs du barème, même sans appel, et les valeurs inconnues du registre", () => {
    expect(providers.map((p) => p.id).sort()).toEqual([...API_PROVIDER_IDS, "deepl"].sort());
    const vercel = providers.find((p) => p.id === "vercel");
    expect(vercel).toMatchObject({ calls: 0, costUsd: 0, lastCallAt: null, known: true, free: true, costSources: [] });
    expect(providers.find((p) => p.id === "deepl")).toMatchObject({ known: false, label: "deepl", calls: 1, free: false });
  });

  it("trie par coût, puis par appels, puis dans l'ordre du barème", () => {
    expect(providers.slice(0, 4).map((p) => p.id)).toEqual(["anthropic", "dataforseo", "deepl", "resend"]);
    const idle = providers.slice(4).map((p) => p.id);
    expect(idle).toEqual(API_PROVIDER_IDS.filter((id) => idle.includes(id)));
  });

  it("agrège volume, part du coût, erreurs, durée moyenne, dernier appel et dernière erreur", () => {
    const anthropic = providers.find((p) => p.id === "anthropic");
    expect(anthropic).toMatchObject({ calls: 12, errors: 2, inputTokens: 1000, outputTokens: 500, costSources: ["tariff"], avgDurationMs: 3000 });
    expect(anthropic?.errorRate).toBeCloseTo(2 / 12, 6);
    expect(anthropic?.share).toBeCloseTo(2 / 2.6, 6);
    expect(anthropic?.lastCallAt).toEqual(at("2026-11-11T09:00:00Z"));
    expect(anthropic?.lastError).toEqual({ message: "529 Overloaded", operation: "messages", at: at("2026-11-11T09:00:00Z") });
    expect(providers.find((p) => p.id === "fal")?.lastError?.message).toBe("Erreur sans message");
    expect(providers.find((p) => p.id === "dataforseo")).toMatchObject({ units: 196, costSources: ["provider"], avgDurationMs: null });
    expect(providers.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1, 6);
  });

  it("ne garde que le fournisseur filtré quand on le demande", () => {
    const only = summarizeByProvider(
      rows.filter((row) => row.provider === "resend"),
      [],
      ["resend"],
    );
    expect(only.map((p) => p.id)).toEqual(["resend"]);
  });
});

describe("summarizeByFeature", () => {
  it("regroupe par fonctionnalité, les valeurs absentes ou inconnues sous « Non attribué »", () => {
    const features = summarizeByFeature(
      billed([
        cube({ feature: "blog", calls: 5, costUsd: 1 }),
        cube({ feature: "blog", status: "error", calls: 1 }),
        cube({ feature: null, calls: 2, costUsd: 0.2 }),
        cube({ feature: "traduction", calls: 1, costUsd: 0.3 }),
        cube({ feature: "social", calls: 3, costUsd: 0 }),
      ]),
    );
    expect(features.map((f) => [f.id, f.label, f.calls, f.errors])).toEqual([
      ["blog", "Blog", 6, 1],
      [null, "Non attribué", 3, 0],
      ["social", "Réseaux sociaux", 3, 0],
    ]);
    expect(features[0]?.share).toBeCloseTo(1 / 1.5, 6);
    expect(summarizeByFeature([])).toEqual([]);
  });
});

describe("summarizeBySite", () => {
  const sites: UsageSite[] = [
    { id: SITE_A, name: "Cabinet A", type: "client", status: "ready", plan: "scale", subscription: { plan: "scale", billingPeriod: "monthly", status: "active" } },
    { id: SITE_B, name: "Cabinet B", type: "client", status: "ready", plan: "starter", subscription: { plan: "starter", billingPeriod: "annual", status: "trialing" } },
    { id: SITE_DEMO, name: "Démo C", type: "demo", status: "ready", plan: "scale", subscription: null },
    { id: "44444444-4444-4444-8444-444444444444", name: "Cabinet D", type: "client", status: "ready", plan: "scale", subscription: { plan: "scale", billingPeriod: "annual", status: "active" } },
    { id: "55555555-5555-4555-8555-555555555555", name: "Cabinet archivé", type: "client", status: "archived", plan: "scale", subscription: null },
  ];
  const rows = billed([
    cube({ siteId: SITE_A, calls: 10, costUsd: 10 }),
    cube({ siteId: SITE_A, calls: 1, status: "error" }),
    cube({ siteId: SITE_B, calls: 2, costUsd: 1 }),
    cube({ siteId: SITE_DEMO, calls: 4, costUsd: 3 }),
    cube({ siteId: null, calls: 6, costUsd: 0.5 }),
    cube({ siteId: "99999999-9999-4999-8999-999999999999", calls: 1, costUsd: 0.25 }),
  ]);

  it("rapproche coût API, revenu mensuel et marge des sites clients", () => {
    const summary = summarizeBySite(rows, sites, "mois");
    expect(summary.map((s) => s.name)).toEqual(["Cabinet A", "Démo C", "Cabinet B", PLATFORM_SITE_LABEL, "Site supprimé"]);
    const a = summary[0];
    expect(a).toMatchObject({ type: "client", planLabel: "Scale", calls: 11, errors: 1, revenueEur: 79, subscriptionStatus: "active" });
    expect(a?.marginEur).toBeCloseTo(79 - 10 * USD_TO_EUR_RATE, 6);
    expect(a?.marginRate).toBeCloseTo((79 - 10 * USD_TO_EUR_RATE) / 79, 6);
    // Abonnement en essai : pas de revenu, la marge est le coût en négatif
    const b = summary.find((s) => s.siteId === SITE_B);
    expect(b).toMatchObject({ revenueEur: 0, marginRate: null });
    expect(b?.marginEur).toBeCloseTo(-USD_TO_EUR_RATE, 6);
    // Démo et appels sans site : coût seul
    expect(summary.find((s) => s.siteId === SITE_DEMO)).toMatchObject({ type: "demo", revenueEur: null, marginEur: null });
    expect(summary.find((s) => s.siteId === null)).toMatchObject({ type: null, calls: 6, revenueEur: null });
    expect(summary.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 6);
  });

  it("ramène le revenu à la durée de la fenêtre pour 7 jours et pour la journée", () => {
    expect(periodRevenueShare("mois")).toBe(1);
    expect(periodRevenueShare("mois-precedent")).toBe(1);
    expect(periodRevenueShare("30j")).toBe(1);
    expect(periodRevenueShare("7j")).toBeCloseTo(7 / 30, 6);
    expect(periodRevenueShare("aujourdhui")).toBeCloseTo(1 / 30, 6);
    const a = summarizeBySite(rows, sites, "7j")[0];
    expect(a?.revenueEur).toBe(79);
    expect(a?.marginEur).toBeCloseTo((79 * 7) / 30 - 10 * USD_TO_EUR_RATE, 6);
  });

  it("ajoute sur demande les sites clients actifs sans appel, jamais les archivés ni les démos", () => {
    const summary = summarizeBySite(rows, sites, "mois", { includeIdleClients: true });
    const idle = summary.find((s) => s.name === "Cabinet D");
    expect(idle).toMatchObject({ calls: 0, costUsd: 0, revenueEur: 55, marginEur: 55, marginRate: 1 });
    expect(summary.some((s) => s.name === "Cabinet archivé")).toBe(false);
    expect(summarizeBySite([], [], "mois")).toEqual([]);
  });

  it("coût moyen par site client actif", () => {
    const summary = summarizeBySite(rows, sites, "mois");
    expect(clientSitesCost(summary, 3)).toEqual({ costUsd: 11, avgCostUsd: 11 / 3 });
    expect(clientSitesCost(summary, 0).avgCostUsd).toBeNull();
  });
});

describe("Anthropic : par modèle et par fonctionnalité", () => {
  const rows = billed([
    cube({ model: "claude-opus-5", feature: "blog", calls: 10, costUsd: 2, inputTokens: 10_000, outputTokens: 40_000 }),
    cube({ model: "claude-opus-5", feature: "blog", status: "error", calls: 1 }),
    cube({ model: "claude-opus-4-8", feature: "site_generation", calls: 2, costUsd: 0.9, fallbackCalls: 2 }),
    cube({ model: "claude-mystery-9", feature: null, calls: 1, costUsd: 0.1 }),
    cube({ model: null, feature: "social", calls: 1, costUsd: 0 }),
    cube({ provider: "fal", model: "fal-ai/flux/schnell", calls: 5, costUsd: 0.015 }),
  ]);

  it("ventile par modèle et signale ceux dont le prix n'est pas au barème", () => {
    const models = summarizeByModel(rows);
    expect(models.map((m) => [m.model, m.calls, m.priceKnown, m.fallbackCalls])).toEqual([
      ["claude-opus-5", 11, true, 0],
      ["claude-opus-4-8", 2, true, 2],
      ["claude-mystery-9", 1, false, 0],
      ["", 1, false, 0],
    ]);
    expect(models[0]).toMatchObject({ errors: 1, inputTokens: 10_000, outputTokens: 40_000 });
    expect(models[0]?.avgCostUsd).toBeCloseTo(2 / 11, 6);
    expect(models[0]?.share).toBeCloseTo(2 / 3, 6);
  });

  it("coût moyen par appel, global et par fonctionnalité, et appels servis par un modèle de repli", () => {
    const anthropic = summarizeAnthropic(rows);
    expect(anthropic).toMatchObject({ calls: 15, errors: 1, fallbackCalls: 2 });
    expect(anthropic.costUsd).toBeCloseTo(3, 6);
    expect(anthropic.avgCostUsd).toBeCloseTo(0.2, 6);
    expect(anthropic.byFeature.map((f) => [f.label, f.calls])).toEqual([
      ["Blog", 11],
      ["Génération de sites", 2],
      ["Non attribué", 1],
      ["Réseaux sociaux", 1],
    ]);
    expect(anthropic.byFeature[1]?.avgCostUsd).toBeCloseTo(0.45, 6);
    expect(summarizeAnthropic([])).toEqual({ calls: 0, errors: 0, costUsd: 0, avgCostUsd: 0, fallbackCalls: 0, byFeature: [] });
  });
});

describe("soldes et échéances", () => {
  const at = new Date("2026-11-10T10:00:00Z");

  it("solde ScrapeCreators au dernier appel qui le porte, alerte sous 200 crédits", () => {
    expect(scrapeCreatorsBalance(null)).toBeNull();
    expect(scrapeCreatorsBalance({ credits: null, at })).toBeNull();
    expect(scrapeCreatorsBalance({ credits: "abc", at })).toBeNull();
    expect(scrapeCreatorsBalance({ credits: "23871", at })).toEqual({ credits: 23871, at, low: false });
    expect(scrapeCreatorsBalance({ credits: 199, at })).toEqual({ credits: 199, at, low: true });
    expect(scrapeCreatorsBalance({ credits: 200, at })?.low).toBe(false);
    expect(scrapeCreatorsBalance({ credits: 0, at })).toEqual({ credits: 0, at, low: true });
  });

  it("reconnaît une erreur de jeton Meta", () => {
    expect(isMetaTokenError("Meta 400 (code 190) : Error validating access token: Session has expired")).toBe(true);
    expect(isMetaTokenError("Invalid OAuth access token.")).toBe(true);
    expect(isMetaTokenError("Meta 400 code 190")).toBe(true);
    expect(isMetaTokenError("Meta 500 : erreur interne, code 1900")).toBe(false);
    expect(isMetaTokenError("Délai dépassé")).toBe(false);
    expect(isMetaTokenError(null)).toBe(false);
  });

  it("déduit l'état du jeton Meta du dernier appel", () => {
    const success = new Date("2026-11-09T08:00:00Z");
    expect(metaTokenState(null, null)).toEqual({ status: "unknown", lastSuccessAt: null, errorAt: null, errorMessage: null });
    expect(metaTokenState({ status: "ok", error: null, createdAt: at }, at)).toMatchObject({ status: "ok", lastSuccessAt: at });
    const expired = metaTokenState({ status: "error", error: "Error validating access token", createdAt: at }, success);
    expect(expired).toEqual({ status: "expired", lastSuccessAt: success, errorAt: at, errorMessage: "Error validating access token" });
    // Un échec sans rapport avec le jeton ne dit rien de sa validité
    expect(metaTokenState({ status: "error", error: "Délai dépassé", createdAt: at }, success)).toMatchObject({ status: "unknown", lastSuccessAt: success, errorAt: null });
  });
});

describe("graphique : intervalles, séries et échelle", () => {
  it("liste les jours (temps universel) touchés par la période", () => {
    expect(listBuckets(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-03T12:00:00Z"), "day")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    // La borne de fin est exclue : un mois civil entier ne déborde pas sur le suivant
    expect(listBuckets(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), "day")).toHaveLength(31);
    // Fenêtre glissante de 30 jours commencée en milieu de journée : 31 jours touchés
    expect(listBuckets(new Date("2026-10-12T15:00:00Z"), new Date("2026-11-11T15:00:00Z"), "day")).toHaveLength(31);
    expect(listBuckets(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-11T00:00:00Z"), "day")).toEqual(["2026-11-11"]);
  });

  it("vue du jour : les 24 heures de la journée", () => {
    const hours = listBuckets(new Date("2026-11-11T00:00:00Z"), new Date("2026-11-11T09:30:00Z"), "hour");
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("2026-11-11T00");
    expect(hours[23]).toBe("2026-11-11T23");
  });

  const series = (overrides: Partial<UsageSeriesRow>): UsageSeriesRow => ({ bucket: "2026-11-01", provider: "anthropic", operation: "messages", status: "ok", calls: 1, costUsd: 0, ...overrides });
  const period = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-03T12:00:00Z"), granularity: "day" as const };
  const rows = [
    series({ bucket: "2026-11-01", provider: "anthropic", calls: 4, costUsd: 4 }),
    series({ bucket: "2026-11-01", provider: "anthropic", status: "error", calls: 1 }),
    series({ bucket: "2026-11-01", provider: "fal", operation: "image", calls: 2, costUsd: 0.5 }),
    series({ bucket: "2026-11-03", provider: "dataforseo", operation: "scan", calls: 3, costUsd: 1 }),
    series({ bucket: "2026-11-03", provider: "deepl", operation: "translate", calls: 1, costUsd: 0.25 }),
    series({ bucket: "2026-11-03", provider: "resend", operation: "email", calls: 9, costUsd: 0 }),
    series({ bucket: "2026-12-25", provider: "anthropic", calls: 1, costUsd: 99 }),
  ];

  it("empile le coût par fournisseur dans l'ordre fixe des séries, jours vides compris", () => {
    const daily = buildDailySeries(rows, period);
    expect(daily.series.map((s) => s.key)).toEqual(["anthropic", "fal", "dataforseo", CHART_OTHER_KEY]);
    expect(daily.series[0]?.label).toBe(API_PROVIDERS.anthropic.label);
    expect(daily.buckets.map((b) => b.key)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(daily.buckets[0]).toMatchObject({ calls: 7, errors: 1, totalUsd: 4.5, valuesUsd: [4, 0.5, 0, 0] });
    expect(daily.buckets[1]).toMatchObject({ calls: 0, totalUsd: 0, valuesUsd: [0, 0, 0, 0] });
    // Fournisseur hors barème → « Autres » ; appels gratuits comptés mais sans segment
    expect(daily.buckets[2]).toMatchObject({ calls: 13, totalUsd: 1.25, valuesUsd: [0, 0, 1, 0.25] });
    expect(daily.totalUsd).toBeCloseTo(5.75, 6);
    expect(daily.maxUsd).toBe(4.5);
  });

  it("regroupe les fournisseurs les moins coûteux dans « Autres » au-delà du nombre de séries", () => {
    const daily = buildDailySeries(rows, { ...period, maxSeries: 1 });
    expect(daily.series.map((s) => s.key)).toEqual(["anthropic", CHART_OTHER_KEY]);
    expect(daily.buckets[0]?.valuesUsd).toEqual([4, 0.5]);
    expect(daily.buckets[2]?.valuesUsd).toEqual([0, 1.25]);
    expect(daily.totalUsd).toBeCloseTo(5.75, 6);
  });

  it("sans coût sur la période : aucune série, mais l'activité reste comptée", () => {
    const daily = buildDailySeries([series({ provider: "resend", calls: 3 })], period);
    expect(daily.series).toEqual([]);
    expect(daily.buckets[0]).toMatchObject({ calls: 3, totalUsd: 0, valuesUsd: [] });
    expect(daily.maxUsd).toBe(0);
  });

  it("réserve une série à chaque fournisseur payant du barème", () => {
    const paying = API_PROVIDER_IDS.filter((id) => !API_PROVIDERS[id].free);
    expect([...CHART_PROVIDER_ORDER].sort()).toEqual([...paying].sort());
  });

  it("gradue l'axe avec des valeurs rondes", () => {
    expect(niceScale(0.0137)).toEqual({ top: 0.015, step: 0.005, ticks: [0, 0.005, 0.01, 0.015] });
    expect(niceScale(4.5)).toEqual({ top: 6, step: 2, ticks: [0, 2, 4, 6] });
    expect(niceScale(100)).toEqual({ top: 100, step: 25, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(0.9).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceScale(0)).toEqual({ top: 1, step: 1, ticks: [0, 1] });
    expect(niceScale(Number.NaN).top).toBe(1);
    const scale = niceScale(37.2);
    expect(scale.top).toBeGreaterThanOrEqual(37.2);
    expect(scale.ticks.length).toBeLessThanOrEqual(6);
  });
});

describe("journal", () => {
  const entry = (overrides: Partial<UsageJournalRow>): UsageJournalRow => ({
    id: "id",
    createdAt: new Date("2026-11-05T10:00:00Z"),
    provider: "anthropic",
    operation: "messages",
    feature: "blog",
    siteId: SITE_A,
    siteName: "Cabinet A",
    model: "claude-opus-5",
    status: "ok",
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    units: 0,
    costUsd: 0.2,
    costSource: "tariff",
    durationMs: 1200,
    error: null,
    ...overrides,
  });

  it("déduit la franchise Google Places ligne à ligne, avec le même ratio que les ventilations", () => {
    const billing = computePlacesBilling([{ month: "2026-11", operation: "text_search", before: 900, within: 300, listUsd: 300 * 0.035 }]);
    const [places, octobre, claude] = billJournal(
      [
        entry({ provider: "google_places", operation: "text_search", costUsd: 0.035 }),
        entry({ provider: "google_places", operation: "text_search", costUsd: 0.035, createdAt: new Date("2026-10-31T23:59:59Z") }),
        entry({}),
      ],
      billing,
    );
    expect(places?.listCostUsd).toBe(0.035);
    expect(places?.costUsd).toBeCloseTo((0.035 * 2) / 3, 9);
    expect(octobre?.costUsd).toBe(0.035);
    expect(claude).toMatchObject({ costUsd: 0.2, listCostUsd: 0.2 });
  });

  it("borne la page servie au nombre de pages", () => {
    expect(journalPaging(0, 1)).toEqual({ page: 1, pageCount: 1 });
    expect(journalPaging(50, 1)).toEqual({ page: 1, pageCount: 1 });
    expect(journalPaging(51, 2)).toEqual({ page: 2, pageCount: 2 });
    expect(journalPaging(120, 99)).toEqual({ page: 3, pageCount: 3 });
    expect(journalPaging(120, 0)).toEqual({ page: 1, pageCount: 3 });
  });
});

describe("buildApiUsageReport", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const period = resolveApiUsagePeriod("mois", now);
  const base: ApiUsageReportInput = {
    period,
    now,
    filters: NO_USAGE_FILTERS,
    cube: [
      cube({ calls: 10, costUsd: 2, siteId: SITE_A }),
      cube({ calls: 1, status: "error", siteId: SITE_A }),
      cube({ provider: "google_places", operation: "text_search", feature: "prospecting", siteId: null, model: null, calls: 1200, costUsd: 1200 * 0.035 }),
      cube({ provider: "resend", operation: "email", feature: "notifications", siteId: null, model: null, costSource: "free", calls: 5 }),
    ],
    series: [
      { bucket: "2026-11-02", provider: "anthropic", operation: "messages", status: "ok", calls: 10, costUsd: 2 },
      { bucket: "2026-11-02", provider: "anthropic", operation: "messages", status: "error", calls: 1, costUsd: 0 },
      { bucket: "2026-11-05", provider: "google_places", operation: "text_search", status: "ok", calls: 1200, costUsd: 1200 * 0.035 },
      { bucket: "2026-11-06", provider: "resend", operation: "email", status: "ok", calls: 5, costUsd: 0 },
    ],
    placesRows: [{ month: "2026-11", operation: "text_search", before: 0, within: 1200, listUsd: 1200 * 0.035 }],
    previousSeries: [
      { bucket: "2026-10-03", provider: "anthropic", operation: "messages", status: "ok", calls: 5, costUsd: 1 },
      { bucket: "2026-10-04", provider: "google_places", operation: "text_search", status: "ok", calls: 400, costUsd: 14 },
    ],
    previousPlacesRows: [{ month: "2026-10", operation: "text_search", before: 0, within: 400, listUsd: 14 }],
    monthSeries: [
      { bucket: "2026-11-02", provider: "anthropic", operation: "messages", status: "ok", calls: 10, costUsd: 2 },
      { bucket: "2026-11-05", provider: "google_places", operation: "text_search", status: "ok", calls: 1200, costUsd: 1200 * 0.035 },
    ],
    monthPlacesRows: [{ month: "2026-11", operation: "text_search", before: 0, within: 1200, listUsd: 1200 * 0.035 }],
    providerErrors: [{ provider: "anthropic", operation: "messages", error: "529", createdAt: new Date("2026-11-02T10:00:00Z") }],
    recentErrors: [],
    journal: null,
    sites: [{ id: SITE_A, name: "Cabinet A", type: "client", status: "ready", plan: "scale", subscription: { plan: "scale", billingPeriod: "annual", status: "active" } }],
    scrapeCreatorsCredits: { credits: "150", at: now },
    metaLastCall: null,
    metaLastSuccessAt: null,
    firstMeasuredAt: new Date("2026-11-01T08:00:00Z"),
    firstRowAt: new Date("2026-09-01T08:00:00Z"),
  };

  it("fait concorder tous les totaux, franchise Google Places déduite", () => {
    const report = buildApiUsageReport(base);
    // 1 200 recherches ce mois-ci : 200 facturées
    const expected = 2 + 200 * 0.035;
    expect(report.totals.costUsd).toBeCloseTo(expected, 6);
    expect(report.totals.listCostUsd).toBeCloseTo(2 + 1200 * 0.035, 6);
    const sum = (items: { costUsd: number }[]) => items.reduce((total, item) => total + item.costUsd, 0);
    expect(sum(report.providers)).toBeCloseTo(expected, 6);
    expect(sum(report.features)).toBeCloseTo(expected, 6);
    expect(sum(report.sites)).toBeCloseTo(expected, 6);
    expect(report.daily.totalUsd).toBeCloseTo(expected, 6);
    expect(report.monthCostUsd).toBeCloseTo(expected, 6);
    expect(report.totals).toMatchObject({ calls: 1216, errors: 1 });
  });

  it("compare à la période précédente, elle aussi sous franchise", () => {
    const report = buildApiUsageReport(base);
    // Octobre : 400 recherches, toutes gratuites → seul Anthropic compte
    expect(report.previous).toEqual({ calls: 405, errors: 0, costUsd: 1 });
    expect(report.costDelta).toBeCloseTo(8, 6);
    expect(report.callsDelta).toBeCloseTo(1216 / 405 - 1, 6);
  });

  it("expose la franchise du mois, les soldes, les options de filtre et la granularité", () => {
    const report = buildApiUsageReport(base);
    expect(report.granularity).toBe("day");
    expect(report.placesFreeTier.find((line) => line.operation === "text_search")).toMatchObject({ used: 1200, billedCalls: 200 });
    expect(report.balances.scrapeCreators).toMatchObject({ credits: 150, low: true });
    expect(report.balances.metaToken.status).toBe("unknown");
    expect(report.options.providers.map((p) => p.id)).toEqual([...API_PROVIDER_IDS]);
    expect(report.options.sites).toEqual([{ id: SITE_A, name: "Cabinet A" }]);
    expect(report.options.hasPlatformCalls).toBe(true);
    expect(report.journal).toBeNull();
    expect(report.firstMeasuredAt).toEqual(base.firstMeasuredAt);
    expect(buildApiUsageReport({ ...base, period: resolveApiUsagePeriod("aujourdhui", now) }).granularity).toBe("hour");
  });

  it("applique les filtres à la sélection, sans toucher à la franchise ni aux options", () => {
    const filters = { ...NO_USAGE_FILTERS, provider: "google_places" };
    const report = buildApiUsageReport({ ...base, filters, series: base.series.filter((row) => row.provider === "google_places"), journal: { rows: [], page: 7 } });
    expect(report.totals.calls).toBe(1200);
    expect(report.totals.costUsd).toBeCloseTo(200 * 0.035, 6);
    expect(report.providers.map((p) => p.id)).toEqual(["google_places"]);
    expect(report.features.map((f) => f.id)).toEqual(["prospecting"]);
    expect(report.sites.map((s) => s.siteId)).toEqual([null]);
    expect(report.options.providers).toHaveLength(API_PROVIDER_IDS.length);
    expect(report.journal).toMatchObject({ page: 7, pageCount: 24, total: 1200, pageSize: 50 });
    expect(buildApiUsageReport({ ...base, filters, journal: { rows: [], page: 99 } }).journal?.page).toBe(24);
  });

  it("registre vide : tout est à zéro, tous les fournisseurs restent listés", () => {
    const report = buildApiUsageReport({
      ...base,
      cube: [],
      series: [],
      placesRows: [],
      previousSeries: [],
      previousPlacesRows: [],
      monthSeries: [],
      monthPlacesRows: [],
      providerErrors: [],
      sites: [],
      scrapeCreatorsCredits: null,
      firstMeasuredAt: null,
      firstRowAt: null,
      journal: { rows: [], page: 1 },
    });
    expect(report.totals).toMatchObject({ calls: 0, costUsd: 0, errorRate: 0 });
    expect(report.costDelta).toBeNull();
    expect(report.providers).toHaveLength(API_PROVIDER_IDS.length);
    expect(report.providers.every((p) => p.calls === 0)).toBe(true);
    expect(report.features).toEqual([]);
    expect(report.sites).toEqual([]);
    expect(report.daily.series).toEqual([]);
    expect(report.daily.buckets).toHaveLength(11);
    expect(report.placesFreeTier.map((line) => line.used)).toEqual([0, 0, 0]);
    expect(report.balances.scrapeCreators).toBeNull();
    expect(report.journal).toMatchObject({ entries: [], page: 1, pageCount: 1, total: 0 });
  });
});
