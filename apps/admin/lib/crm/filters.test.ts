import { describe, expect, it } from "vitest";
import { csvCell, exportCsv, EXPORT_HEADERS, type ExportRow } from "./export";
import { EMPTY_FILTERS, activeCriteria, criterionLabel, filtersHref, filtersToParams, parisDayBounds, parseFilters, withoutCriterion } from "./filters";
import { dateInputValue, dueDateFromInput, dueLabel } from "./format";
import { TRASH_PREFIX, isTrashed, stageOf } from "./model";
import { matchProfession } from "./professions";

describe("filtres de la liste, portés par l'adresse", () => {
  it("lit les critères connus et ignore le reste", () => {
    const filters = parseFilters({
      vue: "liste",
      q: "  dupont   albi ",
      etape: "new,meeting,inconnue,new",
      source: "landing",
      metier: "Sophrologue",
      ville: "Albi",
      dept: "2a",
      tag: "salon",
      liste: "b6bed027-6656-4734-926f-501605751fdc",
      joindre: "email",
      action: "overdue",
      cree: "30",
      relance: "never",
      formule: "scale",
      opposition: "hide",
      tri: "name",
      page: "3",
      autre: "x",
    });
    expect(filters).toEqual({
      view: "liste",
      q: "dupont albi",
      stages: ["new", "meeting"],
      source: "landing",
      profession: "Sophrologue",
      city: "Albi",
      department: "2A",
      tag: "salon",
      importId: "b6bed027-6656-4734-926f-501605751fdc",
      reach: "email",
      action: "overdue",
      created: "30",
      touched: "never",
      plan: "scale",
      dnc: "hide",
      sort: "name",
      page: 3,
    });
  });

  it("valeurs inconnues ou dangereuses : retour aux valeurs par défaut", () => {
    expect(parseFilters({ joindre: "tout", action: "drop table", liste: "pas-un-uuid", dept: "'; --", tri: "prix", page: "-4", vue: "autre" })).toEqual(EMPTY_FILTERS);
    expect(parseFilters({ page: "abc" }).page).toBe(1);
    expect(parseFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("aller-retour avec l'adresse : seules les valeurs choisies y figurent", () => {
    expect(filtersHref(EMPTY_FILTERS)).toBe("/crm");
    const filters = { ...EMPTY_FILTERS, q: "dupont", stages: ["new", "won"] as const, action: "today" as const, sort: "action" as const, page: 2 };
    const href = filtersHref({ ...filters, stages: [...filters.stages] });
    expect(href).toBe("/crm?q=dupont&etape=new%2Cwon&action=today&tri=action&page=2");
    expect(parseFilters(new URL(href, "https://x.test").searchParams)).toEqual({ ...filters, stages: ["new", "won"] });
    expect(filtersToParams({ ...EMPTY_FILTERS, view: "liste" }).toString()).toBe("vue=liste");
    expect(parseFilters({}).view).toBe("pipeline");
  });

  it("critères actifs, leurs libellés, et le retrait d'un seul", () => {
    const filters = { ...EMPTY_FILTERS, q: "albi", stages: ["meeting" as const], department: "81", importId: "b6bed027-6656-4734-926f-501605751fdc", action: "overdue" as const, page: 4 };
    expect(activeCriteria(filters)).toEqual(["q", "stages", "department", "importId", "action"]);
    expect(criterionLabel(filters, "stages")).toBe("Étape : Rendez-vous");
    expect(criterionLabel(filters, "importId", { "b6bed027-6656-4734-926f-501605751fdc": "salon.csv" })).toBe("Liste : salon.csv");
    expect(criterionLabel(filters, "action")).toBe("Tâche en retard");
    expect(withoutCriterion(filters, "stages")).toMatchObject({ stages: [], q: "albi", page: 1 });
    expect(activeCriteria(EMPTY_FILTERS)).toEqual([]);
  });
});

describe("journée de Paris", () => {
  it("bornes d'aujourd'hui en heure d'hiver et en heure d'été", () => {
    const winter = parisDayBounds(new Date("2026-11-18T10:30:00Z"));
    expect(winter.start.toISOString()).toBe("2026-11-17T23:00:00.000Z");
    expect(winter.end.toISOString()).toBe("2026-11-18T23:00:00.000Z");
    const summer = parisDayBounds(new Date("2026-07-01T22:30:00Z"));
    // 22 h 30 UTC en été : déjà le 2 juillet à Paris
    expect(summer.start.toISOString()).toBe("2026-07-01T22:00:00.000Z");
    expect(summer.end.toISOString()).toBe("2026-07-02T22:00:00.000Z");
  });

  it("jour du changement d'heure : la journée fait 25 heures", () => {
    const bounds = parisDayBounds(new Date("2026-10-25T12:00:00Z"));
    expect(bounds.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("jour du passage à l'heure d'été : la journée fait 23 heures", () => {
    const bounds = parisDayBounds(new Date("2026-03-29T12:00:00Z"));
    expect(bounds.start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("échéances : en retard, aujourd'hui, demain, plus tard", () => {
    const now = new Date("2026-11-18T10:30:00Z");
    expect(dueLabel(new Date("2026-11-17T11:00:00Z"), now)).toEqual({ text: "en retard depuis hier", tone: "danger" });
    expect(dueLabel(new Date("2026-11-14T11:00:00Z"), now)).toEqual({ text: "en retard de 4 jours", tone: "danger" });
    expect(dueLabel(new Date("2026-11-18T11:00:00Z"), now)).toEqual({ text: "aujourd'hui", tone: "warning" });
    expect(dueLabel(new Date("2026-11-19T11:00:00Z"), now)).toEqual({ text: "demain", tone: "neutral" });
    expect(dueLabel(new Date("2026-11-25T11:00:00Z"), now).tone).toBe("neutral");
  });

  it("une échéance saisie comme un jour tombe ce jour-là à Paris", () => {
    expect(dueDateFromInput("2026-11-20")).toBe("2026-11-20T11:00:00.000Z");
    expect(dueDateFromInput("2026-07-20")).toBe("2026-07-20T10:00:00.000Z");
    expect(dueDateFromInput("20/11/2026")).toBeNull();
    expect(dateInputValue(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
  });
});

describe("export CSV", () => {
  const row: ExportRow = {
    firstName: "Claire",
    lastName: "Dupont",
    company: "Cabinet ; Dupont",
    profession: "Sophrologue",
    email: "claire@exemple.fr",
    phone: "+33612345678",
    address: "14 rue de la Berbie",
    postalCode: "81000",
    city: "Albi",
    website: null,
    stage: "meeting",
    source: "landing",
    tags: ["salon", "à rappeler"],
    plan: "scale",
    billingPeriod: "annual",
    nextAction: "=HYPERLINK(\"http://x\")",
    nextActionAt: new Date("2026-11-20T11:00:00Z"),
    lastContactAt: null,
    doNotContact: true,
    notes: 'dit "oui"\nsur deux lignes',
    createdAt: new Date("2026-11-18T10:00:00Z"),
  };

  it("une cellule qui ressemble à une formule est neutralisée ; guillemets, points-virgules et sauts de ligne sont protégés", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+33612345678")).toBe("'+33612345678");
    expect(csvCell("-12")).toBe("'-12");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell("simple")).toBe("simple");
  });

  it("en-tête, marque d'ordre des octets, libellés en clair", () => {
    const csv = exportCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header).toBe(EXPORT_HEADERS.join(";"));
    expect(line).toContain('Claire;Dupont;"Cabinet ; Dupont";Sophrologue;claire@exemple.fr;06 12 34 56 78;14 rue de la Berbie;81000;Albi;;Rendez-vous;Demande sur la vitrine;salon, à rappeler;Site + Scale (annuel);');
    expect(line).toContain(`"'=HYPERLINK(""http://x"")";20/11/2026;;oui;`);
    expect(csv.endsWith('18/11/2026\r\n')).toBe(true);
  });
});

describe("métier d'une fiche repris dans la fenêtre « Créer une démo »", () => {
  it("égalité, ou rapprochement entre le praticien et sa discipline ; rien quand c'est incertain", () => {
    expect(matchProfession("Psychologue")).toBe("Psychologue");
    expect(matchProfession("Ostéopathe")).toBe("Ostéopathie");
    expect(matchProfession("sophrologue")).toBe("Sophrologie");
    expect(matchProfession("Naturopathe")).toBe("Naturopathie");
    expect(matchProfession("Hypnothérapeute")).toBe("Hypnothérapie / hypnose ericksonienne");
    expect(matchProfession("Réflexologue plantaire")).toBe("Réflexologie (plantaire, palmaire, faciale)");
    expect(matchProfession("Kinésiologue")).toBe("Kinésiologie");
    // Kinésithérapeute n'est pas kinésiologue : pas de rapprochement hasardeux
    expect(matchProfession("Kinésithérapeute")).toBe("");
    expect(matchProfession("Coach")).toBe("");
    expect(matchProfession("")).toBe("");
  });
});

describe("corbeille : l'étape d'origine reste lisible", () => {
  it("reconnaît une fiche supprimée et l'étape qu'elle retrouvera", () => {
    expect(isTrashed("meeting")).toBe(false);
    expect(isTrashed(`${TRASH_PREFIX}meeting`)).toBe(true);
    expect(stageOf("meeting")).toBe("meeting");
    expect(stageOf(`${TRASH_PREFIX}meeting`)).toBe("meeting");
    expect(stageOf(`${TRASH_PREFIX}won`)).toBe("won");
  });

  it("étape inconnue : retour au début du pipeline", () => {
    expect(stageOf("")).toBe("new");
    expect(stageOf(`${TRASH_PREFIX}ancienne`)).toBe("new");
  });
});
