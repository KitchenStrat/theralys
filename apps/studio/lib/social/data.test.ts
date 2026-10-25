import { describe, expect, it } from "vitest";
import { computeSocialMonthState, isMissingSchemaError, type SocialMonthPostLite } from "./data";
import { mergeArticles } from "./brief";

// Novembre 2026 vu depuis le 23 octobre : 8 créneaux cadence (mar/ven), aucun article
const base = { year: 2026, month: 11, now: new Date("2026-10-23T12:00:00Z"), articles: [] };
const CADENCE = ["2026-11-03", "2026-11-06", "2026-11-10", "2026-11-13", "2026-11-17", "2026-11-20", "2026-11-24", "2026-11-27"];

function calendarPost(date: string, extra: Partial<SocialMonthPostLite> = {}): SocialMonthPostLite {
  return { scheduledFor: date, source: "calendar", status: "ready", downloadedAt: null, ...extra };
}

describe("computeSocialMonthState", () => {
  it("mois vierge : tous les créneaux sont à pourvoir", () => {
    const state = computeSocialMonthState({ ...base, posts: [] });
    expect(state.slots.map((s) => s.date)).toEqual(CADENCE);
    expect(state.freeSlots).toHaveLength(8);
    expect(state.calendarCount).toBe(0);
    expect(state.toDownload).toBe(0);
  });

  it("mois complet : aucun créneau libre, compteurs par statut", () => {
    const posts = CADENCE.map((d, i) =>
      calendarPost(d, i === 0 ? { status: "published", downloadedAt: new Date() } : i === 1 ? { downloadedAt: new Date() } : {}),
    );
    const state = computeSocialMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(8);
    expect(state.published).toBe(1);
    expect(state.downloaded).toBe(1); // le publié n'est pas recompté comme téléchargé
    expect(state.toDownload).toBe(6);
  });

  it("changer la date d'un contenu ne libère pas de créneau", () => {
    const posts = CADENCE.map((d) => calendarPost(d));
    posts[0] = calendarPost("2026-11-04"); // déplacé du mardi 3 au mercredi 4
    const state = computeSocialMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(8);
  });

  it("archiver ne permet pas de regénérer : l'archivé compte comme créneau pourvu", () => {
    const posts = CADENCE.map((d, i) => calendarPost(d, i < 3 ? { status: "archived" } : {}));
    const state = computeSocialMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(5); // affichés
    expect(state.toDownload).toBe(5);
  });

  it("plan partiel : les N premiers créneaux non occupés, N = manquants", () => {
    // 6 contenus rendus sur 8 créneaux, dont un déplacé hors cadence
    const posts = [...CADENCE.slice(0, 5).map((d) => calendarPost(d)), calendarPost("2026-11-25")];
    const state = computeSocialMonthState({ ...base, posts });
    expect(state.freeSlots.map((s) => s.date)).toEqual(["2026-11-20", "2026-11-24"]);
  });

  it("les contenus sur mesure n'occupent pas de créneau et sont comptés à part", () => {
    const posts = [
      ...CADENCE.map((d) => calendarPost(d)),
      { scheduledFor: "2026-11-03", source: "request" as const, status: "ready" as const, downloadedAt: null },
      { scheduledFor: "2026-11-11", source: "request" as const, status: "archived" as const, downloadedAt: null },
    ];
    const state = computeSocialMonthState({ ...base, posts });
    expect(state.requestCount).toBe(1);
    expect(state.calendarCount).toBe(8);
    expect(state.toDownload).toBe(9);
    expect(state.freeSlots).toEqual([]);
  });

  it("créneau « nouvel article » : à pourvoir tant que le calendrier n'a pas autant de contenus que de créneaux", () => {
    const articles = [{ id: "a1", publishAt: new Date("2026-11-04T08:00:00Z") }];
    const state = computeSocialMonthState({ ...base, articles, posts: CADENCE.map((d) => calendarPost(d)) });
    expect(state.slots).toHaveLength(9);
    expect(state.freeSlots.map((s) => s.kind)).toEqual(["nouvel_article"]);
    expect(state.freeSlots[0]?.articleId).toBe("a1");
  });

  it("jours de publication des réglages : créneaux lundi/jeudi, contenus mardi/vendredi déjà préparés sans créneau libre supplémentaire", () => {
    const state = computeSocialMonthState({ ...base, posts: [], postDays: [1, 4] });
    expect(state.slots.map((s) => s.date)).toEqual([
      "2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23", "2026-11-26", "2026-11-30",
    ]);
    expect(state.freeSlots).toHaveLength(9);
    // Changement de jours après préparation : 8 contenus du calendrier existent → 1 seul créneau à pourvoir, le premier non occupé
    const prepared = computeSocialMonthState({ ...base, posts: CADENCE.map((d) => calendarPost(d)), postDays: [1, 4] });
    expect(prepared.freeSlots.map((s) => s.date)).toEqual(["2026-11-02"]);
    expect(prepared.calendarCount).toBe(8);
  });

  it("mois déjà préparé : les jours de la préparation (planDays) priment sur les réglages actuels", () => {
    // Préparé en mardi/vendredi, réglages passés ensuite à lundi/jeudi : aucun créneau ne se rouvre
    const posts = CADENCE.map((d) => ({ ...calendarPost(d), content: { planDays: [2, 5] } }));
    const state = computeSocialMonthState({ ...base, posts, postDays: [1, 4] });
    expect(state.slots.map((s) => s.date)).toEqual(CADENCE);
    expect(state.freeSlots).toEqual([]);
    // Plan partiel préparé en lundi/jeudi : les manquants suivent lundi/jeudi, pas les réglages actuels (mardi/vendredi)
    const monThu = computeSocialMonthState({ ...base, posts: [], postDays: [1, 4] }).slots.map((s) => s.date);
    const partial = computeSocialMonthState({
      ...base,
      posts: monThu.slice(0, 3).map((d) => ({ ...calendarPost(d), content: { planDays: [1, 4] } })),
      postDays: [2, 5],
    });
    expect(partial.slots.map((s) => s.date)).toEqual(monThu);
    expect(partial.freeSlots.map((s) => s.date)).toEqual(monThu.slice(3));
    // Contenus sans planDays (préparés avant cette version) : réglages actuels
    const legacy = computeSocialMonthState({ ...base, posts: CADENCE.slice(0, 2).map((d) => calendarPost(d)), postDays: [1, 4] });
    expect(legacy.slots.map((s) => s.date)).toEqual(monThu);
  });

  it("mois en cours : seuls les créneaux à venir comptent, jamais de manquant négatif", () => {
    const state = computeSocialMonthState({
      ...base,
      now: new Date("2026-11-20T12:00:00Z"),
      posts: CADENCE.map((d) => calendarPost(d)),
    });
    expect(state.slots.map((s) => s.date)).toEqual(["2026-11-24", "2026-11-27"]);
    expect(state.freeSlots).toEqual([]);
  });
});

