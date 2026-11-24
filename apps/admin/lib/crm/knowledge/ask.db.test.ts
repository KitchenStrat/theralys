/**
 * Tests d'intégration de l'assistant du CRM sur une vraie base PostgreSQL :
 * ce qui est écrit dans la base commune selon ce que rend l'assistant (fiche
 * nouvelle, question reconnue, réponse validée intouchable, limite horaire).
 * Ignorés sans ADMIN_TEST_DATABASE_URL (la CI n'a pas de base) :
 *
 *   createdb theralys_admin_test
 *   pg_dump --schema-only --no-owner theralys | psql theralys_admin_test
 *   ADMIN_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys_admin_test \
 *     pnpm --filter @theralys/admin exec vitest run lib/crm/knowledge/ask.db.test.ts
 *
 * La base désignée est VIDÉE de ses fiches et de ses comptes d'essai à chaque
 * test : son nom doit finir par « _test », jamais celle de développement.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { SalesAnswer, SalesAssistant, SalesQuestionInput } from "@theralys/ai";
import type * as DbModule from "@theralys/db";
import type { CrmViewer } from "../access";
import type * as AskModule from "./ask";
import type * as StoreModule from "./store";

const URL = process.env.ADMIN_TEST_DATABASE_URL ?? "";
const enabled = /_test(\?|$)/.test(URL);

let db: DbModule.Database;
let schema: typeof DbModule;
let ask: typeof AskModule;
let store: typeof StoreModule;
let rep: CrmViewer;
let admin: CrmViewer;

/** Assistant simulé : rend ce que le test lui prépare, et garde ce qu'on lui a donné. */
function fakeAssistant(answers: (Partial<SalesAnswer> | Error)[], mode: SalesAssistant["mode"] = "anthropic") {
  const inputs: SalesQuestionInput[] = [];
  const assistant: SalesAssistant = {
    mode,
    answer: async (input) => {
      inputs.push(input);
      const next = answers.shift();
      if (!next) throw new Error("réponse non prévue par le test");
      if (next instanceof Error) throw next;
      return { sameAs: null, title: input.question, kind: "question", category: "tarifs", reply: "Réponse de l'assistant.", details: "- Un fait", covered: true, ...next };
    },
  };
  return { assistant, inputs };
}

const landing = vi.fn(async () => "Texte de la page publique.");
const entries = () => db.select().from(schema.crmKnowledge).orderBy(schema.crmKnowledge.createdAt);
const asks = () => db.select().from(schema.crmKnowledgeAsks);

