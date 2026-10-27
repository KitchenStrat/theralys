import { describe, expect, it } from "vitest";
import { normalizeCaption, SOCIAL_CAPTION_MAX, truncateCaption } from "./caption";
import {
  buildIcs,
  buildPlannerCsv,
  csvField,
  exportFilename,
  foldIcsLine,
  icsEscape,
  networksFor,
  plannerExportable,
  plannerRows,
  socialPostDeepLink,
  unfoldIcs,
  type ExportablePost,
} from "./export";
import { captionTxt } from "./render/bundle";

const BIO = "Pour prendre rendez-vous, le lien est dans ma bio.";
const SITE = "https://claire-dupont.fr";

const post: ExportablePost = {
  id: "0f5b7b2a-5b1e-4c8a-9b1f-2f3c4d5e6f70",
  scheduledFor: "2026-11-03",
  topic: "Respirer avant un entretien",
  format: "static",
  content: {
    caption: `Une accroche, avec une virgule.\n\nUn "détail" entre guillemets.\n\n${BIO}`,
    hashtags: ["#SophrologueAlbi", "#Albi", "#Sophrologie", "#Stress", "#Respiration"],
  },
  imageUrl: "https://blob.example/social/site/post/square-0-full.jpg",
};

describe("CSV planificateur", () => {
  it("csvField entoure de guillemets et double les guillemets internes", () => {
    expect(csvField("simple")).toBe('"simple"');
    expect(csvField('dit "bonjour", puis part')).toBe('"dit ""bonjour"", puis part"');
    expect(csvField("")).toBe('""');
  });

  it("csvField : un champ qui ressemble à une formule est préfixé d'une apostrophe", () => {
    expect(csvField("=1+1")).toBe("\"'=1+1\"");
    expect(csvField("+33 6 00 00 00 00")).toBe("\"'+33 6 00 00 00 00\"");
    expect(csvField("- trois conseils")).toBe("\"'- trois conseils\"");
    expect(csvField("@claire")).toBe("\"'@claire\"");
    expect(csvField("\tx")).toBe("\"'\tx\"");
    expect(csvField("\rx")).toBe("\"'\rx\"");
    // Dates, heures et texte ordinaire ne changent pas
    expect(csvField("2026-11-03")).toBe('"2026-11-03"');
    expect(csvField("09:00")).toBe('"09:00"');
    expect(csvField("Un texte, avec =signe au milieu")).toBe('"Un texte, avec =signe au milieu"');
  });

  it("plannerExportable : ni contenu publié ni date passée (l'ICS n'est pas filtré)", () => {
    const posts = [
      { id: "a", status: "ready", scheduledFor: "2026-11-02" },
      { id: "b", status: "published", scheduledFor: "2026-11-05" },
      { id: "c", status: "ready", scheduledFor: "2026-11-03" },
      { id: "d", status: "ready", scheduledFor: "2026-11-10" },
    ];
    expect(plannerExportable(posts, "2026-11-03").map((p) => p.id)).toEqual(["c", "d"]);
    expect(plannerExportable(posts, "2026-11-01").map((p) => p.id)).toEqual(["a", "c", "d"]);
    expect(plannerExportable(posts, "2026-12-01")).toEqual([]);
  });

  it("buildPlannerCsv : BOM, en-tête, virgule, CRLF, champs quotés (sauts de ligne conservés)", () => {
    const csv = buildPlannerCsv([
      { date: "2026-11-03", time: "09:00", text: 'Ligne 1\n\nLigne "2"', imageUrl: "", network: "Instagram" },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("date,heure,texte,image_url,reseau");
    // Le texte multi-ligne reste dans un seul champ quoté
    expect(csv).toContain('"2026-11-03","09:00","Ligne 1\n\nLigne ""2""","","Instagram"\r\n');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).not.toContain(";");
  });

  it("plannerRows : une ligne par réseau avec la légende du réseau, heure 09:00", () => {
    const rows = plannerRows([post], SITE, BIO);
    expect(rows.map((r) => r.network)).toEqual(["Instagram", "Facebook", "LinkedIn"]);
    expect(rows.every((r) => r.date === "2026-11-03" && r.time === "09:00" && r.imageUrl === post.imageUrl)).toBe(true);
    expect(rows[0]!.text).toContain(BIO);
    expect(rows[0]!.text).toContain("#Respiration");
    expect(rows[1]!.text).not.toContain("bio");
    expect(rows[1]!.text).toContain(`${SITE}/?src=fb`);
    expect(rows[1]!.text.endsWith("#SophrologueAlbi #Albi #Sophrologie")).toBe(true);
    expect(rows[2]!.text).toContain(`${SITE}/?src=li`);
  });

  it("une story n'a pas de ligne LinkedIn", () => {
    expect(networksFor("story")).toEqual(["instagram", "facebook"]);
    expect(networksFor("carousel")).toEqual(["instagram", "facebook", "linkedin"]);
    expect(plannerRows([{ ...post, format: "story" }], SITE, BIO).map((r) => r.network)).toEqual(["Instagram", "Facebook"]);
  });

  it("story sans hashtags : deux lignes, légendes sans bloc de hashtags, lien tracé sur Facebook seulement", () => {
    const story: ExportablePost = { ...post, format: "story", content: { caption: `Une story.\n\n${BIO}`, hashtags: [] } };
    const rows = plannerRows([story], SITE, BIO);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text).toBe(`Une story.\n\n${BIO}`);
    expect(rows[1]!.text).toBe(`Une story.\n\nPour prendre rendez-vous : ${SITE}/?src=fb`);
    expect(rows.every((r) => !r.text.includes("#"))).toBe(true);
  });

  it("le CSV complet d'un contenu tient en 1 en-tête + 3 lignes exploitables", () => {
    const csv = buildPlannerCsv(plannerRows([post], SITE, BIO));
    // Compte des enregistrements : chaque ligne commence par la date quotée
    expect(csv.match(/\r\n"2026-11-03","09:00"/g)).toHaveLength(3);
  });
});

