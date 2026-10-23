import { describe, expect, it } from "vitest";
import {
  bulletLines,
  camelHashtag,
  contrastOn,
  countEmoji,
  firstLine,
  isHexColor,
  normalizeHashtags,
  parseEmphasis,
  plainText,
  relativeLuminance,
  singleEmphasis,
  splitParagraphs,
  stripEmoji,
  truncateAtWord,
} from "./social-text";

describe("plainText", () => {
  it("aplatit gras, liens et lignes ✅, normalise les espaces", () => {
    expect(plainText("Je vous aide à **dénouer ce qui pèse** et à [respirer](https://x.fr).")).toBe(
      "Je vous aide à dénouer ce qui pèse et à respirer.",
    );
    expect(plainText("✅ Formée en sophrologie\n✅ Cadre confidentiel à Albi")).toBe(
      "- Formée en sophrologie\n- Cadre confidentiel à Albi",
    );
    expect(plainText("Un   texte \t avec   espaces  \n\n\n\n et lignes vides ")).toBe(
      "Un texte avec espaces\n\net lignes vides",
    );
  });

  it("remplace l'espace fine insécable (U+202F) par l'insécable (U+00A0) et retire les ** orphelins", () => {
    expect(plainText("60 € — **gras orphelin")).toBe("60 € — gras orphelin");
    expect(plainText(null)).toBe("");
    expect(plainText("\r\nA\r\nB")).toBe("A\nB");
  });
});

describe("stripEmoji", () => {
  it("retire pictogrammes, VS16, ZWJ, carnations et drapeaux", () => {
    expect(stripEmoji("Respirez 🌿 et relâchez ✨")).toBe("Respirez et relâchez");
    expect(stripEmoji("Famille 👨‍👩‍👧 unie")).toBe("Famille unie");
    expect(stripEmoji("Cœur ❤️ rouge")).toBe("Cœur rouge");
    expect(stripEmoji("Main 👋🏽 levée 🇫🇷")).toBe("Main levée");
  });

  it("conserve les guillemets français, l'apostrophe typographique, œ et les tirets", () => {
    const text = "« L'art d'être » — c’est l’œuvre d’une vie, n'est-ce pas ?";
    expect(stripEmoji(text)).toBe(text);
  });

  it("countEmoji compte les pictogrammes sans leurs modificateurs", () => {
    expect(countEmoji("Un 🌿 deux ✨ trois ❤️")).toBe(3);
    expect(countEmoji("aucun")).toBe(0);
  });
});

describe("truncateAtWord", () => {
  it("coupe au dernier espace et ajoute « … » sans dépasser max", () => {
    const text = "Quand tout s'accélère, le souffle se raccourcit et les épaules remontent.";
    const cut = truncateAtWord(text, 40);
    expect(cut).toBe("Quand tout s'accélère, le souffle se…");
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(truncateAtWord("court", 40)).toBe("court");
    expect(truncateAtWord("  espaces  ", 40)).toBe("espaces");
  });

  it("retire la ponctuation pendante avant « … » et coupe net un mot trop long", () => {
    expect(truncateAtWord("Respirer, relâcher, retrouver", 20)).toBe("Respirer, relâcher…");
    expect(truncateAtWord("Supercalifragilisticexpialidocious", 10)).toBe("Supercali…");
  });
});

describe("parseEmphasis / singleEmphasis", () => {
  it("mots du premier passage gras ; les autres passages sont déstylés", () => {
    const words = parseEmphasis("Pieds à plat, **yeux fermés**, puis **six fois** de suite.");
    expect(words.filter((w) => w.bold).map((w) => w.word)).toEqual(["yeux", "fermés,"]);
    expect(words.map((w) => w.word).join(" ")).toBe("Pieds à plat, yeux fermés, puis six fois de suite.");
    expect(words.filter((w) => w.bold)).toHaveLength(2);
  });

  it("ignore les ** orphelins", () => {
    const words = parseEmphasis("Un **passage sans fin et une fin");
    expect(words.every((w) => !w.bold)).toBe(true);
    expect(words.map((w) => w.word).join(" ")).toBe("Un passage sans fin et une fin");
    expect(parseEmphasis("")).toEqual([]);
  });

  it("singleEmphasis conserve un seul passage et nettoie les orphelins", () => {
    expect(singleEmphasis("**Un** et **deux** et ** trois")).toBe("**Un** et deux et  trois");
    expect(singleEmphasis("sans gras")).toBe("sans gras");
  });
});