describe("isMissingSchemaError", () => {
  it("reconnaît une relation absente, directe ou enveloppée (DrizzleQueryError)", () => {
    const pg = Object.assign(new Error('relation "social_posts" does not exist'), { code: "42P01" });
    expect(isMissingSchemaError(pg)).toBe(true);
    expect(isMissingSchemaError(new Error("Failed query", { cause: pg }))).toBe(true);
    expect(isMissingSchemaError(Object.assign(new Error("enum absent"), { code: "42704" }))).toBe(true);
  });

  it("laisse passer les autres erreurs", () => {
    expect(isMissingSchemaError(new Error("timeout"))).toBe(false);
    expect(isMissingSchemaError(Object.assign(new Error("unique"), { code: "23505" }))).toBe(false);
    expect(isMissingSchemaError("boom")).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});

describe("mergeArticles", () => {
  const art = (id: string, content = "texte") => ({ id, content });

  it("sans article imposé : la liste récente telle quelle", () => {
    const recent = [art("r1"), art("r2")];
    expect(mergeArticles([], recent)).toBe(recent);
  });

  it("avec articles imposés : ils passent devant, complétés des récents jusqu'à 8", () => {
    const recent = Array.from({ length: 12 }, (_, i) => art(`r${i}`));
    const merged = mergeArticles([art("a1"), art("r3")], recent);
    expect(merged).toHaveLength(8);
    expect(merged.slice(0, 2).map((a) => a.id)).toEqual(["a1", "r3"]);
    expect(merged.map((a) => a.id)).not.toContain("r9");
    expect(new Set(merged.map((a) => a.id)).size).toBe(8); // r3 pas en double
  });

  it("ignore les récents sans contenu (écartés par le brief) pour garder la place", () => {
    const merged = mergeArticles([art("a1")], [art("vide", "  "), art("r1"), art("r2")]);
    expect(merged.map((a) => a.id)).toEqual(["a1", "r1", "r2"]);
  });
});
