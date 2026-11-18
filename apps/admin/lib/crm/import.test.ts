import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, parseCsv } from "./csv";
import { applyMapping, guessMapping } from "./mapping";
import { contactMonthlyValue, displayName, stageFromLeadStatus } from "./model";
import { dedupeKeys, departmentOf, formatPhone, normalizeEmail, normalizePhone, normalizePostalCode, normalizeTags, normalizeWebsite, splitFullName, stageFromText, tidyName, tidyPlace } from "./normalize";
import { ImportError, jsonToRows, looksLikeHeader, parseImportFile, parsePasted, tableOf } from "./parse";
import { parseVcard } from "./vcard";
import { columnIndex, readXlsx } from "./xlsx";

const encode = (text: string) => new TextEncoder().encode(text);

/** Archive ZIP minimale, pour fabriquer un classeur d'essai (chaque document stocké tel quel ou compressé). */
function zip(files: Record<string, string>, compress: boolean): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = encode(content);
    const data = compress ? new Uint8Array(deflateRawSync(raw)) : raw;
    const nameBytes = encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, compress ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(10, compress ? 8 : 0, true);
    header.setUint32(20, data.length, true);
    header.setUint32(24, raw.length, true);
    header.setUint16(28, nameBytes.length, true);
    header.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(header.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of all) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

const WORKBOOK = {
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml": `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Prospects &amp; pistes" sheetId="1" r:id="rId1"/><sheet name="Vide" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>Nom</t></si><si><t>Téléphone</t></si><si><t>Code postal</t></si><si><r><t>Cabinet </t></r><r><t xml:space="preserve">Dupont &amp; Fils</t></r><rPh><t>phonétique</t></rPh></si><si><t>Ville</t></si><si><t>Albi</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="E1" t="s"><v>4</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>612345678</v></c><c r="C2"><v>81000</v></c><c r="E2" t="s"><v>5</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Martin</t></is></c><c r="B3" t="str"><f>A1</f><v>05 63 00 00 00</v></c><c r="C3"><v>1000</v></c><c r="D3"/><c r="E3" t="inlineStr"><is><t>Bourg-en-Bresse</t></is></c></row>
    <row r="4"></row>
  </sheetData></worksheet>`,
  "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
};

describe("lecture CSV", () => {
  it("devine le séparateur : point-virgule d'Excel en France, virgule, tabulation", () => {
    expect(detectDelimiter("Nom;Ville;Tél\nDupont;Albi;0612\n")).toBe(";");
    expect(detectDelimiter("name,city\nDupont,Albi\n")).toBe(",");
    expect(detectDelimiter("Nom\tVille\nDupont\tAlbi\n")).toBe("\t");
    // Des virgules dans le texte ne trompent pas : c'est le point-virgule qui découpe régulièrement
    expect(detectDelimiter('Nom;Notes\n"Dupont, Claire";"a, b, c"\nMartin;rien\n')).toBe(";");
    expect(detectDelimiter("une seule colonne\nligne\n")).toBe(",");
  });

  it("guillemets, guillemet doublé, saut de ligne dans un champ, lignes vides et marque d'ordre des octets", () => {
    const text = `${String.fromCharCode(0xfeff)}Nom;Notes\r\n"Dupont; Claire";"dit ""Clo""\nsur deux lignes"\r\n\r\n;;\r\nMartin; espace \r\n`;
    expect(parseCsv(text)).toEqual([
      ["Nom", "Notes"],
      ["Dupont; Claire", 'dit "Clo"\nsur deux lignes'],
      ["Martin", "espace"],
    ]);
  });

  it("s'arrête au nombre de lignes demandé", () => {
    expect(parseCsv("a\nb\nc\nd\n", { maxRows: 2 })).toEqual([["a"], ["b"]]);
  });

  it("décode l'UTF-8, sinon le Windows-1252 des exports Excel", () => {
    expect(decodeText(encode("Hélène"))).toBe("Hélène");
    // « Hélène » en Windows-1252 : é = 0xE9, è = 0xE8
    expect(decodeText(new Uint8Array([0x48, 0xe9, 0x6c, 0xe8, 0x6e, 0x65]))).toBe("Hélène");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00]))).toBe("Aé");
  });
});

describe("lecture Excel (.xlsx)", () => {
  it("indice de colonne d'une référence de cellule", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA10")).toBe(26);
  });

  for (const compress of [false, true]) {
    it(`lit les feuilles d'un classeur ${compress ? "compressé" : "stocké tel quel"} : textes partagés, textes en ligne, nombres, cases sautées`, async () => {
      const sheets = await readXlsx(zip(WORKBOOK, compress));
      expect(sheets).toHaveLength(1);
      expect(sheets[0]!.name).toBe("Prospects & pistes");
      expect(sheets[0]!.rows).toEqual([
        ["Nom", "Téléphone", "Code postal", "", "Ville"],
        ["Cabinet Dupont & Fils", "612345678", "81000", "", "Albi"],
        ["Martin", "05 63 00 00 00", "1000", "", "Bourg-en-Bresse"],
      ]);
    });
  }

  it("refuse ce qui n'est pas un classeur", async () => {
    await expect(readXlsx(encode("pas une archive, juste du texte assez long pour la recherche"))).rejects.toThrow(/classeur Excel/);
    await expect(readXlsx(zip({ "autre.txt": "x" }, false))).rejects.toThrow(/classeur Excel/);
  });
});

