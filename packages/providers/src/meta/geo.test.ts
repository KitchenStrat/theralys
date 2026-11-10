import { describe, expect, it, vi } from "vitest";
import { GEO_API_BASE, GEO_COMMUNES_MAX, GEO_RETRY_DELAY_MS, GEO_TIMEOUT_MS, NEARBY_CITY_MIN_POPULATION, communeFromItem, fetchRegionCommunes, nearbyCitiesFrom, regionCommunesUrl, type FrCommune } from "./geo";

type Call = { url: string; method: string; headers: Record<string, string>; signal: AbortSignal | null };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal ?? null };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

/** Extrait de la réponse de l'API pour l'Occitanie (champs demandés + `code`, toujours renvoyé). */
const OCCITANIE = [
  { nom: "Albi", code: "81004", codeDepartement: "81", population: 49_714 },
  { nom: "Castres", code: "81065", codeDepartement: "81", population: 42_672 },
  { nom: "Gaillac", code: "81099", codeDepartement: "81", population: 15_345 },
  { nom: "Toulouse", code: "31555", codeDepartement: "31", population: 504_078 },
  { nom: "Montpellier", code: "34172", codeDepartement: "34", population: 302_454 },
];

const commune = (name: string, departmentCode: string, population: number): FrCommune => ({ name, departmentCode, population });

describe("regionCommunesUrl", () => {
  it("API « Découpage administratif » : communes de la région, champs nom, département et population, en JSON", () => {
    expect(regionCommunesUrl("76")).toBe("https://geo.api.gouv.fr/communes?codeRegion=76&fields=nom,codeDepartement,population&format=json");
    const url = new URL(regionCommunesUrl("76"));
    expect(url.origin).toBe(GEO_API_BASE);
    expect(url.pathname).toBe("/communes");
    expect(url.searchParams.get("codeRegion")).toBe("76");
    expect(url.searchParams.get("fields")).toBe("nom,codeDepartement,population");
    expect(url.searchParams.get("format")).toBe("json");
    // Le code est encodé : il ne peut pas ajouter de paramètre
    expect(new URL(regionCommunesUrl("76&fields=x")).searchParams.get("codeRegion")).toBe("76&fields=x");
  });
});

describe("communeFromItem", () => {
  it("entrée valide : nom nettoyé, code du département, population entière", () => {
    expect(communeFromItem({ nom: "Albi", code: "81004", codeDepartement: "81", population: 49_714 })).toEqual({ name: "Albi", departmentCode: "81", population: 49_714 });
    expect(communeFromItem({ nom: "  Saint-Juéry \n", codeDepartement: " 81 ", population: 6_712.8 })).toEqual({ name: "Saint-Juéry", departmentCode: "81", population: 6_712 });
    expect(communeFromItem({ nom: "x".repeat(120), codeDepartement: "81", population: 10 })!.name).toHaveLength(80);
  });

  it("champs manquants : null sans nom ou sans département ; population absente ou invalide → 0", () => {
    expect(communeFromItem({ codeDepartement: "81", population: 100 })).toBeNull();
    expect(communeFromItem({ nom: "Albi", population: 100 })).toBeNull();
    expect(communeFromItem({ nom: "   ", codeDepartement: "81" })).toBeNull();
    expect(communeFromItem({ nom: 81, codeDepartement: "81" })).toBeNull();
    expect(communeFromItem({ nom: "Albi", codeDepartement: 81 })).toBeNull();
    expect(communeFromItem(null)).toBeNull();
    expect(communeFromItem("Albi")).toBeNull();
    expect(communeFromItem(undefined)).toBeNull();
    expect(communeFromItem({ nom: "Rochefourchat", codeDepartement: "26" })).toEqual({ name: "Rochefourchat", departmentCode: "26", population: 0 });
    expect(communeFromItem({ nom: "Albi", codeDepartement: "81", population: "49714" })!.population).toBe(0);
    expect(communeFromItem({ nom: "Albi", codeDepartement: "81", population: -3 })!.population).toBe(0);
    expect(communeFromItem({ nom: "Albi", codeDepartement: "81", population: Number.NaN })!.population).toBe(0);
  });

  it("Corse (2A, 2B, minuscules comprises) et outre-mer (trois chiffres) acceptés", () => {
    expect(communeFromItem({ nom: "Ajaccio", codeDepartement: "2A", population: 73_822 })).toEqual({ name: "Ajaccio", departmentCode: "2A", population: 73_822 });
    expect(communeFromItem({ nom: "Bastia", codeDepartement: "2b", population: 48_503 })).toEqual({ name: "Bastia", departmentCode: "2B", population: 48_503 });
    expect(communeFromItem({ nom: "Les Abymes", codeDepartement: "971", population: 52_123 })).toEqual({ name: "Les Abymes", departmentCode: "971", population: 52_123 });
  });

  it("code de département invalide → null", () => {
    for (const codeDepartement of ["", "8", "2C", "AB", "1234", "81 Tarn", "8A"]) expect(communeFromItem({ nom: "Albi", codeDepartement, population: 100 })).toBeNull();
  });
});