describe.skipIf(!enabled)("assistant du CRM sur une vraie base", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    schema = await import("@theralys/db");
    ask = await import("./ask");
    store = await import("./store");
    db = schema.getDb();
  });

  beforeEach(async () => {
    landing.mockClear();
    await db.execute(sql`truncate crm_knowledge cascade`);
    await db.execute(sql`delete from rate_limits`);
    await db.execute(sql`delete from users where email like '%@assistant.test'`);
    const [seller] = await db.insert(schema.users).values({ email: "commerciale@assistant.test", passwordHash: "x", role: "sales", name: "Camille" }).returning({ id: schema.users.id });
    const [boss] = await db.insert(schema.users).values({ email: "admin@assistant.test", passwordHash: "x", role: "admin", name: "Direction" }).returning({ id: schema.users.id });
    rep = { id: seller!.id, role: "sales" };
    admin = { id: boss!.id, role: "admin" };
  });

  afterAll(async () => {
    await db?.execute(sql`delete from users where email like '%@assistant.test'`);
  });

  it("question nouvelle : une fiche au titre rendu par l'assistant, rangée, non relue, inscrite au journal de qui l'a posée", async () => {
    const { assistant, inputs } = fakeAssistant([{ title: "Le prix est-il trop élevé ?", kind: "objection", category: "tarifs", reply: "Je comprends.", details: "- 39 € en annuel" }]);
    const outcome = await ask.askHarmony(db, rep, "  C'est   trop cher  ", { assistant, landing });
    expect(outcome).toMatchObject({ ok: true, origin: "new", entry: { question: "Le prix est-il trop élevé ?", kind: "objection", category: "tarifs", status: "ai", askedCount: 1, authorName: "Camille", mine: true } });
    expect(await asks()).toMatchObject([{ userId: rep.id, asked: "C'est trop cher", askedKey: "c est trop cher" }]);
    // Ce que l'assistant a reçu : la question nettoyée, les rubriques, les faits du produit et la page publique
    expect(inputs[0]!.question).toBe("C'est trop cher");
    expect(inputs[0]!.categories.map((category) => category.id)).toContain("tarifs");
    expect(inputs[0]!.knowledge.product).toContain("12 mois minimum");
    expect(inputs[0]!.knowledge.landing).toBe("Texte de la page publique.");
    expect(landing).toHaveBeenCalledTimes(1);
  });

  it("la même question dans les mêmes mots : sa fiche, sans appel à l'assistant ; le compteur monte", async () => {
    const { assistant, inputs } = fakeAssistant([{ title: "Y a-t-il un engagement ?" }]);
    await ask.askHarmony(db, rep, "Vous engagez sur combien de temps ?", { assistant, landing });
    const again = await ask.askHarmony(db, admin, "vous engagez sur combien de temps", { assistant, landing });
    const byTitle = await ask.askHarmony(db, admin, "Y a-t-il un engagement ?", { assistant, landing });
    expect(again).toMatchObject({ ok: true, origin: "known", entry: { askedCount: 2, mine: true } });
    expect(byTitle).toMatchObject({ ok: true, origin: "known", entry: { askedCount: 3 } });
    expect(inputs).toHaveLength(1);
    expect(await entries()).toHaveLength(1);
    expect(await asks()).toHaveLength(3);
  });

  it("question reconnue par l'assistant, fiche non relue : la nouvelle réponse remplace l'ancienne, sans seconde fiche", async () => {
    const first = fakeAssistant([{ title: "Le prix est-il trop élevé ?", reply: "Ancienne réponse." }]);
    await ask.askHarmony(db, rep, "C'est trop cher", { assistant: first.assistant, landing });
    const second = fakeAssistant([{ sameAs: "f1", title: "Peu importe", kind: "objection", category: "offre", reply: "Nouvelle réponse.", details: "- Autre fait" }]);
    const outcome = await ask.askHarmony(db, rep, "Le prix me paraît élevé", { assistant: second.assistant, landing });
    expect(second.inputs[0]!.existing).toEqual([{ ref: "f1", question: "Le prix est-il trop élevé ?" }]);
    expect(outcome).toMatchObject({ ok: true, origin: "matched", entry: { question: "Le prix est-il trop élevé ?", reply: "Nouvelle réponse.", category: "offre", kind: "objection", askedCount: 2 } });
    expect(await entries()).toHaveLength(1);
  });

  it("question reconnue, fiche validée : la réponse de l'admin est rendue telle quelle, et elle nourrit l'assistant", async () => {
    const id = await store.saveValidatedEntry(db, admin.id, { question: "Y a-t-il un engagement ?", kind: "question", category: "tarifs", reply: "Oui, de 12 mois minimum.", details: "- 3 ans sur la formule 3 ans" });
    const { assistant, inputs } = fakeAssistant([{ sameAs: "f1", reply: "Une autre réponse.", covered: false }]);
    const outcome = await ask.askHarmony(db, rep, "Quel engagement pour vos formules ?", { assistant, landing });
    expect(inputs[0]!.knowledge.validated).toEqual([{ question: "Y a-t-il un engagement ?", reply: "Oui, de 12 mois minimum.", details: "- 3 ans sur la formule 3 ans" }]);
    expect(outcome).toMatchObject({ ok: true, origin: "matched", entry: { id, reply: "Oui, de 12 mois minimum.", status: "validated", askedCount: 1, authorName: "Direction", mine: true } });
    expect(await entries()).toHaveLength(1);
  });

  it("référence inconnue ou rubrique inventée : une fiche nouvelle, rangée dans « autres »", async () => {
    const { assistant } = fakeAssistant([{ sameAs: "f9", category: "inventée", title: "Une question sans rubrique ?" }]);
    const outcome = await ask.askHarmony(db, rep, "Une question sans rubrique", { assistant, landing });
    expect(outcome).toMatchObject({ ok: true, origin: "new", entry: { category: "autre" } });
  });

  it("sources insuffisantes : la fiche part à vérifier", async () => {
    const { assistant } = fakeAssistant([{ covered: false, reply: "Je n'ai pas cette information." }]);
    const outcome = await ask.askHarmony(db, rep, "Qui a fondé l'entreprise ?", { assistant, landing });
    expect(outcome).toMatchObject({ ok: true, entry: { status: "review" } });
  });

  it("assistant en panne : un message, rien d'écrit — ni la question ni l'erreur ne sortent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { assistant } = fakeAssistant([new Error("Requête déclinée")]);
    const outcome = await ask.askHarmony(db, rep, "Une question qui échoue ?", { assistant, landing });
    expect(outcome).toEqual({ ok: false, error: "La réponse n'a pas pu être rédigée. Réessayez dans un instant." });
    expect(await entries()).toHaveLength(0);
    expect(await asks()).toHaveLength(0);
    expect(error.mock.calls.flat().join(" ")).not.toContain("Une question qui échoue");
    error.mockRestore();
  });

  it("question trop courte ou trop longue : refusée avant tout, sans compter dans la limite", async () => {
    const { assistant, inputs } = fakeAssistant([]);
    expect(await ask.askHarmony(db, rep, "ok ?", { assistant, landing })).toMatchObject({ ok: false });
    expect(await ask.askHarmony(db, rep, "?!?!?!?!?!", { assistant, landing })).toMatchObject({ ok: false });
    expect(await ask.askHarmony(db, rep, "mot ".repeat(200), { assistant, landing })).toMatchObject({ ok: false });
    expect(inputs).toHaveLength(0);
    expect((await db.execute(sql`select count(*)::int as n from rate_limits`)).rows[0]).toEqual({ n: 0 });
  });

  it("limite horaire par personne : la question nouvelle de trop attend, une question connue reste servie, un collègue n'est pas freiné", async () => {
    const answers = Array.from({ length: ask.ASK_RATE_LIMIT.limit + 2 }, (_, i) => ({ title: `Question numéro ${i} ?` }));
    const { assistant, inputs } = fakeAssistant(answers);
    for (let i = 0; i < ask.ASK_RATE_LIMIT.limit; i++) expect((await ask.askHarmony(db, rep, `Ma question numéro ${i} sur le prix`, { assistant, landing })).ok).toBe(true);
    const refused = await ask.askHarmony(db, rep, "Une question de plus sur le prix", { assistant, landing });
    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok ? "" : refused.error).toContain("Beaucoup de questions en peu de temps");
    expect(inputs).toHaveLength(ask.ASK_RATE_LIMIT.limit);
    expect(await ask.askHarmony(db, rep, "Ma question numéro 3 sur le prix", { assistant, landing })).toMatchObject({ ok: true, origin: "known" });
    expect(await ask.askHarmony(db, admin, "La question d'un collègue sur le prix", { assistant, landing })).toMatchObject({ ok: true, origin: "new" });
  });

  it("mode démonstration : la page publique n'est pas relue (aucun appel réseau)", async () => {
    const { assistant } = fakeAssistant([{}], "mock");
    await ask.askHarmony(db, rep, "Une question en démonstration ?", { assistant, landing });
    expect(landing).not.toHaveBeenCalled();
  });

  it("relecture demandée, validation, correction, suppression : chaque geste fait ce qu'il dit, et rien d'autre", async () => {
    const { assistant } = fakeAssistant([{ title: "Première question posée ?" }, { title: "Seconde question posée ?" }]);
    const first = await ask.askHarmony(db, rep, "Première question posée", { assistant, landing });
    const second = await ask.askHarmony(db, rep, "Seconde question posée", { assistant, landing });
    if (!first.ok || !second.ok) throw new Error("préparation");
    // Demander une relecture : seulement sur une réponse de l'assistant non relue
    expect(await store.flagEntry(db, first.entry.id)).toBe(true);
    expect(await store.flagEntry(db, first.entry.id)).toBe(false);
    expect(await store.validateEntry(db, admin.id, first.entry.id)).toBe(true);
    expect(await store.flagEntry(db, first.entry.id)).toBe(false);
    // Une réponse validée n'est jamais remplacée par l'assistant
    await store.refreshUnvalidated(db, first.entry.id, { kind: "objection", category: "offre", reply: "Écrasée ?", details: "" }, "ai");
    const [kept] = await db.select().from(schema.crmKnowledge).where(eq(schema.crmKnowledge.id, first.entry.id));
    expect(kept).toMatchObject({ reply: "Réponse de l'assistant.", status: "validated", validatedBy: admin.id });
    // Corriger : la fiche garde son auteur et son compteur, prend la réponse de l'admin
    expect(await store.saveValidatedEntry(db, admin.id, { question: "Seconde question, corrigée ?", kind: "question", category: "site", reply: "La bonne réponse.", details: "" }, second.entry.id)).toBe(second.entry.id);
    const [fixed] = await db.select().from(schema.crmKnowledge).where(eq(schema.crmKnowledge.id, second.entry.id));
    expect(fixed).toMatchObject({ question: "Seconde question, corrigée ?", questionKey: "seconde question corrigee", reply: "La bonne réponse.", status: "validated", authorId: rep.id, askedCount: 1 });
    // Supprimer : la fiche et son journal
    expect(await store.deleteEntry(db, second.entry.id)).toBe(true);
    expect(await store.deleteEntry(db, second.entry.id)).toBe(false);
    expect(await store.saveValidatedEntry(db, admin.id, { question: "Fiche disparue ?", kind: "question", category: "site", reply: "x", details: "" }, second.entry.id)).toBeNull();
    expect((await asks()).map((line) => line.entryId)).toEqual([first.entry.id]);
  });

  it("lecture de la base : filtres, recherche littérale, mes questions, volumes, activité de l'équipe", async () => {
    const { assistant } = fakeAssistant([
      { title: "Le prix est-il trop élevé ?", kind: "objection", category: "tarifs" },
      { title: "Puis-je garder mon nom de domaine ?", category: "site", covered: false },
      { title: "Remise de 100% possible ?", category: "tarifs" },
    ]);
    await ask.askHarmony(db, rep, "C'est trop cher", { assistant, landing });
    await ask.askHarmony(db, rep, "C'est trop cher", { assistant, landing });
    await ask.askHarmony(db, admin, "Je garde mon domaine ?", { assistant, landing });
    await ask.askHarmony(db, admin, "Une remise de 100% ?", { assistant, landing });
    const base = { q: "", category: "", kind: "", status: "", mine: false, sort: "asked" } as const;
    expect((await store.listKnowledge(db, rep, base)).map((row) => row.question)[0]).toBe("Le prix est-il trop élevé ?");
    expect(await store.listKnowledge(db, rep, { ...base, kind: "objection" })).toHaveLength(1);
    expect(await store.listKnowledge(db, rep, { ...base, status: "review" })).toHaveLength(1);
    expect(await store.listKnowledge(db, rep, { ...base, category: "tarifs" })).toHaveLength(2);
    expect((await store.listKnowledge(db, rep, { ...base, mine: true })).map((row) => row.mine)).toEqual([true]);
    expect(await store.listKnowledge(db, rep, { ...base, q: "DOMAINE" })).toHaveLength(1);
    // « % » et « _ » sont cherchés tels quels
    expect(await store.listKnowledge(db, rep, { ...base, q: "100%" })).toHaveLength(1);
    expect(await store.listKnowledge(db, rep, { ...base, q: "%" })).toHaveLength(1);
    expect(await store.listKnowledge(db, rep, { ...base, q: "_" })).toHaveLength(0);
    expect(await store.knowledgeCounts(db)).toMatchObject({ total: 3, review: 1, objections: 1, categories: { tarifs: 2, site: 1, offre: 0 } });
    const activity = await store.askActivity(db, new Date(Date.now() - 86_400_000));
    expect(activity.map((line) => [line.name, line.count])).toEqual([["Camille", 2], ["Direction", 2]]);
    expect(await store.askActivity(db, new Date(Date.now() + 86_400_000))).toEqual([]);
  });
});
