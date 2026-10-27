import { describe, expect, it } from "vitest";
import { isInvalidEnumError, isMissingColumnError, pgErrorCode } from "./pg-errors";

const pg = (code: string, message = "erreur") => Object.assign(new Error(message), { code });

describe("pgErrorCode", () => {
  it("lit le code SQLSTATE d'une erreur directe ou en cause d'une erreur drizzle", () => {
    expect(pgErrorCode(pg("42703"))).toBe("42703");
    expect(pgErrorCode(new Error("Failed query", { cause: pg("22P02") }))).toBe("22P02");
    expect(pgErrorCode(new Error("a", { cause: new Error("b", { cause: pg("42P01") }) }))).toBe("42P01");
  });

  it("ignore les codes qui ne sont pas des SQLSTATE et s'arrête à quatre niveaux", () => {
    expect(pgErrorCode(Object.assign(new Error("réseau"), { code: "ECONNRESET" }))).toBeNull();
    expect(pgErrorCode(Object.assign(new Error("num"), { code: 42703 }))).toBeNull();
    expect(pgErrorCode(new Error("sans code"))).toBeNull();
    expect(pgErrorCode("boom")).toBeNull();
    expect(pgErrorCode(null)).toBeNull();
    let deep: Error = pg("22P02");
    for (let i = 0; i < 4; i++) deep = new Error(`niveau ${i}`, { cause: deep });
    expect(pgErrorCode(deep)).toBeNull();
  });
});

describe("isInvalidEnumError / isMissingColumnError", () => {
  it("22P02 : valeur d'enum absente (call_click avant la migration 0005), directe ou enveloppée", () => {
    const enumErr = pg("22P02", 'invalid input value for enum analytics_event_type: "call_click"');
    expect(isInvalidEnumError(enumErr)).toBe(true);
    expect(isInvalidEnumError(new Error("Failed query: insert into analytics_events", { cause: enumErr }))).toBe(true);
    expect(isInvalidEnumError(pg("42703"))).toBe(false);
    expect(isInvalidEnumError(new Error("timeout"))).toBe(false);
  });

  it("42703 : colonne absente (source avant la migration 0004)", () => {
    expect(isMissingColumnError(pg("42703"))).toBe(true);
    expect(isMissingColumnError(new Error("Failed query", { cause: pg("42703") }))).toBe(true);
    expect(isMissingColumnError(pg("22P02"))).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });
});
