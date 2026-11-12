import { describe, expect, it } from "vitest";
import { cleanLine, cleanLineMax, foldText, joinBlocks, sha256Hex, stripInvisible } from "./text";

/** Caractère d'un code Unicode (les caractères invisibles ne sont jamais écrits tels quels dans les sources). */
const u = (code: number): string => String.fromCodePoint(code);

describe("stripInvisible", () => {
  it("retire largeur nulle, césure, marques de sens d'écriture, sélecteurs de variante et étiquettes Unicode", () => {
    const invisible = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x00ad, 0x034f, 0x061c, 0x180e, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0xfe0f, 0xfeff, 0xfffc, 0xe0001, 0xe0041, 0xe007f, 0xe0100];
    for (const code of invisible) expect(stripInvisible(`ca${u(code)}binet`), code.toString(16)).toBe("cabinet");
  });

  it("retire les caractères de contrôle, garde tabulations et sauts de ligne", () => {
    expect(stripInvisible(`a${u(0)}b${u(7)}c${u(0x1b)}d${u(0x7f)}e${u(0x85)}f`)).toBe("abcdef");
    expect(stripInvisible("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("les séparateurs de ligne Unicode deviennent des sauts de ligne", () => {
    expect(stripInvisible(`un${u(0x2028)}deux${u(0x2029)}trois`)).toBe("un\ndeux\ntrois");
  });

  it("une consigne dissimulée en étiquettes Unicode disparaît entièrement", () => {
    const hidden = [..."IGNORE"].map((letter) => u(0xe0000 + letter.charCodeAt(0))).join("");
    expect(stripInvisible(`Bonjour${hidden} à tous`)).toBe("Bonjour à tous");
  });

  it("le texte ordinaire est intact : accents, ligatures, symboles, émojis", () => {
    const text = "Séance à 60 € — « cœur », œuvre, naïve, Ærø… 🌿 ½ № m²";
    expect(stripInvisible(text)).toBe(text);
  });
});

describe("cleanLine et cleanLineMax", () => {
  it("espaces de toute sorte (insécables, fines, retours à la ligne) réduites à une espace", () => {
    expect(cleanLine(`  1${u(0xa0)}h${u(0x202f)}15 \n\t et${u(0x2009)}plus  `)).toBe("1 h 15 et plus");
  });

  it("accents décomposés recomposés (NFC), sans toucher aux caractères de compatibilité", () => {
    expect(cleanLine(`e${u(0x301)}te${u(0x301)}`)).toBe("été");
    expect(cleanLine("été").length).toBe(3);
    expect(cleanLine("ﬁn de séance… 6ᵉ")).toBe("ﬁn de séance… 6ᵉ");
  });

  it("cleanLineMax : coupe sur un mot, sans ponctuation pendante ni demi-caractère", () => {
    expect(cleanLineMax("Sophrologue à Nantes", 50)).toBe("Sophrologue à Nantes");
    expect(cleanLineMax("Sophrologue à Nantes, quartier Graslin", 23)).toBe("Sophrologue à Nantes");
    expect(cleanLineMax("Anticonstitutionnellement vôtre", 10)).toBe("Anticonsti");
    expect(cleanLineMax(`ab${u(0x1f33f)}cd`, 3)).toBe("ab");
    expect(cleanLineMax("x".repeat(500), 200)).toHaveLength(200);
    expect(cleanLineMax("", 10)).toBe("");
  });
});

describe("joinBlocks", () => {
  it("une ligne par bloc, blocs vides ignorés", () => {
    expect(joinBlocks(["Titre", "", "Paragraphe.", ""], 100)).toBe("Titre\nParagraphe.");
    expect(joinBlocks([], 100)).toBe("");
  });

  it("au-delà de la borne : coupé entre deux blocs de préférence, terminé par « … », jamais plus long que la borne", () => {
    const blocks = ["Premier bloc assez long pour compter.", "Deuxième bloc assez long pour compter.", "Troisième bloc assez long pour compter."];
    const cut = joinBlocks(blocks, 90);
    expect(cut).toBe("Premier bloc assez long pour compter.\nDeuxième bloc assez long pour compter.…");
    expect(cut.length).toBeLessThanOrEqual(90);
    for (const max of [1, 2, 10, 37, 38, 39, 60, 113, 114, 115, 116]) expect(joinBlocks(blocks, max).length, String(max)).toBeLessThanOrEqual(max);
    expect(joinBlocks(blocks, 116)).toBe(blocks.join("\n"));
  });

  it("bloc unique trop long : coupé entre deux mots", () => {
    const cut = joinBlocks(["Un seul bloc qui dépasse largement la borne demandée ici."], 30);
    expect(cut).toBe("Un seul bloc qui dépasse…");
  });
});

describe("sha256Hex et foldText", () => {
  it("empreinte SHA-256 en hexadécimal, sensible au moindre changement", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("été")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("Tarifs")).not.toBe(sha256Hex("Tarifs "));
  });

  it("foldText : minuscules, sans accents, mots séparés par des tirets", () => {
    expect(foldText("Qui suis-je ?")).toBe("qui-suis-je");
    expect(foldText("  À propos / L'équipe  ")).toBe("a-propos-l-equipe");
    expect(foldText("Séances & Tarifs")).toBe("seances-tarifs");
    expect(foldText("Cœur et œuvre")).toBe("coeur-et-oeuvre");
    expect(foldText("mentions_légales.HTML")).toBe("mentions-legales-html");
    expect(foldText("…")).toBe("");
  });
});
