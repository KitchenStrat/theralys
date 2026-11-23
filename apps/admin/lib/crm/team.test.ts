import { describe, expect, it } from "vitest";
import { PLAN_COMPLETE, PLAN_SCALE, PLAN_SITE } from "@theralys/db/plans";
import { parisMonthStart } from "./filters";
import { contactMonthlyValue } from "./model";
import { REP_STATUS_LABELS, activityLabel, activitySummary, activityTotal, emptyRepStats, repStatus, summarizeTeam, type TeamRows } from "./team-stats";

const JULIE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MARC = "11111111-2222-4333-8444-555555555555";
const ADMIN = "7b6e92c0-a7d3-4f96-9230-c5ad737bd0dc";

const none: TeamRows = { owned: [], activity: [], overdue: [], last: [] };
const owned = (ownerId: string | null, stage: string, count: number, plan: string | null = null, billingPeriod: string | null = null, wonThisMonth = 0) => ({ ownerId, stage, plan, billingPeriod, count, wonThisMonth });

describe("état d'un compte de commercial", () => {
  it("invitation en attente tant que le mot de passe n'est pas choisi, actif ensuite", () => {
    expect(repStatus({ invitePending: true, disabledAt: null })).toBe("pending");
    expect(repStatus({ invitePending: false, disabledAt: null })).toBe("active");
  });

  it("désactivé l'emporte, que le mot de passe ait été choisi ou non", () => {
    expect(repStatus({ invitePending: false, disabledAt: new Date() })).toBe("disabled");
    expect(repStatus({ invitePending: true, disabledAt: new Date() })).toBe("disabled");
    expect(REP_STATUS_LABELS).toEqual({ pending: "Invitation en attente", active: "Actif", disabled: "Désactivé" });
  });
});

