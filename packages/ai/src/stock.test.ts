import { describe, expect, it } from "vitest";
import {
  createStockImageProvider,
  findStockOrGenerate,
  MockStockProvider,
  stockQueryFor,
  type StockImageProvider,
} from "./stock";
import { MockImageProvider } from "./images";

describe("stockQueryFor", () => {
  it("traduit les sujets français courants en requêtes photo anglaises", () => {
    expect(stockQueryFor("Gestion du stress")).toContain("stress");
    expect(stockQueryFor("Troubles du sommeil")).toContain("sleep");
    expect(stockQueryFor("Douleurs de dos au bureau")).toContain("back pain");
    expect(stockQueryFor("Accompagnement de la grossesse")).toContain("pregnancy");
    expect(stockQueryFor("Arrêt du tabac")).toContain("freedom");
  });

  it("utilise la profession en renfort du sujet", () => {
    expect(stockQueryFor("Première séance", "Réflexologue")).toContain("reflexology");
  });

  it("repli générique bien-être pour un sujet inconnu", () => {
    expect(stockQueryFor("Sujet totalement inédit")).toBe("wellness serenity nature soft light");
  });
});

describe("MockStockProvider", () => {
  it("renvoie un SVG data URI déterministe", async () => {
    const provider = new MockStockProvider();
    const a = await provider.find({ query: "peaceful sleep", width: 1024, height: 576 });
    const b = await provider.find({ query: "peaceful sleep", width: 1024, height: 576 });
    expect(a?.url).toMatch(/^data:image\/svg\+xml/);
    expect(a?.url).toBe(b?.url);
    expect(a?.provider).toBe("mock");
  });

  it("varie selon la graine", async () => {
    const provider = new MockStockProvider();
    const a = await provider.find({ query: "calm", width: 640, height: 480, seed: "page-1" });
    const b = await provider.find({ query: "calm", width: 640, height: 480, seed: "page-2" });
    expect(a?.url).not.toBe(b?.url);
  });
});

describe("createStockImageProvider", () => {
  it("mock sans clé, pexels avec clé, mock forcé par STOCK_IMAGE_PROVIDER", () => {
    expect(createStockImageProvider({} as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createStockImageProvider({ PEXELS_API_KEY: "k" } as NodeJS.ProcessEnv).mode).toBe("pexels");
    expect(
      createStockImageProvider({ PEXELS_API_KEY: "k", STOCK_IMAGE_PROVIDER: "mock" } as NodeJS.ProcessEnv).mode,
    ).toBe("mock");
  });
});

describe("findStockOrGenerate", () => {
  const failing: StockImageProvider = {
    mode: "pexels",
    find: async () => {
      throw new Error("réseau indisponible");
    },
  };
  const empty: StockImageProvider = { mode: "pexels", find: async () => null };

  it("photo de banque quand disponible (aiGenerated=false)", async () => {
    const image = await findStockOrGenerate(new MockStockProvider(), new MockImageProvider(), {
      query: "calm nature",
      subject: "Sujet",
      width: 640,
      height: 480,
    });
    expect(image?.aiGenerated).toBe(false);
    expect(image?.url).toMatch(/^data:image\/svg\+xml/);
  });

  it("repli IA quand la banque échoue ou ne trouve rien", async () => {
    for (const provider of [failing, empty]) {
      const image = await findStockOrGenerate(provider, new MockImageProvider(), {
        query: "calm nature",
        subject: "Sujet",
        width: 640,
        height: 480,
      });
      expect(image?.aiGenerated).toBe(true);
      expect(image?.url).toMatch(/^data:image\/svg\+xml/);
    }
  });
});