describe("ICS", () => {
  it("icsEscape : antislash, point-virgule, virgule et sauts de ligne", () => {
    expect(icsEscape("a;b,c\\d\ne\r\nf")).toBe("a\\;b\\,c\\\\d\\ne\\nf");
  });

  it("foldIcsLine : lignes ≤ 75 octets, continuation précédée d'une espace, caractères multi-octets intacts", () => {
    const long = "DESCRIPTION:" + "é".repeat(120); // é = 2 octets
    const folded = foldIcsLine(long);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const [i, line] of physical.entries()) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
      if (i > 0) expect(line.startsWith(" ")).toBe(true);
    }
    expect(unfoldIcs(folded)).toBe(long);
    // Rien à replier sous 75 octets
    expect(foldIcsLine("SUMMARY:court")).toBe("SUMMARY:court");
    expect(foldIcsLine("X".repeat(75))).toBe("X".repeat(75));
    expect(foldIcsLine("X".repeat(76))).toBe(`${"X".repeat(75)}\r\n X`);
  });

  it("buildIcs : un événement journée entière par contenu, description échappée, URL profonde", () => {
    const url = socialPostDeepLink("https://app.harmony-web.fr/", "2026-11", post.id);
    expect(url).toBe(`https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11&post=${post.id}`);
    const ics = buildIcs(
      [{ uid: post.id, date: post.scheduledFor, summary: "Sujet, avec virgule", description: "Ligne 1\nLigne 2; fin", url }],
      { name: "Réseaux sociaux — novembre 2026", now: new Date("2026-10-27T10:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const flat = unfoldIcs(ics);
    expect(flat).toContain("DTSTART;VALUE=DATE:20261103");
    expect(flat).toContain("DTEND;VALUE=DATE:20261104");
    expect(flat).toContain("DTSTAMP:20261027T100000Z");
    expect(flat).toContain("SUMMARY:Sujet\\, avec virgule");
    expect(flat).toContain("DESCRIPTION:Ligne 1\\nLigne 2\\; fin");
    expect(flat).toContain(`UID:${post.id}@harmony-web.fr`);
    expect(flat).toContain(`URL:${url}`);
    expect(flat.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });

  it("buildIcs : une légende qui imite la fin d'un événement reste une description (un seul VEVENT)", () => {
    const hostile = "Fin.\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:pirate\r\nURL:https://mal.example";
    const ics = buildIcs(
      [{ uid: post.id, date: post.scheduledFor, summary: "Sujet", description: hostile, url: "https://app.harmony-web.fr/x" }],
      { name: "Test", now: new Date("2026-10-27T10:00:00Z") },
    );
    const flat = unfoldIcs(ics);
    // Lignes physiques seulement : le texte « BEGIN:VEVENT » de la description reste dans sa ligne DESCRIPTION
    expect(flat.match(/^BEGIN:VEVENT\r$/gm)).toHaveLength(1);
    expect(flat.match(/^END:VEVENT\r$/gm)).toHaveLength(1);
    expect(flat.match(/^SUMMARY:/gm)).toHaveLength(1);
    expect(flat.match(/^URL:/gm)).toHaveLength(1);
    expect(flat).toContain("DESCRIPTION:Fin.\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:pirate\\nURL:https://mal.example");
    expect(flat).toContain("URL:https://app.harmony-web.fr/x");
  });

  it("exportFilename", () => {
    expect(exportFilename("2026-11", "csv")).toBe("reseaux-sociaux-2026-11.csv");
    expect(exportFilename("2026-11", "ics")).toBe("reseaux-sociaux-2026-11.ics");
  });
});

describe("captionTxt (téléchargement .txt) : trois variantes", () => {
  it("titres Instagram, Facebook, LinkedIn dans l'ordre, puis le texte alternatif", () => {
    const txt = captionTxt({ ...post.content, altText: "Visuel bleu." }, { siteUrl: SITE, bioLine: BIO });
    const titles = [...txt.matchAll(/^=== (.+) ===$/gm)].map((m) => m[1]);
    expect(titles).toEqual(["Instagram", "Facebook", "LinkedIn", "Texte alternatif"]);
    expect(txt).toContain(BIO);
    expect(txt).toContain(`${SITE}/?src=fb`);
    expect(txt).toContain(`${SITE}/?src=li`);
    expect(txt.endsWith("Visuel bleu.\n")).toBe(true);
  });
});

describe("normalizeCaption", () => {
  it("fins de ligne, espaces de fin, lignes vides multiples, bornes et longueur", () => {
    expect(normalizeCaption("  Bonjour \r\nà tous.  \n\n\n\nFin. ")).toBe("Bonjour\nà tous.\n\nFin.");
    expect(normalizeCaption("a\u200bb\tc\u0007d")).toBe("ab c d");
    expect(normalizeCaption("x".repeat(SOCIAL_CAPTION_MAX + 50))).toHaveLength(SOCIAL_CAPTION_MAX);
    expect(SOCIAL_CAPTION_MAX).toBe(2200);
  });

  it("émojis composés (gluon U+200D, sélecteur de variante) et espace insécable conservés ; bidi, BOM et trait conditionnel retirés", () => {
    expect(normalizeCaption("Séance de yoga 🧘‍♀️ ce soir")).toBe("Séance de yoga 🧘‍♀️ ce soir");
    expect(normalizeCaption("Un ❤️ et un ✌🏽")).toBe("Un ❤️ et un ✌🏽");
    expect(normalizeCaption("Bonjour ! À bientôt ?")).toBe("Bonjour ! À bientôt ?");
    expect(normalizeCaption("﻿a‮b⁦c­d⁠e‏f")).toBe("abcdef");
    // NFC, pas NFKC : « ² » et « ﬁ » ne sont pas décomposés, « é » décomposé est recomposé
    expect(normalizeCaption("m² ﬁn")).toBe("m² ﬁn");
    expect(normalizeCaption("é")).toBe("é");
  });

  it("coupe en points de code, au dernier espace, sans substitut isolé", () => {
    const emoji = "🧘‍♀️"; // 5 unités UTF-16, 4 points de code
    const long = `${"mot ".repeat(548)}${emoji.repeat(10)}`; // 2 192 + 40 points de code
    const cut = normalizeCaption(long);
    expect(Array.from(cut).length).toBeLessThanOrEqual(SOCIAL_CAPTION_MAX);
    expect(cut.endsWith("mot")).toBe(true);
    expect(cut).not.toMatch(/[\ud800-\udbff]$/);
    // Une suite de 🙂 (2 unités chacun) autour de la limite : jamais coupée au milieu d'une paire
    const faces = normalizeCaption("🙂".repeat(SOCIAL_CAPTION_MAX + 5));
    expect(Array.from(faces)).toHaveLength(SOCIAL_CAPTION_MAX);
    expect(faces.length).toBe(SOCIAL_CAPTION_MAX * 2);
    const isWellFormed = (faces as string & { isWellFormed?: () => boolean }).isWellFormed;
    if (typeof isWellFormed === "function") expect(isWellFormed.call(faces)).toBe(true);
    expect(truncateCaption("abc def", 5)).toBe("abc");
    expect(truncateCaption("abcdefgh", 5)).toBe("abcde");
    expect(truncateCaption("abc", 5)).toBe("abc");
  });
});