describe("chiffres de l'équipe", () => {
  it("un commercial sans fiche ni activité a des chiffres à zéro", () => {
    const stats = summarizeTeam([JULIE], none);
    expect(stats.get(JULIE)).toEqual(emptyRepStats());
    expect(stats.get(JULIE)!.byStage.map((line) => line.stage)).toEqual(["new", "contacted", "qualified", "demo", "meeting", "proposal", "won", "lost"]);
  });

  it("prospects en cours et leur valeur : ni gagnés ni perdus, au prix de la formule envisagée", () => {
    const site = contactMonthlyValue({ plan: PLAN_SITE, billingPeriod: null });
    const complete = contactMonthlyValue({ plan: PLAN_COMPLETE, billingPeriod: "monthly" });
    expect(site).toBeGreaterThan(0);
    const stats = summarizeTeam([JULIE], {
      ...none,
      owned: [owned(JULIE, "new", 4), owned(JULIE, "meeting", 2, PLAN_SITE), owned(JULIE, "proposal", 1, PLAN_COMPLETE, "monthly"), owned(JULIE, "won", 3, PLAN_SITE), owned(JULIE, "lost", 5, PLAN_SITE)],
    }).get(JULIE)!;
    expect(stats.open).toBe(7);
    expect(stats.openMonthlyValue).toBe(2 * site + complete);
    expect(stats.total).toBe(15);
    expect(stats.byStage.find((line) => line.stage === "meeting")).toEqual({ stage: "meeting", count: 2, monthlyValue: 2 * site });
    expect(stats.byStage.find((line) => line.stage === "lost")).toEqual({ stage: "lost", count: 5, monthlyValue: 5 * site });
  });

  it("gagnés du mois : seuls les passages à « Client » depuis le 1er comptent, avec leur valeur mensuelle", () => {
    const site = contactMonthlyValue({ plan: PLAN_SITE, billingPeriod: null });
    const scale = contactMonthlyValue({ plan: PLAN_SCALE, billingPeriod: "triennial" });
    const stats = summarizeTeam([JULIE], {
      ...none,
      // 5 clients « Site » dont 2 ce mois-ci, 1 client « Scale » ce mois-ci, 1 client sans formule ce mois-ci
      owned: [owned(JULIE, "won", 5, PLAN_SITE, null, 2), owned(JULIE, "won", 1, PLAN_SCALE, "triennial", 1), owned(JULIE, "won", 1, null, null, 1), owned(JULIE, "proposal", 3, PLAN_SITE, null, 0)],
    }).get(JULIE)!;
    expect(stats.wonThisMonth).toBe(4);
    expect(stats.wonThisMonthValue).toBe(2 * site + scale);
    expect(stats.byStage.find((line) => line.stage === "won")!.count).toBe(7);
  });

  it("activité sur 7 et 30 jours par type : appels, e-mails, rendez-vous, notes — rien d'autre", () => {
    const stats = summarizeTeam([JULIE], {
      ...none,
      activity: [
        { authorId: JULIE, kind: "call", week: 3, month: 12 },
        { authorId: JULIE, kind: "email", week: 0, month: 4 },
        { authorId: JULIE, kind: "meeting", week: 1, month: 1 },
        { authorId: JULIE, kind: "note", week: 2, month: 9 },
        // Changements d'étape, tâches et lignes du CRM ne sont pas de l'activité commerciale
        { authorId: JULIE, kind: "stage", week: 7, month: 30 },
        { authorId: JULIE, kind: "task", week: 5, month: 5 },
        { authorId: JULIE, kind: "system", week: 1, month: 1 },
      ],
    }).get(JULIE)!;
    expect(stats.week).toEqual({ call: 3, email: 0, meeting: 1, note: 2 });
    expect(stats.month).toEqual({ call: 12, email: 4, meeting: 1, note: 9 });
    expect(activityTotal(stats.week)).toBe(6);
    expect(activityTotal(stats.month)).toBe(26);
  });

  it("chacun ses chiffres : les lignes d'un autre commercial, de l'admin ou sans propriétaire ne se mélangent pas", () => {
    const stats = summarizeTeam([JULIE, MARC], {
      owned: [owned(JULIE, "new", 2), owned(MARC, "new", 5), owned(ADMIN, "new", 40), owned(null, "new", 100), owned(JULIE, "trash:new", 9), owned(JULIE, "étape inconnue", 9)],
      activity: [
        { authorId: JULIE, kind: "call", week: 1, month: 1 },
        { authorId: MARC, kind: "call", week: 2, month: 2 },
        { authorId: ADMIN, kind: "call", week: 50, month: 50 },
        { authorId: null, kind: "call", week: 60, month: 60 },
      ],
      overdue: [
        { ownerId: JULIE, count: 3 },
        { ownerId: ADMIN, count: 8 },
        { ownerId: null, count: 8 },
      ],
      last: [
        { authorId: JULIE, at: "2026-11-20T10:00:00.000Z" },
        { authorId: MARC, at: null },
        { authorId: ADMIN, at: new Date("2026-11-22T10:00:00Z") },
      ],
    });
    expect([...stats.keys()]).toEqual([JULIE, MARC]);
    expect(stats.get(JULIE)).toMatchObject({ open: 2, total: 2, overdueTasks: 3, week: { call: 1 }, lastActivityAt: new Date("2026-11-20T10:00:00Z") });
    expect(stats.get(MARC)).toMatchObject({ open: 5, total: 5, overdueTasks: 0, week: { call: 2 }, lastActivityAt: null });
  });

  it("résumé d'activité en toutes lettres, accordé, sans les types à zéro", () => {
    expect(activitySummary({ call: 3, email: 1, meeting: 0, note: 2 })).toBe("3 appels · 1 e-mail · 2 notes");
    expect(activitySummary({ call: 1, email: 0, meeting: 2, note: 0 })).toBe("1 appel · 2 rendez-vous");
    expect(activitySummary({ call: 0, email: 0, meeting: 0, note: 0 })).toBe("aucune activité");
    expect(activityLabel("meeting", 1)).toBe("1 rendez-vous");
    expect(activityLabel("email", 12)).toBe("12 e-mails");
  });
});

describe("début du mois, heure de Paris", () => {
  it("le 1er à minuit à Paris, en heure d'hiver comme en heure d'été", () => {
    expect(parisMonthStart(new Date("2026-11-23T09:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(parisMonthStart(new Date("2026-07-14T09:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("exact les mois où l'heure change : le 1er reste à minuit, pas à 23 h ni à 1 h", () => {
    // Passage à l'heure d'hiver le 25 octobre 2026, à l'heure d'été le 29 mars 2026
    expect(parisMonthStart(new Date("2026-10-28T12:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(parisMonthStart(new Date("2026-03-30T12:00:00Z")).toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });

  it("le dernier soir du mois à Paris est encore dans le mois, la première minute du suivant n'y est plus", () => {
    expect(parisMonthStart(new Date("2026-11-30T22:59:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(parisMonthStart(new Date("2026-11-30T23:00:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
});