describe("fetchRegionCommunes", () => {
  it("code de région invalide : lève sans aucun appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(OCCITANIE));
    for (const code of ["", "7", "076", "2A", "76&x=1", " 76"]) await expect(fetchRegionCommunes(code, { fetchImpl: impl, retryDelayMs: 0 })).rejects.toThrow(/Code de région invalide/);
    expect(calls).toHaveLength(0);
  });

  it("succès : un GET sur l'URL de la région, communes normalisées, entrées invalides ignorées", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse([...OCCITANIE, { nom: "Sans département" }, null, { nom: "Hors format", codeDepartement: "XX" }]));
    const communes = await fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(regionCommunesUrl("76"));
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.headers.accept).toBe("application/json");
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(communes).toEqual([
      { name: "Albi", departmentCode: "81", population: 49_714 },
      { name: "Castres", departmentCode: "81", population: 42_672 },
      { name: "Gaillac", departmentCode: "81", population: 15_345 },
      { name: "Toulouse", departmentCode: "31", population: 504_078 },
      { name: "Montpellier", departmentCode: "34", population: 302_454 },
    ]);
    expect(GEO_TIMEOUT_MS).toBe(8_000);
    expect(GEO_RETRY_DELAY_MS).toBe(600);
  });

  it("première tentative en échec (HTTP 503 ou réseau) puis succès → une seule relance", async () => {
    const http = stubFetch((_call, index) => (index === 0 ? new Response("Service Unavailable", { status: 503 }) : jsonResponse(OCCITANIE)));
    expect(await fetchRegionCommunes("76", { fetchImpl: http.impl, retryDelayMs: 0 })).toHaveLength(OCCITANIE.length);
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1]!.url).toBe(http.calls[0]!.url);
    const network = stubFetch((_call, index) => {
      if (index === 0) throw new TypeError("fetch failed");
      return jsonResponse(OCCITANIE);
    });
    expect(await fetchRegionCommunes("76", { fetchImpl: network.impl, retryDelayMs: 0 })).toHaveLength(OCCITANIE.length);
    expect(network.calls).toHaveLength(2);
  });

  it("deux échecs → lève (deux tentatives, pas davantage)", async () => {
    const http = stubFetch(() => new Response("Bad Gateway", { status: 502 }));
    await expect(fetchRegionCommunes("76", { fetchImpl: http.impl, retryDelayMs: 0 })).rejects.toThrow(/HTTP 502/);
    expect(http.calls).toHaveLength(2);
    const network = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchRegionCommunes("76", { fetchImpl: network.impl, retryDelayMs: 0 })).rejects.toThrow("fetch failed");
    expect(network.calls).toHaveLength(2);
  });

  it("réponse qui n'est pas un tableau (ou illisible) → lève", async () => {
    const object = stubFetch(() => jsonResponse({ communes: OCCITANIE }));
    await expect(fetchRegionCommunes("76", { fetchImpl: object.impl, retryDelayMs: 0 })).rejects.toThrow(/réponse inattendue/);
    expect(object.calls).toHaveLength(2);
    const html = stubFetch(() => new Response("<html>Maintenance</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(fetchRegionCommunes("76", { fetchImpl: html.impl, retryDelayMs: 0 })).rejects.toThrow();
    expect(html.calls).toHaveLength(2);
  });

  it("délai dépassé : la requête est annulée par son signal, relancée une fois, puis lève", async () => {
    const { calls, impl } = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
        }),
    );
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, timeoutMs: 5, retryDelayMs: 0 })).rejects.toThrow();
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.signal?.aborted === true)).toBe(true);
  });

  it(`réponse bornée à GEO_COMMUNES_MAX (${GEO_COMMUNES_MAX}) entrées`, async () => {
    const many = Array.from({ length: GEO_COMMUNES_MAX + 5 }, (_, n) => ({ nom: `Commune ${n}`, codeDepartement: "81", population: n }));
    const { impl } = stubFetch(() => jsonResponse(many));
    const communes = await fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 });
    expect(communes).toHaveLength(GEO_COMMUNES_MAX);
    expect(communes.at(-1)).toEqual({ name: `Commune ${GEO_COMMUNES_MAX - 1}`, departmentCode: "81", population: GEO_COMMUNES_MAX - 1 });
  });
});

