import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter, isCrossOriginRequest, requestIp } from "./rate-limit";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe("createMemoryRateLimiter", () => {
  it("accepte jusqu'à la limite puis refuse jusqu'à la fin de la fenêtre", () => {
    const limiter = createMemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("a", 1_000).allowed).toBe(true);
    expect(limiter.hit("a", 2_000).allowed).toBe(true);
    const refused = limiter.hit("a", 3_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(57);
    // Fenêtre écoulée : le compteur repart
    expect(limiter.hit("a", 60_000).allowed).toBe(true);
  });

  it("compte chaque clé à part et sait en remettre une à zéro", () => {
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("b", 0).allowed).toBe(true);
    expect(limiter.hit("a", 1).allowed).toBe(false);
    limiter.clear("a");
    expect(limiter.hit("a", 2).allowed).toBe(true);
  });

  it("ne garde jamais plus de clés que le plafond", () => {
    const limiter = createMemoryRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 100 });
    for (let i = 0; i < 1_000; i++) limiter.hit(`k${i}`, i);
    expect(limiter.size()).toBeLessThanOrEqual(100);
    // Les clés expirées sortent en premier
    const short = createMemoryRateLimiter({ limit: 5, windowMs: 10, maxKeys: 50 });
    for (let i = 0; i < 50; i++) short.hit(`k${i}`, 0);
    short.hit("neuve", 1_000);
    expect(short.size()).toBe(1);
  });
});

describe("requestIp", () => {
  it("prend la première adresse de x-forwarded-for, sinon x-real-ip", () => {
    expect(requestIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(requestIp(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(requestIp(headers({}))).toBe("0.0.0.0");
  });
});

describe("isCrossOriginRequest", () => {
  it("accepte l'origine servie et l'absence d'en-tête Origin", () => {
    expect(isCrossOriginRequest(headers({ host: "app.exemple.fr" }))).toBe(false);
    expect(isCrossOriginRequest(headers({ host: "app.exemple.fr", origin: "https://app.exemple.fr" }))).toBe(false);
    expect(isCrossOriginRequest(headers({ host: "interne:3000", "x-forwarded-host": "app.exemple.fr", origin: "https://app.exemple.fr" }))).toBe(false);
  });

  it("refuse un autre hôte, même voisin, et une origine illisible", () => {
    expect(isCrossOriginRequest(headers({ host: "app.exemple.fr", origin: "https://demo.exemple.fr" }))).toBe(true);
    expect(isCrossOriginRequest(headers({ host: "app.exemple.fr", origin: "null" }))).toBe(true);
  });
});
