import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_CACHE_READ_FACTOR,
  ANTHROPIC_CACHE_WRITE_FACTOR,
  ANTHROPIC_FALLBACK_PRICE_MODEL,
  ANTHROPIC_PRICES_USD_PER_MTOK,
  API_FEATURE_IDS,
  API_FEATURE_LABELS,
  API_PROVIDERS,
  API_PROVIDER_IDS,
  API_USAGE_ERROR_MAX,
  API_USAGE_PERIOD_IDS,
  API_USAGE_PERIOD_LABELS,
  FAL_FALLBACK_PRICE_MODEL,
  FAL_PRICES_USD,
  GOOGLE_PLACES_OPERATIONS,
  SCRAPECREATORS_CREDIT_USD,
  anthropicCostUsd,
  anthropicPrice,
  apiFeatureLabel,
  eurToUsd,
  falCostUsd,
  googlePlacesBilledUsd,
  isApiFeatureId,
  isApiProviderId,
  isGooglePlacesOperation,
  resolveApiUsagePeriod,
  roundUsd,
  type ApiUsagePeriod,
  type ApiUsagePeriodId,
  type GooglePlacesOperation,
} from "./api-usage";
import { USD_TO_EUR_RATE } from "./google-ads";

const DAY_MS = 86_400_000;

/** Nombre au format des phrases de facturation (« 0,035 »). */
const fr = (value: number): string => String(value).replace(".", ",");

/** Propriétés héritées de Object.prototype : aucune n'est un identifiant du registre. */
const PROTOTYPE_KEYS = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"] as const;

// ─── Fournisseurs ────────────────────────────────────────────────────────────