describe("nearbyCitiesFrom", () => {
  const communes: FrCommune[] = [
    commune("Gaillac", "81", 15_345),
    commune("Albi", "81", 49_714),
    commune("Castres", "81", 42_672),
    commune("Graulhet", "81", 12_890),
    commune("Mazamet", "81", 10_011),
    commune("Toulouse", "31", 504_078),
    commune("Lescure-d'Albigeois", "81", 4_800),
    commune("Puygouzon", "81", NEARBY_CITY_MIN_POPULATION),
    commune("Cambon", "81", NEARBY_CITY_MIN_POPULATION - 1),
  ];

  it("plus grandes villes du département par population décroissante, trois par défaut, sans la ville du praticien", () => {
    expect(nearbyCitiesFrom(communes, "81", "Albi")).toEqual(["Castres", "Gaillac", "Graulhet"]);
    // Un autre département : ses propres villes seulement
    expect(nearbyCitiesFrom(communes, "31", "Albi")).toEqual(["Toulouse"]);
    expect(nearbyCitiesFrom(communes, "12", "Rodez")).toEqual([]);
    expect(nearbyCitiesFrom([], "81", "Albi")).toEqual([]);
  });

  it("ville du praticien écartée sans tenir compte des accents, de la casse ni des traits d'union", () => {
    const marne = [commune("Épernay", "51", 22_330), commune("Reims", "51", 179_380), commune("Châlons-en-Champagne", "51", 43_800), commune("Vitry-le-François", "51", 11_400)];
    expect(nearbyCitiesFrom(marne, "51", "epernay")).toEqual(["Reims", "Châlons-en-Champagne", "Vitry-le-François"]);
    expect(nearbyCitiesFrom(marne, "51", "CHALONS EN CHAMPAGNE")).toEqual(["Reims", "Épernay", "Vitry-le-François"]);
    // Ville inconnue du référentiel : rien n'est écarté
    expect(nearbyCitiesFrom(marne, "51", "Ay")).toEqual(["Reims", "Châlons-en-Champagne", "Épernay"]);
  });

  it(`population minimale (${NEARBY_CITY_MIN_POPULATION} habitants, borne incluse) et nombre maximal de villes`, () => {
    const all = nearbyCitiesFrom(communes, "81", "Albi", 20);
    expect(all).toEqual(["Castres", "Gaillac", "Graulhet", "Mazamet", "Lescure-d'Albigeois", "Puygouzon"]);
    expect(all).not.toContain("Cambon");
    expect(nearbyCitiesFrom(communes, "81", "Albi", 1)).toEqual(["Castres"]);
    expect(nearbyCitiesFrom(communes, "81", "Albi", 0)).toEqual([]);
  });

  it("à population égale, ordre alphabétique ; la liste d'entrée n'est pas modifiée", () => {
    const tied = [commune("Zonza", "2A", 5_000), commune("Ajaccio", "2A", 5_000), commune("Bastelicaccia", "2A", 5_000)];
    const before = tied.map((c) => c.name);
    expect(nearbyCitiesFrom(tied, "2A", "Porto-Vecchio")).toEqual(["Ajaccio", "Bastelicaccia", "Zonza"]);
    expect(tied.map((c) => c.name)).toEqual(before);
  });
});
