import { describe, expect, it, vi } from "vitest";
import { metaCreativePhotoUrl } from "./photos";

const SITE = "00000000-0000-0000-0000-00000000000a";

describe("metaCreativePhotoUrl", () => {
  it("sans photoId : null, sans lire le catalogue", async () => {
    const resolve = vi.fn();
    expect(await metaCreativePhotoUrl(SITE, { photoId: null, photoUrl: "https://example.com/p.jpg" }, resolve)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("photoUrl posée par le service : utilisée telle quelle, sans lire le catalogue", async () => {
    const resolve = vi.fn();
    expect(await metaCreativePhotoUrl(SITE, { photoId: "p3", photoUrl: " https://images.example.com/p3.jpg " }, resolve)).toBe("https://images.example.com/p3.jpg");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("photoUrl absente, nulle ou invalide : repli sur le catalogue du site", async () => {
    const resolve = vi.fn(async (_siteId: string, photoId: string) => (photoId === "p3" ? "https://images.example.com/catalogue-p3.jpg" : null));
    expect(await metaCreativePhotoUrl(SITE, { photoId: "p3" }, resolve)).toBe("https://images.example.com/catalogue-p3.jpg");
    expect(await metaCreativePhotoUrl(SITE, { photoId: "p3", photoUrl: null }, resolve)).toBe("https://images.example.com/catalogue-p3.jpg");
    expect(await metaCreativePhotoUrl(SITE, { photoId: "p3", photoUrl: "data:image/png;base64,AAAA" }, resolve)).toBe("https://images.example.com/catalogue-p3.jpg");
    expect(await metaCreativePhotoUrl(SITE, { photoId: "p9", photoUrl: "" }, resolve)).toBeNull();
    expect(resolve).toHaveBeenCalledWith(SITE, "p3");
  });
});
