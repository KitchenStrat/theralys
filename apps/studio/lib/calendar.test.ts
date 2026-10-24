import { describe, expect, it } from "vitest";
import {
  clampIsoDay,
  formatDayFr,
  ofMonthFr,
  parisDay,
  parseMonthParam,
  shiftIsoDay,
} from "./calendar";

const now = new Date("2026-10-23T12:00:00Z");

describe("parseMonthParam", () => {
  it("lit YYYY-MM dans la plage acceptée", () => {
    expect(parseMonthParam("2026-11", now)).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2100-1", now)).toEqual({ year: 2100, month: 1 });
    expect(parseMonthParam("2000-12", now)).toEqual({ year: 2000, month: 12 });
  });

  it("retombe sur le mois courant hors plage ou mal formé (plus de RangeError)", () => {
    const current = { year: 2026, month: 10 };
    for (const bad of ["300000-01", "1e9-1", "-5-03", "1999-12", "2101-01", "2026-13", "2026-00", "", "abc", undefined]) {
      expect(parseMonthParam(bad, now)).toEqual(current);
    }
  });
});

describe("formatDayFr", () => {
  it("formate une date civile telle quelle", () => {
    expect(formatDayFr("2026-11-06")).toBe("6 nov.");
    expect(formatDayFr("2026-11-12", "long")).toBe("jeudi 12 novembre");
    expect(formatDayFr("2026-12-12", "day")).toBe("12 décembre");
  });

  it("rend un horodatage au jour civil Europe/Paris", () => {
    // 23 h 30 UTC = 0 h 30 à Paris le lendemain (hiver et été)
    expect(formatDayFr("2026-11-05T23:30:00.000Z")).toBe("6 nov.");
    expect(formatDayFr("2026-07-14T23:30:00.000Z")).toBe("15 juil.");
    expect(formatDayFr("2026-11-06T10:00:00.000Z", "day")).toBe("6 novembre");
  });

  it("renvoie la chaîne brute si elle n'est pas une date", () => {
    expect(formatDayFr("n/a")).toBe("n/a");
  });
});

describe("parisDay / shiftIsoDay / clampIsoDay", () => {
  it("donne le jour civil de Paris, pas le jour UTC", () => {
    expect(parisDay(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-06");
    expect(parisDay(new Date("2026-11-06T10:00:00Z"))).toBe("2026-11-06");
    expect(parisDay(new Date("2026-07-31T22:30:00Z"))).toBe("2026-08-01");
  });

  it("décale et borne des jours « YYYY-MM-DD »", () => {
    expect(shiftIsoDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftIsoDay("2026-10-23", 120)).toBe("2027-02-20");
    expect(clampIsoDay("2027-03-02", "2026-10-24", "2027-02-20")).toBe("2027-02-20");
    expect(clampIsoDay("2026-10-01", "2026-10-24", "2027-02-20")).toBe("2026-10-24");
    expect(clampIsoDay("2026-11-03", "2026-10-24", "2027-02-20")).toBe("2026-11-03");
  });
});

describe("ofMonthFr", () => {
  it("élide devant une voyelle", () => {
    expect(ofMonthFr("2026-10-23")).toBe("d'octobre");
    expect(ofMonthFr("2026-08-01")).toBe("d'août");
    expect(ofMonthFr("2026-04-01")).toBe("d'avril");
    expect(ofMonthFr("2026-11-01")).toBe("de novembre");
    expect(ofMonthFr("2026-01-01")).toBe("de janvier");
  });
});