describe("lecture vCard", () => {
  it("une fiche par ligne : nom, société, e-mail, mobile de préférence, adresse, lignes repliées et quoted-printable", () => {
    const text = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Dupont;Claire;;;",
      "FN:Claire Dupont",
      "ORG:Cabinet Dupont;Sophrologie",
      "TITLE:Sophrologue",
      "TEL;TYPE=WORK:05 63 00 00 00",
      "TEL;TYPE=CELL:06 12 34 56 78",
      "item1.EMAIL;TYPE=INTERNET:claire@exemple.fr",
      "ADR;TYPE=WORK:;;14 rue de la Berbie;Albi;;81000;France",
      "URL:https://www.exemple.fr",
      "NOTE:Rappeler le mardi\\, après 14 h",
      // Ligne repliée : la première espace marque la suite, la seconde appartient au texte
      "  et pas avant",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:H=C3=A9l=C3=A8ne Martin",
      "END:VCARD",
      "BEGIN:VCARD",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVcard(text)).toEqual([
      ["Claire", "Dupont", "Cabinet Dupont", "Sophrologue", "claire@exemple.fr", "06 12 34 56 78", "14 rue de la Berbie", "81000", "Albi", "https://www.exemple.fr", "Rappeler le mardi, après 14 h et pas avant"],
      ["Hélène", "Martin", "", "", "", "", "", "", "", "", ""],
    ]);
  });
});

