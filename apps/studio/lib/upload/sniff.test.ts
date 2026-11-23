import { describe, expect, it } from "vitest";
import { sniffImageType } from "./sniff";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((c) => c.charCodeAt(0)) : [value])));

describe("sniffImageType", () => {
  it("reconnaît les quatre formats acceptés à leur signature", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", 1, 2, 3, 4, "WEBP", "VP8 "))).toBe("image/webp");
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, "ftyp", "avif", 0, 0, 0, 0, "mif1", "miaf"))).toBe("image/avif");
    // AVIF dont la marque principale est générique (mif1) mais qui se déclare compatible avif
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, "ftyp", "mif1", 0, 0, 0, 0, "mif1", "avif", "miaf"))).toBe("image/avif");
  });

  it("refuse tout le reste : SVG, HTML, GIF, vidéo MP4, fichier vide ou tronqué", () => {
    expect(sniffImageType(bytes("<svg xmlns=\"http://www.w3.org/2000/svg\">"))).toBeNull();
    expect(sniffImageType(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffImageType(bytes("GIF89a", 1, 0, 1, 0))).toBeNull();
    expect(sniffImageType(bytes(0, 0, 0, 0x18, "ftyp", "isom", 0, 0, 2, 0, "isom", "mp41"))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 1, 2, 3, 4, "WAVE"))).toBeNull();
  });
});
