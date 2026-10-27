import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  SIZE_SUFFIX,
  buildPdf,
  buildZip,
  captionTxt,
  contentDisposition,
  downloadFilename,
  slideFileName,
} from "./bundle";

async function jpeg(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
}

describe("bundle", () => {
  it("buildZip contient les n entrées, sans compression", async () => {
    const a = await jpeg(40, 40, "#ff0000");
    const b = await jpeg(40, 40, "#00ff00");
    const zip = buildZip([
      { name: slideFileName(0, "cover"), data: a },
      { name: slideFileName(1, "page"), data: b },
      { name: slideFileName(2, "cta"), data: a },
      { name: "legende.txt", data: Buffer.from("x", "utf8") },
    ]);
    const entries = unzipSync(zip);
    expect(Object.keys(entries)).toEqual(["01-couverture.jpg", "02-page.jpg", "03-fin.jpg", "legende.txt"]);
    expect(Buffer.from(entries["02-page.jpg"]!).equals(b)).toBe(true);
    // Niveau 0 : la taille du ZIP ≈ somme des entrées + en-têtes
    expect(zip.length).toBeGreaterThan(a.length * 2 + b.length);
  });

  it("buildPdf produit une page par diapositive aux dimensions px → pt", async () => {
    const a = await jpeg(108, 108, "#ff0000");
    const b = await jpeg(108, 135, "#0000ff");
    const pdf = await buildPdf(
      [
        { data: a, width: 1080, height: 1080 },
        { data: b, width: 1080, height: 1350 },
      ],
      "Test",
    );
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 1080, height: 1080 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 1080, height: 1350 });
    expect(doc.getTitle()).toBe("Test");
  });

  it("captionTxt = une variante par réseau (titres), puis le texte alternatif", () => {
    const BIO = "Pour prendre rendez-vous, le lien est dans ma bio.";
    const options = { siteUrl: "https://site.fr", bioLine: BIO };
    const txt = captionTxt(
      {
        caption: `Première ligne.\n\n${BIO}`,
        hashtags: ["#SophrologueAlbi", "#Albi", "#Sophrologie", "#Stress"],
        altText: "Visuel violet avec un titre.",
      },
      options,
    );
    expect(txt).toBe(
      [
        `=== Instagram ===\nPremière ligne.\n\n${BIO}\n\n#SophrologueAlbi #Albi #Sophrologie #Stress`,
        "=== Facebook ===\nPremière ligne.\n\nPour prendre rendez-vous : https://site.fr/?src=fb\n\n#SophrologueAlbi #Albi #Sophrologie",
        "=== LinkedIn ===\nPremière ligne.\n\nPour prendre rendez-vous : https://site.fr/?src=li\n\n#SophrologueAlbi #Albi #Sophrologie",
        "=== Texte alternatif ===\nVisuel violet avec un titre.\n",
      ].join("\n\n"),
    );
    // Story : pas de variante LinkedIn ; sans texte alternatif, pas de section
    const story = captionTxt({ caption: "Seule.", hashtags: [], altText: "" }, { ...options, format: "story" });
    expect(story).toContain("=== Instagram ===");
    expect(story).toContain("=== Facebook ===");
    expect(story).not.toContain("LinkedIn");
    expect(story).not.toContain("Texte alternatif");
  });

  it("downloadFilename est ASCII, borné et suffixé", () => {
    const name = downloadFilename(
      { scheduledFor: "2026-11-06", topic: "3 minutes pour relâcher les épaules — un exercice très simple à faire" },
      `carrousel-${SIZE_SUFFIX.square}`,
      "zip",
    );
    expect(name).toBe("2026-11-06-3-minutes-pour-relacher-les-epaules-un-e-carrousel-carre.zip");
    expect(name).toMatch(/^[\x20-\x7e]+$/);
    expect(downloadFilename({ scheduledFor: "2026-11-06", topic: "???" }, "legende", "txt")).toBe(
      "2026-11-06-contenu-legende.txt",
    );
  });

  it("contentDisposition fournit un repli ASCII et filename* UTF-8", () => {
    expect(contentDisposition("2026-11-06-respirer-carre.jpg")).toBe(
      `attachment; filename="2026-11-06-respirer-carre.jpg"; filename*=UTF-8''2026-11-06-respirer-carre.jpg`,
    );
    expect(contentDisposition('é "x".jpg')).toBe(
      `attachment; filename="_ _x_.jpg"; filename*=UTF-8''%C3%A9%20%22x%22.jpg`,
    );
  });

  it("slideFileName numérote et nomme selon le rôle", () => {
    expect(slideFileName(0, "single")).toBe("01-visuel.jpg");
    expect(slideFileName(5, "cta")).toBe("06-fin.jpg");
  });
});