describe("lecture d'un fichier, quel que soit son format", () => {
  it("reconnaît une ligne de titres", () => {
    expect(looksLikeHeader(["Nom", "E-mail", "Téléphone"])).toBe(true);
    expect(looksLikeHeader(["Dupont", "claire@exemple.fr", "0612345678"])).toBe(false);
    expect(looksLikeHeader(["Dupont", "Albi", "81000"])).toBe(false);
    expect(looksLikeHeader([])).toBe(false);
  });

  it("CSV, JSON, vCard et Excel sont reconnus à leur contenu", async () => {
    const csv = await parseImportFile("liste.csv", encode("Nom;Ville\nDupont;Albi\n"));
    expect(csv.format).toBe("csv");
    expect(tableOf(csv.sheets[0]!, csv.sheets[0]!.hasHeader)).toEqual({ headers: ["Nom", "Ville"], rows: [["Dupont", "Albi"]] });

    const json = await parseImportFile("export.json", encode(JSON.stringify({ results: [{ title: "Cabinet Dupont", phone: "+33612345678", address: { city: "Albi", zip: 81000 }, tags: ["a", "b"] }, { title: "Martin", email: "m@exemple.fr" }] })));
    expect(json.format).toBe("json");
    expect(json.sheets[0]!.rows).toEqual([
      ["title", "phone", "address.city", "address.zip", "tags", "email"],
      ["Cabinet Dupont", "+33612345678", "Albi", "81000", "a, b", ""],
      ["Martin", "", "", "", "", "m@exemple.fr"],
    ]);

    const vcard = await parseImportFile("contacts.txt", encode("BEGIN:VCARD\nFN:Claire Dupont\nEND:VCARD\n"));
    expect(vcard.format).toBe("vcard");
    expect(vcard.sheets[0]!.rows[1]!.slice(0, 2)).toEqual(["Claire", "Dupont"]);

    const xlsx = await parseImportFile("prospects.xlsx", zip(WORKBOOK, true));
    expect(xlsx.format).toBe("xlsx");
    expect(xlsx.sheets[0]!.hasHeader).toBe(true);
  });

  it("sans ligne de titres, les colonnes sont numérotées", () => {
    const pasted = parsePasted("Dupont\tclaire@exemple.fr\t0612345678\nMartin\tm@exemple.fr\t\n");
    expect(pasted.format).toBe("paste");
    expect(pasted.sheets[0]!.hasHeader).toBe(false);
    expect(tableOf(pasted.sheets[0]!, false).headers).toEqual(["Colonne 1", "Colonne 2", "Colonne 3"]);
  });

  it("refuse clairement un ancien .xls, un fichier vide ou un JSON sans liste", async () => {
    await expect(parseImportFile("ancien.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).rejects.toThrow(/\.xlsx ou en \.csv/);
    await expect(parseImportFile("vide.csv", new Uint8Array())).rejects.toBeInstanceOf(ImportError);
    expect(() => jsonToRows("texte")).toThrow(/liste de prospects/);
  });
});

describe("mise au propre", () => {
  it("e-mail : minuscules, forme « Nom <adresse> », première adresse d'une cellule, rejet de ce qui n'en est pas", () => {
    expect(normalizeEmail(" Claire.Dupont@Exemple.FR ")).toBe("claire.dupont@exemple.fr");
    expect(normalizeEmail("Claire <claire@exemple.fr>")).toBe("claire@exemple.fr");
    expect(normalizeEmail("mailto:a@b.fr; c@d.fr")).toBe("a@b.fr");
    expect(normalizeEmail("pas un mail")).toBe("");
    expect(normalizeEmail("a@b")).toBe("");
  });

  it("téléphone français sous toutes ses écritures, numéro étranger gardé, reste écarté", () => {
    for (const written of ["06 12 34 56 78", "06.12.34.56.78", "0612345678", "+33 6 12 34 56 78", "+33 (0)6 12 34 56 78", "0033612345678", "33612345678", "612345678", "tel:+33612345678", "06 12 34 56 78 / 05 63 00 00 00"]) {
      expect(normalizePhone(written), written).toBe("+33612345678");
    }
    expect(normalizePhone("+32 475 12 34 56")).toBe("+32475123456");
    expect(normalizePhone("12345")).toBe("");
    expect(normalizePhone("à venir")).toBe("");
    expect(formatPhone("+33612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+32475123456")).toBe("+32475123456");
  });

  it("code postal : zéro initial remis, département (Corse et outre-mer compris)", () => {
    expect(normalizePostalCode("1000")).toBe("01000");
    expect(normalizePostalCode("81000.0")).toBe("81000");
    expect(normalizePostalCode(" 75 011 ")).toBe("75011");
    expect(normalizePostalCode("B-1000")).toBe("B-1000");
    expect(departmentOf("81000")).toBe("81");
    expect(departmentOf("20000")).toBe("2A");
    expect(departmentOf("20200")).toBe("2B");
    expect(departmentOf("97400")).toBe("974");
    expect(departmentOf("B-1000")).toBe("");
  });

  it("site, étiquettes, noms", () => {
    expect(normalizeWebsite("www.Exemple.fr/")).toBe("https://www.exemple.fr");
    expect(normalizeWebsite("http://exemple.fr/cabinet?x=1")).toBe("http://exemple.fr/cabinet?x=1");
    expect(normalizeWebsite("pas un site")).toBe("");
    expect(normalizeWebsite("claire@exemple.fr")).toBe("");
    expect(normalizeTags("Albi; albi, #Sophro | à rappeler")).toEqual(["Albi", "Sophro", "à rappeler"]);
    expect(tidyName("DUPONT-MARTIN")).toBe("Dupont-Martin");
    expect(tidyName("d'ARTAGNAN")).toBe("d'ARTAGNAN");
    expect(tidyPlace("BOURG-EN-BRESSE")).toBe("Bourg-en-Bresse");
    expect(tidyPlace("l'isle-sur-la-sorgue")).toBe("L'Isle-sur-la-Sorgue");
    expect(tidyPlace("SAINT-RÉMY-DE-PROVENCE")).toBe("Saint-Rémy-de-Provence");
    expect(tidyPlace("LE MANS")).toBe("Le Mans");
    expect(tidyPlace("Aix-en-Provence")).toBe("Aix-en-Provence");
    expect(splitFullName("Claire Dupont")).toEqual({ firstName: "Claire", lastName: "Dupont" });
    expect(splitFullName("DUPONT Claire")).toEqual({ firstName: "Claire", lastName: "Dupont" });
    expect(splitFullName("Dupont, Claire")).toEqual({ firstName: "Claire", lastName: "Dupont" });
    expect(splitFullName("Mme Claire de la Fontaine")).toEqual({ firstName: "Claire", lastName: "de la Fontaine" });
    expect(splitFullName("Dupont")).toEqual({ firstName: "", lastName: "Dupont" });
  });

  it("étape lue dans un fichier, clés de doublon, nom affiché, valeur", () => {
    expect(stageFromText("RDV pris")).toBe("meeting");
    expect(stageFromText("Gagné")).toBe("won");
    expect(stageFromText("À contacter")).toBe("new");
    expect(stageFromText("contacted")).toBe("contacted");
    expect(stageFromText("bizarre")).toBeUndefined();
    expect(stageFromLeadStatus("demo_sent")).toBe("demo");
    expect(stageFromLeadStatus("new")).toBe("new");
    expect(dedupeKeys({ firstName: "Claire", lastName: "Dupont", company: "", city: "Albi", email: "C@Exemple.fr", phone: "+33612345678" })).toEqual(["e:c@exemple.fr", "p:+33612345678", "n:claire dupont|albi"]);
    // Un seul mot de nom dans une ville ne suffit pas à dire que c'est la même personne
    expect(dedupeKeys({ firstName: "", lastName: "Dupont", company: "", city: "Albi" })).toEqual([]);
    expect(displayName({ firstName: "", lastName: "", company: "Cabinet Dupont" })).toBe("Cabinet Dupont");
    expect(displayName({ firstName: "", lastName: "", company: "", email: "c@exemple.fr" })).toBe("c@exemple.fr");
    expect(contactMonthlyValue({ plan: "scale", billingPeriod: null })).toBe(86);
    expect(contactMonthlyValue({ plan: "starter", billingPeriod: "monthly" })).toBe(69);
    expect(contactMonthlyValue({ plan: null, billingPeriod: "annual" })).toBe(0);
  });
});

describe("correspondance des colonnes", () => {
  it("titres français d'un fichier de prospection", () => {
    const headers = ["Prénom", "Nom", "Cabinet", "Métier", "E-mail", "Téléphone portable", "Adresse", "Code postal", "Ville", "Site web", "Commentaires", "Statut", "Note Google"];
    expect(guessMapping(headers, [])).toEqual(["firstName", "lastName", "company", "profession", "email", "phone", "address", "postalCode", "city", "website", "notes", "stage", "extra"]);
  });

  it("export d'annuaire en anglais : le lien Google Maps ne prend pas la place du site", () => {
    const headers = ["title", "categoryName", "phone", "website", "url", "street", "city", "postalCode", "totalScore", "reviewsCount"];
    expect(guessMapping(headers, [["Cabinet Dupont", "Sophrologue", "+33 6 12 34 56 78", "https://exemple.fr", "https://maps.google.com/?cid=1", "14 rue de la Berbie", "Albi", "81000", "4.9", "34"]])).toEqual(["company", "profession", "phone", "website", "extra", "address", "city", "postalCode", "extra", "extra"]);
  });

  it("« nom complet » cède la place quand prénom et nom ont leur colonne ; « prénom » n'est pas pris pour « nom »", () => {
    expect(guessMapping(["Nom complet", "Prénom", "Nom"], [])).toEqual(["ignore", "firstName", "lastName"]);
    expect(guessMapping(["Prénom"], [])).toEqual(["firstName"]);
  });

  it("colonnes sans titre : devinées d'après leurs valeurs, vides ignorées", () => {
    const sample = [
      ["Dupont", "claire@exemple.fr", "06 12 34 56 78", "81000", "www.exemple.fr", ""],
      ["Martin", "m@exemple.fr", "05 63 00 00 00", "81100", "https://martin.fr", ""],
    ];
    expect(guessMapping(["Colonne 1", "Colonne 2", "Colonne 3", "Colonne 4", "Colonne 5", "Colonne 6"], sample)).toEqual(["extra", "email", "phone", "postalCode", "website", "ignore"]);
  });

  it("applique la correspondance : nom complet découpé, notes et adresses jointes, annexes gardées, lignes inutilisables écartées", () => {
    const headers = ["Contact", "Mail", "Tél", "Tél 2", "Rue", "Complément", "CP", "Ville", "Remarque", "Étiquettes", "Statut", "Note Google"];
    const mapping = ["fullName", "email", "phone", "phone", "address", "address", "postalCode", "city", "notes", "tags", "stage", "extra"] as const;
    const rows = [
      ["DUPONT Claire", "Claire@Exemple.fr", "pas de numéro", "06 12 34 56 78", "14 rue de la Berbie", "Bât. B", "81000", "ALBI", "À rappeler", "sophro; albi", "RDV", "4,9"],
      ["", "", "", "", "", "", "81000", "Albi", "", "", "", ""],
      ["Martin", "pas un mail", "", "", "", "", "1000", "bourg-en-bresse", "", "", "", ""],
    ];
    const { drafts, rejected } = applyMapping(headers, rows, [...mapping]);
    expect(rejected).toBe(1);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      firstName: "Claire",
      lastName: "Dupont",
      email: "claire@exemple.fr",
      phone: "+33612345678",
      address: "14 rue de la Berbie, Bât. B",
      postalCode: "81000",
      city: "Albi",
      notes: "À rappeler",
      tags: ["sophro", "albi"],
      stage: "meeting",
      extra: { "Tél": "pas de numéro", "Note Google": "4,9" },
    });
    expect(drafts[1]).toMatchObject({ firstName: "", lastName: "Martin", email: "", postalCode: "01000", city: "Bourg-en-Bresse", extra: { Mail: "pas un mail" } });
  });
});
