import { describe, expect, it } from "vitest";
import { buildImagePrompt, createImageProvider, MockImageProvider } from "./images";

describe("ImageProvider", () => {
  it("mock par défaut sans FAL_API_KEY", () => {
    expect(createImageProvider({} as NodeJS.ProcessEnv)).toBeInstanceOf(MockImageProvider);
  });

  it("IMAGE_PROVIDER=mock force le mock même avec clé", () => {
    expect(
      createImageProvider({ FAL_API_KEY: "k", IMAGE_PROVIDER: "mock" } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(MockImageProvider);
  });

  it("le mock produit un SVG data-URI déterministe", async () => {
    const provider = new MockImageProvider();
    const a = await provider.generate({ subject: "Massage sportif à Clapiers" });
    const b = await provider.generate({ subject: "Massage sportif à Clapiers" });
    expect(a.url).toBe(b.url);
    expect(a.url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(a.aiGenerated).toBe(true);
    const svg = Buffer.from(a.url.split(",")[1]!, "base64").toString("utf8");
    expect(svg).toContain("<svg");
  });

  it("le prompt d'image interdit texte, logo et visages", () => {
    const prompt = buildImagePrompt({ subject: "Réflexologie plantaire" });
    expect(prompt).toContain("Réflexologie plantaire");
    expect(prompt).toContain("Pas de texte");
  });
});