describe("API_PROVIDERS", () => {
  it("chaque identifiant a sa fiche, et aucune fiche n'est orpheline", () => {
    expect(Object.keys(API_PROVIDERS).sort()).toEqual([...API_PROVIDER_IDS].sort());
    expect(new Set(API_PROVIDER_IDS).size).toBe(API_PROVIDER_IDS.length);
    for (const id of API_PROVIDER_IDS) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    // Les onze fournisseurs instrumentés, plus la lecture des sites des clients
    expect([...API_PROVIDER_IDS].sort()).toEqual(["anthropic", "client_site", "dataforseo", "fal", "geo_api", "google_places", "meta_ad_library", "ovh", "pexels", "resend", "scrapecreators", "vercel"]);
  });

  it("libellé, rôle, unité et mode de facturation renseignés ; libellés distincts", () => {
    for (const id of API_PROVIDER_IDS) {
      const info = API_PROVIDERS[id];
      for (const text of [info.label, info.role, info.unit, info.pricing]) {
        expect(text.trim()).not.toBe("");
        expect(text).toBe(text.trim());
      }
      expect(typeof info.free).toBe("boolean");
      // Une phrase : elle se termine par un point
      expect(info.pricing.endsWith(".")).toBe(true);
    }
    const labels = API_PROVIDER_IDS.map((id) => API_PROVIDERS[id].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("fournisseurs gratuits : la phrase de facturation le dit d'emblée (« Gratuit », « Compris dans l'abonnement ») ; les payants annoncent un mode de prix", () => {
    const saysFree = (pricing: string) => /^(Gratuit|Compris dans l'abonnement)/.test(pricing);
    for (const id of API_PROVIDER_IDS) expect([id, saysFree(API_PROVIDERS[id].pricing)]).toEqual([id, API_PROVIDERS[id].free]);
    expect(API_PROVIDER_IDS.filter((id) => API_PROVIDERS[id].free).sort()).toEqual(["client_site", "geo_api", "meta_ad_library", "pexels", "resend", "vercel"]);
  });

  it("les prix cités dans les phrases sont ceux du barème (fal.ai, Google Places, ScrapeCreators)", () => {
    expect(API_PROVIDERS.fal.pricing).toContain(`${fr(FAL_PRICES_USD["fal-ai/flux/schnell"]!.perMegapixel!)} $ par mégapixel`);
    expect(API_PROVIDERS.fal.pricing).toContain(`${fr(FAL_PRICES_USD["fal-ai/flux-pro/v1.1-ultra"]!.perImage!)} $ par image`);
    const places = API_PROVIDERS.google_places.pricing;
    expect(places).toContain(`recherche ${fr(GOOGLE_PLACES_OPERATIONS.text_search.unitUsd)} $`);
    expect(places).toContain(`fiche ${fr(GOOGLE_PLACES_OPERATIONS.place_details.unitUsd)} $`);
    expect(places).toContain(`photo ${fr(GOOGLE_PLACES_OPERATIONS.place_photo.unitUsd)} $`);
    expect(places).toContain("1 000 appels gratuits par mois");
    for (const operation of Object.values(GOOGLE_PLACES_OPERATIONS)) expect(operation.freePerMonth).toBe(1000);
    expect(API_PROVIDERS.scrapecreators.pricing).toContain("47 $ les 25 000 crédits");
    expect(API_PROVIDERS.scrapecreators.pricing).toContain(`≈ ${fr(Math.round(SCRAPECREATORS_CREDIT_USD * 10_000) / 10_000)} $`);
  });
});

describe("isApiProviderId", () => {
  it("vrai pour chaque identifiant, faux pour tout le reste (casse, espaces, autres types, propriétés héritées)", () => {
    for (const id of API_PROVIDER_IDS) expect(isApiProviderId(id)).toBe(true);
    for (const value of ["", "Anthropic", " anthropic", "anthropic ", "openai", "google", null, undefined, 42, {}, ["anthropic"], ...PROTOTYPE_KEYS]) expect(isApiProviderId(value)).toBe(false);
  });
});

// ─── Fonctionnalités ─────────────────────────────────────────────────────────

describe("API_FEATURE_LABELS", () => {
  it("chaque fonctionnalité a son libellé (non vide, distinct), et rien d'autre", () => {
    expect(Object.keys(API_FEATURE_LABELS).sort()).toEqual([...API_FEATURE_IDS].sort());
    expect(new Set(API_FEATURE_IDS).size).toBe(API_FEATURE_IDS.length);
    const labels = API_FEATURE_IDS.map((id) => API_FEATURE_LABELS[id]);
    for (const label of labels) expect(label.trim()).not.toBe("");
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of API_FEATURE_IDS) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe("apiFeatureLabel", () => {
  it("libellé de la fonctionnalité ; « Non attribué » sans valeur ou pour une valeur inconnue", () => {
    for (const id of API_FEATURE_IDS) expect(apiFeatureLabel(id)).toBe(API_FEATURE_LABELS[id]);
    expect(apiFeatureLabel("meta_ads")).toBe("Meta Ads");
    expect(apiFeatureLabel("notifications")).toBe("E-mails");
    for (const value of [null, undefined, "", "inconnue", "META_ADS", " blog", "blog "]) expect(apiFeatureLabel(value)).toBe("Non attribué");
  });

  it("une valeur qui porte le nom d'une propriété héritée (« constructor », « toString ») donne « Non attribué »", () => {
    for (const value of PROTOTYPE_KEYS) expect(apiFeatureLabel(value)).toBe("Non attribué");
  });
});

describe("isApiFeatureId", () => {
  it("vrai pour chaque identifiant, faux pour tout le reste", () => {
    for (const id of API_FEATURE_IDS) expect(isApiFeatureId(id)).toBe(true);
    for (const value of ["", "Blog", "meta-ads", "seo", null, undefined, 7, {}, ...PROTOTYPE_KEYS]) expect(isApiFeatureId(value)).toBe(false);
  });
});

// ─── Barème Anthropic ────────────────────────────────────────────────────────

describe("ANTHROPIC_PRICES_USD_PER_MTOK", () => {
  it("barème public au 3 novembre 2026 (dollars par million de tokens, entrée / sortie)", () => {
    expect(ANTHROPIC_PRICES_USD_PER_MTOK).toEqual({
      "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
      "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
      "claude-fable-5": { input: 10, output: 50 },
      "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
      "claude-opus-5": { input: 5, output: 25 },
      "claude-opus-4-8": { input: 5, output: 25 },
      "claude-opus-4-7": { input: 5, output: 25 },
      "claude-opus-4-6": { input: 5, output: 25 },
      "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
      "claude-sonnet-5": { input: 2, output: 10 },
      "claude-sonnet-4-6": { input: 3, output: 15 },
      "claude-haiku-5-5": { input: 0.1, output: 0.5, longPrompt: { above: 100_000, input: 0.5, output: 2.5 } },
      "claude-haiku-4-5": { input: 1, output: 5 },
    });
  });

  it("le modèle de repli est au barème ; écriture en cache 1,25 ×, lecture 0,1 ×", () => {
    expect(ANTHROPIC_PRICES_USD_PER_MTOK[ANTHROPIC_FALLBACK_PRICE_MODEL]).toEqual({ input: 5, output: 25 });
    expect(ANTHROPIC_CACHE_WRITE_FACTOR).toBe(1.25);
    expect(ANTHROPIC_CACHE_READ_FACTOR).toBe(0.1);
  });
});

describe("anthropicPrice", () => {
  it("identifiant exact : prix du barème, `known: true` (casse et espaces ignorés)", () => {
    for (const [model, price] of Object.entries(ANTHROPIC_PRICES_USD_PER_MTOK)) expect(anthropicPrice(model)).toEqual({ input: price.input, output: price.output, known: true });
    expect(anthropicPrice("claude-opus-5")).toEqual({ input: 5, output: 25, known: true });
    expect(anthropicPrice("  Claude-Haiku-5-5\n")).toEqual({ input: 0.1, output: 0.5, known: true });
  });

  it("identifiant daté : le plus long identifiant du barème dont il est le préfixe étendu", () => {
    // « claude-opus-5-5-… » est aussi préfixé par « claude-opus-5 » : c'est le plus long qui gagne
    expect(anthropicPrice("claude-opus-5-5-20260401")).toEqual({ input: 4, output: 20, known: true });
    expect(anthropicPrice("claude-opus-5-20260115")).toEqual({ input: 5, output: 25, known: true });
    expect(anthropicPrice("claude-fable-5-2-20261020")).toEqual({ input: 8, output: 40, known: true });
    expect(anthropicPrice("claude-fable-5-1-20260801")).toEqual({ input: 10, output: 50, known: true });
    expect(anthropicPrice("claude-haiku-4-5-20251001")).toEqual({ input: 1, output: 5, known: true });
    expect(anthropicPrice("CLAUDE-SONNET-4-6-LATEST")).toEqual({ input: 3, output: 15, known: true });
  });

  it("modèle inconnu : prix de repli, `known: false`", () => {
    const fallback = { ...ANTHROPIC_PRICES_USD_PER_MTOK[ANTHROPIC_FALLBACK_PRICE_MODEL]!, known: false };
    // Autre famille, génération absente, identifiant plus court qu'une entrée, collé sans tiret
    for (const model of ["gpt-5", "claude-opus-6", "claude-opus", "claude-opus-4", "claude-haiku-5", "claude-opus-55", "claude-opus-5x", "claude", "opus-5", "claude-mythos-5-2"]) {
      expect([model, anthropicPrice(model)]).toEqual([model, fallback]);
    }
  });

  it("null, undefined ou vide : prix de repli, `known: false`", () => {
    const fallback = { input: 5, output: 25, known: false };
    expect(anthropicPrice(null)).toEqual(fallback);
    expect(anthropicPrice(undefined)).toEqual(fallback);
    expect(anthropicPrice("")).toEqual(fallback);
    expect(anthropicPrice("   ")).toEqual(fallback);
  });

  it("rend une copie : la modifier ne touche pas au barème", () => {
    const price = anthropicPrice("claude-opus-5");
    price.input = 999;
    expect(ANTHROPIC_PRICES_USD_PER_MTOK["claude-opus-5"]).toEqual({ input: 5, output: 25 });
    expect(anthropicPrice("claude-opus-5").input).toBe(5);
  });

  // Seuls une date (« -20260401 ») ou « -latest » prolongent un identifiant connu : une version sortie après le
  // barème est chiffrée au prix de sa famille, mais signalée (`priceUnknown` dans l'admin).
  it("une version mineure absente du barème (« claude-opus-5-6 ») : prix de sa famille, signalé inconnu", () => {
    expect(anthropicPrice("claude-opus-5-6")).toEqual({ input: 5, output: 25, known: false });
    expect(anthropicPrice("claude-fable-5-3")).toEqual({ input: 10, output: 50, known: false });
    expect(anthropicPrice("claude-sonnet-5-6")).toEqual({ input: 2, output: 10, known: false });
    expect(anthropicPrice("claude-opus-5-5-preview")).toEqual({ input: 4, output: 20, known: false });
    expect(anthropicPrice("claude-opus-5-5-latest")).toEqual({ input: 4, output: 20, known: true });
  });

  it("un modèle nommé comme une propriété héritée (« constructor », « toString ») reçoit le prix de repli", () => {
    for (const model of PROTOTYPE_KEYS) expect([model, anthropicPrice(model)]).toEqual([model, { input: 5, output: 25, known: false }]);
  });
});

describe("anthropicCostUsd", () => {
  it("tokens d'entrée et de sortie au prix du modèle", () => {
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(30);
    // (12 345 × 5 + 6 789 × 25) / 1 000 000
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 12_345, outputTokens: 6_789 })).toBe(0.23145);
    expect(anthropicCostUsd("claude-fable-5-2", { inputTokens: 2_000, outputTokens: 500 })).toBe(0.036);
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 40_000, outputTokens: 8_000 })).toBe(0.008);
    expect(anthropicCostUsd("claude-opus-5-5-20260401", { inputTokens: 1_000, outputTokens: 1_000 })).toBe(0.024);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("cache : écriture à 1,25 × le prix d'entrée, lecture à 0,1 ×", () => {
    // Entrée équivalente : 1 000 + 2 000 × 1,25 + 10 000 × 0,1 = 4 500 tokens à 5 $ ; sortie 500 tokens à 25 $
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 1_000, outputTokens: 500, cacheWriteTokens: 2_000, cacheReadTokens: 10_000 })).toBe(0.035);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 })).toBe(6.25);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 })).toBe(0.5);
    expect(anthropicCostUsd("claude-sonnet-4-6", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 })).toBe(4.05);
  });

  it("valeurs négatives, NaN, infinies ou absentes : comptées pour 0", () => {
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: -5, outputTokens: Number.NaN })).toBe(0);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: Number.POSITIVE_INFINITY, outputTokens: 1_000_000 })).toBe(25);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: -1, cacheReadTokens: Number.NaN, cacheWriteTokens: -400 })).toBe(5);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: undefined, outputTokens: null } as unknown as { inputTokens: number; outputTokens: number })).toBe(0);
  });

  it("modèle inconnu, null ou absent : calculé au prix de repli", () => {
    const usage = { inputTokens: 3_000, outputTokens: 1_200, cacheReadTokens: 500 };
    const atFallback = anthropicCostUsd(ANTHROPIC_FALLBACK_PRICE_MODEL, usage);
    expect(atFallback).toBe(0.04525);
    expect(anthropicCostUsd("modele-inconnu", usage)).toBe(atFallback);
    expect(anthropicCostUsd(null, usage)).toBe(atFallback);
    expect(anthropicCostUsd(undefined, usage)).toBe(atFallback);
  });

  it("arrondi au millionième de dollar : un appel minuscule peut valoir 0", () => {
    // 4 tokens d'entrée à 0,1 $ le million : 0,0000004 $
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 4, outputTokens: 0 })).toBe(0);
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 16, outputTokens: 0 })).toBe(0.000002);
    expect(anthropicCostUsd("claude-opus-5", { inputTokens: 1, outputTokens: 1 })).toBe(0.00003);
  });

  // Barème public : la lecture du cache vaut 0,20 $ par million de tokens sur Fable 5.2 (entrée à 8 $) et Opus 5.5
  // (entrée à 4 $), 0,25 $ sur Fable 5.1, 0,10 $ sur Sonnet 5.5 — et 0,1 × le prix d'entrée ailleurs.
  it("lecture du cache : prix propre à Fable 5.2, Fable 5.1, Opus 5.5 et Sonnet 5.5 ; 0,1 × l'entrée ailleurs", () => {
    const read = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 };
    expect(anthropicCostUsd("claude-fable-5-2", read)).toBe(0.2);
    expect(anthropicCostUsd("claude-fable-5-1", read)).toBe(0.25);
    expect(anthropicCostUsd("claude-opus-5-5", read)).toBe(0.2);
    expect(anthropicCostUsd("claude-opus-5-5-20260401", read)).toBe(0.2);
    expect(anthropicCostUsd("claude-sonnet-5-5", read)).toBe(0.1);
    expect(anthropicCostUsd("claude-fable-5", read)).toBe(1);
    expect(anthropicCostUsd("claude-opus-5", read)).toBe(0.5);
  });

  // Barème public : au-delà de 100 000 tokens de prompt, Haiku 5.5 passe à 0,50 $ / 2,50 $ le million.
  it("Haiku 5.5 au-delà de 100 000 tokens de prompt : palier supérieur (0,50 $ / 2,50 $), cache compris dans le prompt", () => {
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 200_000, outputTokens: 10_000 })).toBe(0.125);
    // Pile 100 000 tokens : encore le premier palier
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 100_000, outputTokens: 10_000 })).toBe(0.015);
    // 60 000 hors cache + 60 000 lus dans le cache : le prompt dépasse le seuil
    expect(anthropicCostUsd("claude-haiku-5-5", { inputTokens: 60_000, outputTokens: 0, cacheReadTokens: 60_000 })).toBe(0.033);
  });
});