describe("bulletLines", () => {
  it("extrait les lignes « - », « • », « ✅ » et numérotées", () => {
    expect(bulletLines("Intro\n- Un temps d'échange\n• Des exercices guidés\n✅ Un retour au calme\n3. Des repères")).toEqual([
      "Un temps d'échange",
      "Des exercices guidés",
      "Un retour au calme",
      "Des repères",
    ]);
  });

  it("sans marqueur, rend les lignes non vides", () => {
    expect(bulletLines("Ligne un\n\nLigne deux")).toEqual(["Ligne un", "Ligne deux"]);
  });
});

describe("hashtags", () => {
  it("camelHashtag : CamelCase sans accent ni espace, mots entiers dans la limite", () => {
    expect(camelHashtag("Gestion du stress")).toBe("#GestionDuStress");
    expect(camelHashtag("Sophrologue Albi")).toBe("#SophrologueAlbi");
    expect(camelHashtag("Hypnothérapie / hypnose ericksonienne Saint-Étienne", 24)).toBe("#HypnotherapieHypnose");
    expect(camelHashtag("Réflexologie (plantaire, palmaire, faciale)")).toBe("#ReflexologiePlantairePalmaireFaciale");
  });

  it("normalizeHashtags : NFD, obligatoires en tête, dédoublonnage insensible à la casse, max 8", () => {
    const tags = normalizeHashtags(
      ["#sophrologie", "Gestion du stress", "#sophrologuealbi", "#Respiration", "#tarn", "#Sophrologie", "#x", "#Tarn", "#Aa", "#Bb", "#Cc", "#Dd"],
      { profession: "Sophrologue", city: "Albi" },
    );
    expect(tags.slice(0, 2)).toEqual(["#SophrologueAlbi", "#Albi"]);
    expect(tags).toContain("#GestionDuStress");
    expect(tags).toContain("#sophrologie");
    expect(tags.filter((t) => t.toLowerCase() === "#sophrologie")).toHaveLength(1);
    expect(tags.filter((t) => t.toLowerCase() === "#sophrologuealbi")).toHaveLength(1);
    expect(tags).not.toContain("#x");
    expect(tags).toHaveLength(8);
    expect(tags.every((t) => /^#[A-Za-z0-9_]{2,40}$/.test(t))).toBe(true);
  });

  it("retire apostrophes, tirets et accents (« #l'arrêt-du-tabac » → #LArretDuTabac, « #été » → #ete)", () => {
    expect(normalizeHashtags(["#l'arrêt-du-tabac", "#été", "#U.S.A"], { profession: "Hypnothérapeute", city: "Pau" })).toEqual([
      "#HypnotherapeutePau",
      "#Pau",
      "#LArretDuTabac",
      "#ete",
      "#USA",
    ]);
  });
});

describe("couleurs", () => {
  it("isHexColor", () => {
    expect(isHexColor("#6f5b9c")).toBe(true);
    expect(isHexColor("#6F5B9C")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("6f5b9c")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it("contrastOn : blanc sur fond sombre, couleur de texte sur fond clair", () => {
    expect(contrastOn("#6f5b9c")).toBe("#ffffff");
    expect(contrastOn("#292138", "#322b45")).toBe("#ffffff");
    expect(contrastOn("#eae4f4", "#322b45")).toBe("#322b45");
    expect(contrastOn("#ffffff")).toBe("#2b2b2b");
    expect(contrastOn("pas-une-couleur", "#111111")).toBe("#111111");
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("firstLine / splitParagraphs", () => {
  it("première ligne non vide et paragraphes", () => {
    expect(firstLine("\n\n  Accroche  \nSuite")).toBe("Accroche");
    expect(firstLine("")).toBe("");
    expect(splitParagraphs("Un\n\nDeux\n \n\nTrois\n")).toEqual(["Un", "Deux", "Trois"]);
  });
});