describe("roundUsd", () => {
  it("arrondi au millionième ; 0 pour une valeur négative, nulle, NaN ou infinie", () => {
    expect(roundUsd(0.1234567)).toBe(0.123457);
    expect(roundUsd(1.0000004)).toBe(1);
    expect(roundUsd(12.5)).toBe(12.5);
    expect(roundUsd(0.0000004)).toBe(0);
    expect(roundUsd(0.0000006)).toBe(0.000001);
    expect(roundUsd(0)).toBe(0);
    expect(roundUsd(-0.5)).toBe(0);
    expect(roundUsd(Number.NaN)).toBe(0);
    expect(roundUsd(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundUsd(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("eurToUsd", () => {
  it("même taux que l'affichage (USD_TO_EUR_RATE), dans l'autre sens", () => {
    expect(eurToUsd(USD_TO_EUR_RATE)).toBeCloseTo(1, 12);
    expect(eurToUsd(9.2)).toBeCloseTo(10, 9);
    expect(eurToUsd(6.99) * USD_TO_EUR_RATE).toBeCloseTo(6.99, 9);
    expect(eurToUsd(6.99)).toBeGreaterThan(6.99);
    expect(eurToUsd(0)).toBe(0);
  });
});

// ─── fal.ai ──────────────────────────────────────────────────────────────────

describe("falCostUsd", () => {
  it("FLUX.1 schnell : au mégapixel, arrondi au mégapixel supérieur", () => {
    // 1024 × 768 = 0,79 MP → 1 MP
    expect(falCostUsd("fal-ai/flux/schnell", 1024, 768)).toBe(0.003);
    // Exactement 1 MP, puis un pixel de plus
    expect(falCostUsd("fal-ai/flux/schnell", 1000, 1000)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/schnell", 1001, 1000)).toBe(0.006);
    // 1920 × 1080 = 2,07 MP → 3 MP ; 2048 × 2048 = 4,19 MP → 5 MP
    expect(falCostUsd("fal-ai/flux/schnell", 1920, 1080)).toBe(0.009);
    expect(falCostUsd("fal-ai/flux/schnell", 2048, 2048)).toBe(0.015);
  });

  it("au moins 1 MP, même pour une vignette ou des dimensions invalides", () => {
    expect(falCostUsd("fal-ai/flux/schnell", 64, 64)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/schnell", 0, 0)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/schnell", Number.NaN, 768)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/schnell", -1024, 768)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/schnell", Number.POSITIVE_INFINITY, 768)).toBe(0.003);
  });

  it("FLUX 1.1 pro ultra : forfait à l'image, quelles que soient les dimensions", () => {
    expect(falCostUsd("fal-ai/flux-pro/v1.1-ultra", 1024, 768)).toBe(0.06);
    expect(falCostUsd("fal-ai/flux-pro/v1.1-ultra", 4096, 4096)).toBe(0.06);
    expect(falCostUsd("fal-ai/flux-pro/v1.1-ultra", 0, 0)).toBe(0.06);
  });

  it("modèle absent du barème : prix du modèle par défaut (au mégapixel)", () => {
    expect(FAL_PRICES_USD[FAL_FALLBACK_PRICE_MODEL]).toEqual({ perMegapixel: 0.003 });
    expect(falCostUsd("fal-ai/flux/dev", 1024, 768)).toBe(0.003);
    expect(falCostUsd("fal-ai/flux/dev", 1920, 1080)).toBe(falCostUsd(FAL_FALLBACK_PRICE_MODEL, 1920, 1080));
    expect(falCostUsd("", 1024, 768)).toBe(0.003);
  });

  it("barème : un prix au mégapixel ou un prix à l'image par modèle, strictement positif", () => {
    for (const price of Object.values(FAL_PRICES_USD)) {
      const values = [price.perMegapixel, price.perImage].filter((value): value is number => value !== undefined);
      expect(values).toHaveLength(1);
      expect(values[0]!).toBeGreaterThan(0);
    }
  });
});

// ─── Google Places ───────────────────────────────────────────────────────────

describe("GOOGLE_PLACES_OPERATIONS", () => {
  it("trois types d'appel : libellé, prix unitaire et franchise mensuelle", () => {
    expect(Object.keys(GOOGLE_PLACES_OPERATIONS).sort()).toEqual(["place_details", "place_photo", "text_search"]);
    expect(GOOGLE_PLACES_OPERATIONS.text_search).toEqual({ label: "Recherche d'établissement", unitUsd: 0.035, freePerMonth: 1000 });
    expect(GOOGLE_PLACES_OPERATIONS.place_details).toEqual({ label: "Fiche détaillée", unitUsd: 0.025, freePerMonth: 1000 });
    expect(GOOGLE_PLACES_OPERATIONS.place_photo).toEqual({ label: "Photo", unitUsd: 0.007, freePerMonth: 1000 });
  });
});

describe("isGooglePlacesOperation", () => {
  it("vrai pour les trois opérations, faux pour une autre valeur", () => {
    for (const operation of Object.keys(GOOGLE_PLACES_OPERATIONS)) expect(isGooglePlacesOperation(operation)).toBe(true);
    for (const value of ["", "search", "TEXT_SEARCH", "text_search ", "places:searchText", "ads_archive"]) expect(isGooglePlacesOperation(value)).toBe(false);
  });

  it("« toString » ou « constructor » ne sont pas des opérations Google Places", () => {
    for (const value of PROTOTYPE_KEYS) expect(isGooglePlacesOperation(value)).toBe(false);
  });
});

describe("googlePlacesBilledUsd", () => {
  const operations = Object.keys(GOOGLE_PLACES_OPERATIONS) as GooglePlacesOperation[];

  it("aucun appel : 0", () => {
    for (const operation of operations) {
      expect(googlePlacesBilledUsd(operation, 0, 0)).toBe(0);
      expect(googlePlacesBilledUsd(operation, 400, 0)).toBe(0);
      expect(googlePlacesBilledUsd(operation, 5_000, 0)).toBe(0);
    }
  });

  it("tout sous la franchise : gratuit, jusqu'au millième appel du mois compris", () => {
    expect(googlePlacesBilledUsd("text_search", 0, 1)).toBe(0);
    expect(googlePlacesBilledUsd("text_search", 0, 1_000)).toBe(0);
    expect(googlePlacesBilledUsd("place_details", 600, 400)).toBe(0);
    expect(googlePlacesBilledUsd("place_photo", 999, 1)).toBe(0);
  });

  it("à cheval sur la franchise : seuls les appels au-delà du millième sont facturés", () => {
    expect(googlePlacesBilledUsd("text_search", 0, 1_001)).toBe(0.035);
    // 900 déjà faits, 200 dans la période : 100 gratuits, 100 facturés
    expect(googlePlacesBilledUsd("text_search", 900, 200)).toBe(3.5);
    expect(googlePlacesBilledUsd("place_details", 999, 2)).toBe(0.025);
    expect(googlePlacesBilledUsd("place_photo", 990, 13)).toBe(0.021);
  });

  it("franchise déjà consommée avant la période : chaque appel au prix unitaire", () => {
    expect(googlePlacesBilledUsd("text_search", 1_000, 10)).toBe(0.35);
    expect(googlePlacesBilledUsd("text_search", 5_000, 10)).toBe(0.35);
    expect(googlePlacesBilledUsd("place_details", 1_000, 1)).toBe(0.025);
    expect(googlePlacesBilledUsd("place_photo", 2_500, 1_000)).toBe(7);
  });

  it("la franchise est propre à chaque type d'appel", () => {
    const perType = operations.map((operation) => googlePlacesBilledUsd(operation, 0, 1_100));
    expect(perType).toEqual(operations.map((operation) => roundUsd(100 * GOOGLE_PLACES_OPERATIONS[operation].unitUsd)));
  });

  it("découper un mois en périodes ne change pas le total facturé", () => {
    for (const operation of operations) {
      for (const [first, second] of [[0, 2_500], [300, 300], [300, 1_200], [1_000, 1], [999, 1], [1_700, 800]] as const) {
        const whole = googlePlacesBilledUsd(operation, 0, first + second);
        const split = googlePlacesBilledUsd(operation, 0, first) + googlePlacesBilledUsd(operation, first, second);
        expect(split).toBeCloseTo(whole, 6);
      }
    }
  });

  it("valeurs négatives, NaN, infinies ou fractionnaires : jamais de montant négatif, fractions tronquées", () => {
    expect(googlePlacesBilledUsd("text_search", -500, 1_010)).toBe(0.35);
    expect(googlePlacesBilledUsd("text_search", 1_000, -10)).toBe(0);
    expect(googlePlacesBilledUsd("text_search", Number.NaN, 1_002)).toBe(0.07);
    expect(googlePlacesBilledUsd("text_search", 1_000, Number.NaN)).toBe(0);
    expect(googlePlacesBilledUsd("text_search", Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(googlePlacesBilledUsd("text_search", 1_000, Number.POSITIVE_INFINITY)).toBe(0);
    expect(googlePlacesBilledUsd("text_search", 1_000.9, 2.9)).toBe(0.07);
    for (const before of [-1, 0, 999.5, 1_000, 12_345]) for (const within of [-3, 0, 0.4, 7]) expect(googlePlacesBilledUsd("place_photo", before, within)).toBeGreaterThanOrEqual(0);
  });
});

describe("SCRAPECREATORS_CREDIT_USD / API_USAGE_ERROR_MAX", () => {
  it("47 $ les 25 000 crédits ; message d'erreur borné à 300 caractères", () => {
    expect(SCRAPECREATORS_CREDIT_USD).toBe(0.00188);
    expect(SCRAPECREATORS_CREDIT_USD * 25_000).toBeCloseTo(47, 9);
    expect(API_USAGE_ERROR_MAX).toBe(300);
  });
});

// ─── Périodes ────────────────────────────────────────────────────────────────

const at = (iso: string): Date => new Date(iso);

/** Bornes d'une période en ISO 8601 (comparaison lisible). */
function bounds(period: ApiUsagePeriod) {
  return { from: period.from.toISOString(), to: period.to.toISOString(), previousFrom: period.previousFrom.toISOString(), previousTo: period.previousTo.toISOString() };
}

describe("API_USAGE_PERIOD_LABELS", () => {
  it("chaque période a son libellé (non vide, distinct), et rien d'autre", () => {
    expect(Object.keys(API_USAGE_PERIOD_LABELS).sort()).toEqual([...API_USAGE_PERIOD_IDS].sort());
    expect([...API_USAGE_PERIOD_IDS]).toEqual(["mois", "mois-precedent", "30j", "7j", "aujourdhui"]);
    const labels = API_USAGE_PERIOD_IDS.map((id) => API_USAGE_PERIOD_LABELS[id]);
    for (const label of labels) expect(label.trim()).not.toBe("");
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("resolveApiUsagePeriod", () => {
  const NOW = at("2026-11-11T14:32:05.123Z");

  it("« mois » : du 1er du mois (UTC) à maintenant ; comparaison : le mois d'avant jusqu'au même avancement", () => {
    const period = resolveApiUsagePeriod("mois", NOW);
    expect(period.id).toBe("mois");
    expect(period.label).toBe("Ce mois-ci");
    expect(bounds(period)).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-11T14:32:05.123Z", previousFrom: "2026-10-01T00:00:00.000Z", previousTo: "2026-10-11T14:32:05.123Z" });
  });

  it("« mois-precedent » : le mois civil d'avant, entier ; comparaison : le mois civil encore avant", () => {
    const period = resolveApiUsagePeriod("mois-precedent", NOW);
    expect(period.id).toBe("mois-precedent");
    expect(period.label).toBe("Mois dernier");
    expect(bounds(period)).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", previousFrom: "2026-09-01T00:00:00.000Z", previousTo: "2026-10-01T00:00:00.000Z" });
  });

  it("« 30j » et « 7j » : fenêtre glissante jusqu'à maintenant ; comparaison : la fenêtre d'avant, de même durée", () => {
    const month = resolveApiUsagePeriod("30j", NOW);
    expect(month.label).toBe("30 derniers jours");
    expect(bounds(month)).toEqual({ from: "2026-10-12T14:32:05.123Z", to: "2026-11-11T14:32:05.123Z", previousFrom: "2026-09-12T14:32:05.123Z", previousTo: "2026-10-12T14:32:05.123Z" });
    const week = resolveApiUsagePeriod("7j", NOW);
    expect(week.label).toBe("7 derniers jours");
    expect(bounds(week)).toEqual({ from: "2026-11-04T14:32:05.123Z", to: "2026-11-11T14:32:05.123Z", previousFrom: "2026-10-28T14:32:05.123Z", previousTo: "2026-11-04T14:32:05.123Z" });
  });

  it("« aujourdhui » : depuis minuit UTC ; comparaison : la veille jusqu'à la même heure", () => {
    const period = resolveApiUsagePeriod("aujourdhui", NOW);
    expect(period.label).toBe("Aujourd'hui");
    expect(bounds(period)).toEqual({ from: "2026-11-11T00:00:00.000Z", to: "2026-11-11T14:32:05.123Z", previousFrom: "2026-11-10T00:00:00.000Z", previousTo: "2026-11-10T14:32:05.123Z" });
  });

  it("valeur inconnue, vide, null ou absente : « ce mois-ci »", () => {
    const expected = bounds(resolveApiUsagePeriod("mois", NOW));
    for (const value of ["", null, undefined, "annee", "MOIS", " mois", "7J", "30", "hier", "constructor"]) {
      const period = resolveApiUsagePeriod(value, NOW);
      expect(period.id).toBe("mois");
      expect(period.label).toBe("Ce mois-ci");
      expect(bounds(period)).toEqual(expected);
    }
  });

  it("sans `now` : l'instant de l'appel", () => {
    const before = Date.now();
    const period = resolveApiUsagePeriod("7j");
    const after = Date.now();
    expect(period.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(period.to.getTime()).toBeLessThanOrEqual(after);
    expect(period.to.getTime() - period.from.getTime()).toBe(7 * DAY_MS);
  });

  it("1er du mois à 00:00 UTC : le mois commence à l'instant (période vide), la comparaison aussi", () => {
    const start = at("2026-11-01T00:00:00.000Z");
    expect(bounds(resolveApiUsagePeriod("mois", start))).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", previousFrom: "2026-10-01T00:00:00.000Z", previousTo: "2026-10-01T00:00:00.000Z" });
    // Le mois précédent, lui, est entier
    expect(bounds(resolveApiUsagePeriod("mois-precedent", start))).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", previousFrom: "2026-09-01T00:00:00.000Z", previousTo: "2026-10-01T00:00:00.000Z" });
    expect(bounds(resolveApiUsagePeriod("aujourdhui", start))).toEqual({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", previousFrom: "2026-10-31T00:00:00.000Z", previousTo: "2026-10-31T00:00:00.000Z" });
    // Une milliseconde plus tôt : encore octobre
    expect(bounds(resolveApiUsagePeriod("mois", at("2026-10-31T23:59:59.999Z")))).toMatchObject({ from: "2026-10-01T00:00:00.000Z", previousFrom: "2026-09-01T00:00:00.000Z" });
  });

  it("dernier jour d'un mois plus long que le précédent : la comparaison s'arrête à la fin du mois d'avant", () => {
    // Le 31 mars, février (28 jours) est fini depuis longtemps
    expect(bounds(resolveApiUsagePeriod("mois", at("2026-03-31T23:59:59.999Z")))).toEqual({ from: "2026-03-01T00:00:00.000Z", to: "2026-03-31T23:59:59.999Z", previousFrom: "2026-02-01T00:00:00.000Z", previousTo: "2026-03-01T00:00:00.000Z" });
    // Le 31 mai contre avril (30 jours)
    expect(bounds(resolveApiUsagePeriod("mois", at("2026-05-31T08:00:00.000Z")))).toMatchObject({ previousFrom: "2026-04-01T00:00:00.000Z", previousTo: "2026-05-01T00:00:00.000Z" });
    // Année bissextile : le 29 mars 2028 à midi correspond au 29 février à midi, le 30 mars déborde
    expect(bounds(resolveApiUsagePeriod("mois", at("2028-03-29T12:00:00.000Z")))).toMatchObject({ previousFrom: "2028-02-01T00:00:00.000Z", previousTo: "2028-02-29T12:00:00.000Z" });
    expect(bounds(resolveApiUsagePeriod("mois", at("2028-03-30T12:00:00.000Z")))).toMatchObject({ previousFrom: "2028-02-01T00:00:00.000Z", previousTo: "2028-03-01T00:00:00.000Z" });
  });

  it("janvier : le mois d'avant est décembre de l'année précédente", () => {
    const january = at("2027-01-15T08:00:00.000Z");
    expect(bounds(resolveApiUsagePeriod("mois", january))).toEqual({ from: "2027-01-01T00:00:00.000Z", to: "2027-01-15T08:00:00.000Z", previousFrom: "2026-12-01T00:00:00.000Z", previousTo: "2026-12-15T08:00:00.000Z" });
    expect(bounds(resolveApiUsagePeriod("mois-precedent", january))).toEqual({ from: "2026-12-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z", previousFrom: "2026-11-01T00:00:00.000Z", previousTo: "2026-12-01T00:00:00.000Z" });
    // En février, la comparaison du mois précédent remonte à décembre de l'année d'avant
    expect(bounds(resolveApiUsagePeriod("mois-precedent", at("2027-02-10T00:00:00.000Z")))).toEqual({ from: "2027-01-01T00:00:00.000Z", to: "2027-02-01T00:00:00.000Z", previousFrom: "2026-12-01T00:00:00.000Z", previousTo: "2027-01-01T00:00:00.000Z" });
    // Le 1er janvier à 00:00 UTC
    expect(bounds(resolveApiUsagePeriod("mois", at("2027-01-01T00:00:00.000Z")))).toEqual({ from: "2027-01-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z", previousFrom: "2026-12-01T00:00:00.000Z", previousTo: "2026-12-01T00:00:00.000Z" });
  });

  it("découpage en temps universel : le 30 novembre à 23:30 UTC (déjà le 1er décembre à Paris) reste en novembre", () => {
    const late = at("2026-11-30T23:30:00.000Z");
    expect(bounds(resolveApiUsagePeriod("mois", late))).toMatchObject({ from: "2026-11-01T00:00:00.000Z", previousFrom: "2026-10-01T00:00:00.000Z", previousTo: "2026-10-30T23:30:00.000Z" });
    expect(bounds(resolveApiUsagePeriod("aujourdhui", late))).toMatchObject({ from: "2026-11-30T00:00:00.000Z", previousFrom: "2026-11-29T00:00:00.000Z" });
    // Un instant donné avec un décalage horaire : même découpage
    expect(bounds(resolveApiUsagePeriod("aujourdhui", at("2026-12-01T00:30:00.000+01:00")))).toMatchObject({ from: "2026-11-30T00:00:00.000Z" });
  });

  describe("invariants, pour chaque période et de nombreux instants", () => {
    const instants = [
      "2026-01-01T00:00:00.000Z",
      "2026-01-31T23:59:59.999Z",
      "2026-02-28T12:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T18:45:00.000Z",
      "2026-07-15T03:20:10.500Z",
      "2026-10-31T23:59:59.999Z",
      "2026-11-11T14:32:05.123Z",
      "2026-12-31T23:59:59.999Z",
      "2028-02-29T00:00:00.001Z",
      "2028-03-31T12:00:00.000Z",
    ].map(at);
    const startOfUtcMonth = (date: Date) => date.getUTCDate() === 1 && date.getTime() % DAY_MS === 0;

    it("ordre des bornes : la période précédente ne chevauche jamais la période", () => {
      for (const id of API_USAGE_PERIOD_IDS) {
        for (const now of instants) {
          const period = resolveApiUsagePeriod(id, now);
          expect(period.id).toBe(id);
          expect(period.label).toBe(API_USAGE_PERIOD_LABELS[id]);
          expect(period.previousFrom.getTime()).toBeLessThanOrEqual(period.previousTo.getTime());
          expect(period.previousTo.getTime()).toBeLessThanOrEqual(period.from.getTime());
          expect(period.from.getTime()).toBeLessThanOrEqual(period.to.getTime());
          expect(period.to.getTime()).toBeLessThanOrEqual(now.getTime());
        }
      }
    });

    it("la période se termine à l'instant donné, sauf le mois précédent (mois civil clos)", () => {
      for (const id of API_USAGE_PERIOD_IDS) {
        for (const now of instants) {
          const period = resolveApiUsagePeriod(id, now);
          if (id === "mois-precedent") expect(startOfUtcMonth(period.to)).toBe(true);
          else expect(period.to.getTime()).toBe(now.getTime());
        }
      }
    });

    it("durée de la période précédente : la même pour une fenêtre glissante ou « aujourdhui » ; pour le mois en cours, la même sans dépasser le mois d'avant ; pour le mois précédent, le mois civil d'avant", () => {
      const length = (from: Date, to: Date) => to.getTime() - from.getTime();
      for (const now of instants) {
        for (const id of ["30j", "7j", "aujourdhui"] satisfies ApiUsagePeriodId[]) {
          const period = resolveApiUsagePeriod(id, now);
          expect(length(period.previousFrom, period.previousTo)).toBe(length(period.from, period.to));
        }
        expect(length(resolveApiUsagePeriod("30j", now).from, now)).toBe(30 * DAY_MS);
        expect(length(resolveApiUsagePeriod("7j", now).from, now)).toBe(7 * DAY_MS);
        expect(resolveApiUsagePeriod("30j", now).previousTo.getTime()).toBe(resolveApiUsagePeriod("30j", now).from.getTime());
        expect(length(resolveApiUsagePeriod("aujourdhui", now).from, now)).toBeLessThan(DAY_MS);

        const month = resolveApiUsagePeriod("mois", now);
        expect(startOfUtcMonth(month.from)).toBe(true);
        expect(startOfUtcMonth(month.previousFrom)).toBe(true);
        const previousMonthLength = length(month.previousFrom, month.from);
        expect([28, 29, 30, 31]).toContain(previousMonthLength / DAY_MS);
        expect(length(month.previousFrom, month.previousTo)).toBe(Math.min(length(month.from, month.to), previousMonthLength));

        const last = resolveApiUsagePeriod("mois-precedent", now);
        for (const bound of [last.from, last.to, last.previousFrom, last.previousTo]) expect(startOfUtcMonth(bound)).toBe(true);
        expect(last.previousTo.getTime()).toBe(last.from.getTime());
        expect(last.to.getTime()).toBe(month.from.getTime());
        expect(last.from.getTime()).toBe(month.previousFrom.getTime());
        expect([28, 29, 30, 31]).toContain(length(last.from, last.to) / DAY_MS);
        expect([28, 29, 30, 31]).toContain(length(last.previousFrom, last.previousTo) / DAY_MS);
      }
    });
  });
});
